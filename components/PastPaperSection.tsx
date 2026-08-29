'use client';

import React, { useState, useEffect } from 'react';
import { Bot, CheckCircle2, AlertCircle, Loader2, Trash2, RotateCcw } from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  updateDoc, 
  where, 
  writeBatch, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

type AttemptStatus = 'INCOMPLETE' | 'PENDING' | 'COMPLETED';

interface PaperAttempt {
  id: string;
  paperTitle: string;
  questionLabel?: string;
  questionNumber?: number;
  questionPart?: string;
  parentPaperId?: string;
  subjectName: string;
  year: number;
  month?: string;
  score: number;
  maxScore: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'NEEDS_RETRY';
  attemptNumber?: number;
  attemptStatus?: AttemptStatus;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  detailedFeedback?: string;
  improvementTip?: string;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  } | null;
}

interface PaperGroup {
  key: string;
  title: string;
  year: number;
  month: string;
  attempts: PaperAttempt[];
  questions: PaperAttempt[];
  latest: PaperAttempt;
}

const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

const formatPaperName = (paper: Pick<PaperAttempt, 'paperTitle' | 'year' | 'month'>) => {
  const title = paper.paperTitle?.trim() || 'Paper';
  const month = paper.month?.trim();
  return month ? `${title} – ${month} ${paper.year}` : `${title} – ${paper.year}`;
};

const getQuestionLabel = (question: Pick<PaperAttempt, 'questionLabel' | 'paperTitle' | 'questionNumber' | 'questionPart'>) => {
  if (question.questionLabel?.trim()) return question.questionLabel.trim();

  const number = Number(question.questionNumber ?? 0);
  const part = question.questionPart?.trim() || '';
  if (number > 0) return `Question ${number}${part ? part.toLowerCase() : ''}`;

  return question.paperTitle?.trim() || 'Question';
};

const parseQuestionReference = (question: PaperAttempt) => {
  const label = question.questionLabel?.trim() || getQuestionLabel(question);
  const labelMatch = label.match(/(\d+)\s*([a-z])?/i);
  const questionNumber = Number(question.questionNumber ?? labelMatch?.[1] ?? 0);
  const questionPart = (question.questionPart ?? labelMatch?.[2] ?? '').trim().toLowerCase();

  return {
    questionNumber: Number.isFinite(questionNumber) ? questionNumber : 0,
    questionPart,
  };
};

const getQuestionSortValue = (question: PaperAttempt) => {
  const { questionNumber, questionPart } = parseQuestionReference(question);
  return [questionNumber, questionPart.charCodeAt(0) || 0, question.createdAt?.seconds ?? 0] as const;
};

const isQuestionRecord = (paper: PaperAttempt) => {
  return Boolean(
    paper.parentPaperId ||
    paper.questionLabel ||
    (paper.questionNumber !== undefined && paper.questionNumber > 0) ||
    (typeof paper.questionPart === 'string' && paper.questionPart.trim() !== '')
  );
};

const getNextAttemptNumber = async (paperTitle: string, year: number, month: string, subject: string) => {
  const q = query(
    collection(db, 'past_papers'),
    where('subjectName', '==', subject),
    where('paperTitle', '==', paperTitle.trim() || 'Past Paper Attempt'),
    where('year', '==', Number(year)),
    where('month', '==', month)
  );

  const snapshot = await getDocs(q);
  const maxAttemptNumber = snapshot.docs.reduce((max, docSnap) => {
    const data = docSnap.data() as Partial<PaperAttempt>;
    if (!data || isQuestionRecord(data as PaperAttempt)) return max;
    return Math.max(max, Number(data.attemptNumber ?? 0));
  }, 0);

  return maxAttemptNumber + 1;
};

export function PastPaperSection({ subjectName }: { subjectName: string }) {
  const [papers, setPapers] = useState<PaperAttempt[]>([]);
  const [selectedRepeatByGroup, setSelectedRepeatByGroup] = useState<Record<string, string>>({});
  
  // Manual Log Input State
  const [showLogModal, setShowLogModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [manualMonth, setManualMonth] = useState(MONTHS[new Date().getMonth()]);
  const [manualScore, setManualScore] = useState(0);
  const [manualMaxScore, setManualMaxScore] = useState(80);
  const [manualAttemptStatus, setManualAttemptStatus] = useState<AttemptStatus>('PENDING');
  const [aiQuestionNumber, setAiQuestionNumber] = useState<number>(1);
  const [aiQuestionPart, setAiQuestionPart] = useState<string>('');
  const getPaperStatus = (score: number, maxScore: number): PaperAttempt['status'] => {
    if (maxScore <= 0) return 'NEEDS_RETRY';
    const percentage = (score / maxScore) * 100;
    return percentage >= 85 ? 'COMPLETED' : 'NEEDS_RETRY';
  };
  const [repeatDraft, setRepeatDraft] = useState<{
    title: string;
    year: number;
    month: string;
    score: number;
    maxScore: number;
    attemptStatus: AttemptStatus;
  } | null>(null);

  // AI Marker Inputs
  const [maxMarks, setMaxMarks] = useState<number>(4);
  const [questionImg, setQuestionImg] = useState<string | null>(null);
  const [markSchemeImg, setMarkSchemeImg] = useState<string | null>(null);
  const [answerImg, setAnswerImg] = useState<string | null>(null);

  // AI Output State
  const [loading, setLoading] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [selectedPaperId, setSelectedPaperId] = useState<string>('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  // 1. Real-time Firebase Listener for Subject Past Papers
  useEffect(() => {
    const q = query(
      collection(db, 'past_papers'),
      where('subjectName', '==', subjectName)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPapers: PaperAttempt[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Partial<PaperAttempt>;
        return {
          id: docSnap.id,
          paperTitle: data.paperTitle ?? 'Past Paper Attempt',
          questionLabel: data.questionLabel as string | undefined,
          questionNumber: data.questionNumber !== undefined ? Number(data.questionNumber) : undefined,
          questionPart: typeof data.questionPart === 'string' ? data.questionPart : undefined,
          parentPaperId: data.parentPaperId as string | undefined,
          subjectName: data.subjectName ?? subjectName,
          year: Number(data.year ?? new Date().getFullYear()),
          month: data.month ?? '',
          score: Number(data.score ?? 0),
          maxScore: Number(data.maxScore ?? 0),
          status: (data.status as PaperAttempt['status']) ?? 'NEEDS_RETRY',
          attemptNumber: Number(data.attemptNumber ?? 0) || undefined,
          attemptStatus: (data.attemptStatus as AttemptStatus | undefined) ?? 'PENDING',
          matchedKeywords: Array.isArray(data.matchedKeywords) ? data.matchedKeywords : [],
          missingKeywords: Array.isArray(data.missingKeywords) ? data.missingKeywords : [],
          detailedFeedback: typeof data.detailedFeedback === 'string' ? data.detailedFeedback : '',
          improvementTip: typeof data.improvementTip === 'string' ? data.improvementTip : '',
          createdAt: data.createdAt as PaperAttempt['createdAt'],
        };
      });
      
      setPapers(fetchedPapers);
    }, (error) => {
      console.error("Firestore read error:", error);
    });

    return () => unsubscribe();
  }, [subjectName]);

  // File to Base64 Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setter(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // 2. Add New Paper to Firestore (Manual)
  const handleSaveManualPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nextAttemptNumber = await getNextAttemptNumber(
        manualTitle || 'Past Paper Attempt',
        Number(manualYear),
        manualMonth,
        subjectName
      );

      await addDoc(collection(db, 'past_papers'), {
        subjectName,
        paperTitle: manualTitle || 'Past Paper Attempt',
        year: Number(manualYear),
        month: manualMonth,
        score: Number(manualScore),
        maxScore: Number(manualMaxScore),
        status: getPaperStatus(Number(manualScore), Number(manualMaxScore)),
        attemptNumber: nextAttemptNumber,
        attemptStatus: manualAttemptStatus,
        createdAt: serverTimestamp(),
      });
      setShowLogModal(false);
      setManualTitle('');
      setManualMonth(MONTHS[new Date().getMonth()]);
      setManualAttemptStatus('PENDING');
    } catch (err) {
      console.error('Error saving paper to Firestore:', err);
    }
  };

  const selectedAttempt = papers.find((paper) => paper.id === selectedPaperId && !isQuestionRecord(paper)) ?? null;
  const selectedQuestion = papers.find((paper) => paper.id === selectedQuestionId && isQuestionRecord(paper)) ?? null;

  const handleUpdateAttemptStatus = async (attemptId: string, nextStatus: AttemptStatus) => {
    const attempt = papers.find((paper) => paper.id === attemptId);
    if (!attempt) return;

    const nextScore = Math.min(Number(attempt.score ?? 0), Number(attempt.maxScore ?? 1));
    const nextTextStatus = nextStatus === 'COMPLETED' ? 'COMPLETED' : 'NEEDS_RETRY';

    try {
      await updateDoc(doc(db, 'past_papers', attemptId), {
        attemptStatus: nextStatus,
        status: nextTextStatus,
        score: nextScore,
      });
    } catch (err) {
      console.error('Error updating attempt status:', err);
    }
  };

  const clearAiForm = () => {
    setQuestionImg(null);
    setMarkSchemeImg(null);
    setAnswerImg(null);
    setAiQuestionNumber(1);
    setAiQuestionPart('');
    setMaxMarks(4);
    setResult(null);
    setSelectedPaperId('');
  };

  // 3. Evaluate with Gemini AI & Auto-Save to Firestore
  const handleEvaluate = async () => {
    if (!markSchemeImg || !answerImg || !selectedPaperId || !selectedAttempt) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/ai-marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionImage: questionImg,
          markSchemeImage: markSchemeImg,
          answerImage: answerImg,
          maxMarks: Number(maxMarks),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({
          error: data.error || 'The AI marker could not evaluate this paper.',
          marksAwarded: null,
          maxMarks: Number(maxMarks),
          matchedKeywords: [],
          missingKeywords: [],
          detailedFeedback: '',
          improvementTip: '',
        });
        return;
      }

      setResult(data);

      if (data.marksAwarded !== undefined) {
        const questionNumber = Number(aiQuestionNumber) || 1;
        const normalizedPart = aiQuestionPart.trim();
        const questionPart = normalizedPart ? normalizedPart.toLowerCase() : '';
        const questionLabel = `Question ${questionNumber}${questionPart ? questionPart : ''}`;

        await addDoc(collection(db, 'past_papers'), {
          subjectName,
          paperTitle: selectedAttempt.paperTitle,
          questionLabel,
          questionNumber,
          questionPart,
          parentPaperId: selectedAttempt.id,
          year: Number(selectedAttempt.year),
          month: selectedAttempt.month || '',
          score: data.marksAwarded,
          maxScore: data.maxMarks,
          status: getPaperStatus(data.marksAwarded, data.maxMarks),
          matchedKeywords: data.matchedKeywords ?? [],
          missingKeywords: data.missingKeywords ?? [],
          detailedFeedback: data.detailedFeedback ?? '',
          improvementTip: data.improvementTip ?? '',
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Error evaluating response:', err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Delete Paper Document from Firestore
  const handleDeletePaper = async (paperId: string) => {
    setDeletingId(paperId);
    try {
      const q = query(
        collection(db, 'past_papers'),
        where('parentPaperId', '==', paperId)
      );
      const relatedQuestionDocs = await getDocs(q);
      const batch = writeBatch(db);

      relatedQuestionDocs.docs.forEach((docSnap) => {
        batch.delete(doc(db, 'past_papers', docSnap.id));
      });

      batch.delete(doc(db, 'past_papers', paperId));
      await batch.commit();
    } catch (err) {
      console.error('Error deleting document from Firestore:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveRepeatedPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repeatDraft) return;

    try {
      const nextAttemptNumber = await getNextAttemptNumber(
        repeatDraft.title || 'Past Paper Attempt',
        Number(repeatDraft.year),
        repeatDraft.month,
        subjectName
      );

      await addDoc(collection(db, 'past_papers'), {
        subjectName,
        paperTitle: repeatDraft.title || 'Past Paper Attempt',
        year: Number(repeatDraft.year),
        month: repeatDraft.month,
        score: Number(repeatDraft.score),
        maxScore: Number(repeatDraft.maxScore),
        status: getPaperStatus(Number(repeatDraft.score), Number(repeatDraft.maxScore)),
        attemptNumber: nextAttemptNumber,
        attemptStatus: repeatDraft.attemptStatus,
        createdAt: serverTimestamp(),
      });
      setRepeatDraft(null);
    } catch (err) {
      console.error('Error repeating paper entry:', err);
    }
  };

  const handleRepeatPaper = (paper: PaperAttempt) => {
    setRepeatDraft({
      title: paper.paperTitle,
      year: paper.year,
      month: paper.month || MONTHS[new Date().getMonth()],
      score: paper.score,
      maxScore: paper.maxScore,
      attemptStatus: paper.attemptStatus ?? 'PENDING',
    });
  };

  const paperGroups = (() => {
    const grouped = new Map<string, PaperGroup>();

    papers
      .filter((paper) => !isQuestionRecord(paper))
      .forEach((paper) => {
        const normalizedTitle = paper.paperTitle.trim();
        const month = paper.month?.trim() || '';
        const key = `${paper.year}::${month.toLowerCase()}::${normalizedTitle.toLowerCase()}`;
        const existing = grouped.get(key);

        if (existing) {
          existing.attempts.push(paper);
          const currentLatestTime = existing.latest.createdAt?.seconds ?? 0;
          const paperTime = paper.createdAt?.seconds ?? 0;

          if (paperTime >= currentLatestTime) {
            existing.latest = paper;
          }
        } else {
          grouped.set(key, {
            key,
            title: normalizedTitle,
            year: paper.year,
            month,
            attempts: [paper],
            questions: [],
            latest: paper,
          });
        }
      });

    papers
      .filter((paper) => isQuestionRecord(paper))
      .forEach((paper) => {
        const parentId = paper.parentPaperId;
        const parentGroup = Array.from(grouped.values()).find((group) =>
          parentId ? group.attempts.some((attempt) => attempt.id === parentId) : false
        );

        if (parentGroup) {
          parentGroup.questions.push(paper);
          return;
        }

        const normalizedTitle = paper.paperTitle.trim();
        const month = paper.month?.trim() || '';
        const key = `${paper.year}::${month.toLowerCase()}::${normalizedTitle.toLowerCase()}`;
        const existing = grouped.get(key);

        if (existing) {
          existing.questions.push(paper);
        }
      });

    Array.from(grouped.values()).forEach((group) => {
      group.questions.sort((a, b) => {
        const aValue = getQuestionSortValue(a);
        const bValue = getQuestionSortValue(b);
        return aValue[0] - bValue[0] || aValue[1] - bValue[1] || aValue[2] - bValue[2];
      });
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const aTime = a.latest.createdAt?.seconds ?? 0;
      const bTime = b.latest.createdAt?.seconds ?? 0;
      return bTime - aTime;
    });
  })();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white">Past Papers & AI Marker</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Track exam performance and grade handwritten responses against mark schemes using AI.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-12 gap-6">
        
        {/* Left Column: Firebase History Tracker (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Paper History</h3>
            <button 
              onClick={() => setShowLogModal(true)}
              className="text-xs bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20 px-2.5 py-1 rounded-md font-medium transition border border-[#10b981]/20"
            >
              Log Paper
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {paperGroups.length === 0 ? (
              <div className="p-4 bg-slate-950 border border-slate-800/40 rounded-lg text-center text-xs text-gray-500">
                No past paper attempts recorded yet.
              </div>
            ) : (
              paperGroups.map((group) => {
                const orderedAttempts = group.attempts
                  .slice()
                  .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
                const selectedAttemptId = selectedRepeatByGroup[group.key] ?? orderedAttempts[orderedAttempts.length - 1]?.id ?? group.latest.id;
                const selectedAttempt = orderedAttempts.find((attempt) => attempt.id === selectedAttemptId) ?? orderedAttempts[orderedAttempts.length - 1] ?? group.latest;
                const selectedAttemptQuestions = group.questions.filter((question) => question.parentPaperId === selectedAttempt.id);
                const pct = selectedAttempt.maxScore > 0 ? Math.round((selectedAttempt.score / selectedAttempt.maxScore) * 100) : 0;

                return (
                  <div
                    key={group.key}
                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-[inset_0_1px_0_rgba(148,163,184,0.06)] transition-colors hover:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">
                            {formatPaperName({ paperTitle: group.title, year: group.year, month: group.month })}
                          </p>

                          <div className="shrink-0 text-right">
                            <div className="text-[11px] font-bold text-white">{selectedAttempt.score}/{selectedAttempt.maxScore}</div>
                            <div className="text-[9px] text-slate-400">{pct}%</div>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              selectedAttempt.status === 'COMPLETED'
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                            }`}
                          >
                            {selectedAttempt.status.replace('_', ' ')}
                          </span>

                          {group.attempts.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {orderedAttempts.map((attempt) => {
                                  const attemptNumber = Number(attempt.attemptNumber) || 1;
                                  const isSelected = attempt.id === selectedAttemptId;
                                  const statusText = attempt.attemptStatus ?? 'PENDING';
                                  return (
                                    <div key={attempt.id} className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedRepeatByGroup((prev) => ({
                                          ...prev,
                                          [group.key]: attempt.id,
                                        }))}
                                        className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold transition ${
                                          isSelected
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
                                        }`}
                                      >
                                        Attempt {attemptNumber}
                                      </button>
                                      <select
                                        value={statusText}
                                        onChange={(e) => handleUpdateAttemptStatus(attempt.id, e.target.value as AttemptStatus)}
                                        className="rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[8px] font-bold uppercase text-slate-200 outline-none"
                                      >
                                        <option value="INCOMPLETE">Incomplete</option>
                                        <option value="PENDING">Pending</option>
                                        <option value="COMPLETED">Complete</option>
                                      </select>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>

                        {selectedAttempt.attemptStatus === 'COMPLETED' && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-[10px] text-sky-100">
                            <label className="font-semibold text-sky-200">Score</label>
                            <input
                              type="number"
                              min={0}
                              max={selectedAttempt.maxScore || 0}
                              value={selectedAttempt.score}
                              onChange={async (e) => {
                                const nextScore = Math.min(Number(e.target.value) || 0, selectedAttempt.maxScore || 0);
                                await updateDoc(doc(db, 'past_papers', selectedAttempt.id), {
                                  score: nextScore,
                                  status: getPaperStatus(nextScore, selectedAttempt.maxScore || 0),
                                });
                              }}
                              className="w-16 rounded border border-sky-500/30 bg-slate-950 px-1.5 py-0.5 text-[10px] text-white outline-none"
                            />
                            <span className="text-slate-300">/ {selectedAttempt.maxScore || 0}</span>
                          </div>
                        )}

                        {selectedAttemptQuestions.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] uppercase tracking-[0.12em] text-slate-400">Questions</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {selectedAttemptQuestions
                                .slice()
                                .sort((a, b) => {
                                  const aValue = getQuestionSortValue(a);
                                  const bValue = getQuestionSortValue(b);
                                  return aValue[0] - bValue[0] || aValue[1] - bValue[1] || aValue[2] - bValue[2];
                                })
                                .map((question) => {
                                  const isSelectedQuestion = selectedQuestionId === question.id;
                                  return (
                                    <button
                                      key={question.id}
                                      type="button"
                                      onClick={() => setSelectedQuestionId((prev) => prev === question.id ? null : question.id)}
                                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold transition ${
                                        isSelectedQuestion
                                          ? 'border-sky-400/50 bg-sky-500/20 text-sky-200'
                                          : 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:border-sky-400/60'
                                      }`}
                                    >
                                      {getQuestionLabel(question)}
                                    </button>
                                  );
                                })}
                            </div>

                            {selectedQuestion && selectedAttemptQuestions.some((question) => question.id === selectedQuestion.id) && (
                              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2 text-[10px] text-sky-100">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="font-bold uppercase tracking-wide text-sky-300">{getQuestionLabel(selectedQuestion)}</span>
                                  <span className="font-bold text-white">{selectedQuestion.score}/{selectedQuestion.maxScore}</span>
                                </div>

                                {selectedQuestion.detailedFeedback ? (
                                  <p className="leading-relaxed text-sky-100/90">{selectedQuestion.detailedFeedback}</p>
                                ) : (
                                  <p className="text-sky-200/80 italic">No feedback saved for this question yet.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => handleRepeatPaper(selectedAttempt)}
                          className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                          title="Repeat this paper"
                          aria-label={`Repeat ${group.title}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeletePaper(selectedAttempt.id)}
                          disabled={deletingId === selectedAttempt.id}
                          className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition hover:border-rose-500/30 hover:text-rose-300 disabled:cursor-not-allowed"
                          title="Delete entry"
                        >
                          {deletingId === selectedAttempt.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: AI Assessor Tool (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800/60 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-800/60 pb-3">
            <Bot className="w-4 h-4 text-[#10b981]" />
            <h3 className="text-sm font-bold text-white">Instant AI Mark Scheme Assessor</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Form Inputs */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Assign to paper + attempt *</label>
                <button
                  type="button"
                  onClick={clearAiForm}
                  className="text-[10px] text-slate-300 hover:text-white underline underline-offset-2"
                >
                  Clear form
                </button>
              </div>
              <select
                value={selectedPaperId}
                onChange={(e) => setSelectedPaperId(e.target.value)}
                className="w-full bg-[#0b0f19] border border-gray-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
              >
                <option value="">Select a paper attempt</option>
                {paperGroups.flatMap((group) => {
                  const orderedGroupAttempts = group.attempts
                    .slice()
                    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));

                  return orderedGroupAttempts.map((attempt) => ({
                    key: attempt.id,
                    value: attempt.id,
                    label: `${formatPaperName({ paperTitle: group.title, year: group.year, month: group.month })} — Attempt ${Number(attempt.attemptNumber) || 1}`,
                  }));
                }).map((option) => (
                  <option key={option.key} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Max Marks</label>
                <input
                  type="number"
                  min={1}
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-[#0b0f19] border border-gray-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Question No.</label>
                  <input
                    type="number"
                    min={1}
                    value={aiQuestionNumber}
                    onChange={(e) => setAiQuestionNumber(Number(e.target.value) || 1)}
                    className="w-full bg-[#0b0f19] border border-gray-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">Part</label>
                  <input
                    type="text"
                    value={aiQuestionPart}
                    onChange={(e) => setAiQuestionPart(e.target.value.slice(0, 2))}
                    placeholder="a, b, c"
                    className="w-full bg-[#0b0f19] border border-gray-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">1. Question Image (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, setQuestionImg)}
                  className="w-full text-gray-400 text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">2. Mark Scheme Image *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, setMarkSchemeImg)}
                  className="w-full text-gray-400 text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">3. Handwritten Answer Image *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, setAnswerImg)}
                  className="w-full text-gray-400 text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
              </div>

              <button
                onClick={handleEvaluate}
                disabled={loading || !markSchemeImg || !answerImg || !selectedPaperId}
                className="w-full mt-2 py-2 bg-[#10b981] hover:bg-[#0ef5a8] text-black font-bold rounded-lg text-xs disabled:opacity-40 flex items-center justify-center gap-1.5 transition"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Evaluate Handwritten Answer'}
              </button>
            </div>

            {/* Assessment Feedback Panel */}
            <div className="bg-[#0b0f19] border border-gray-800/80 p-3.5 rounded-lg flex flex-col justify-between">
              <div>
                <h4 className="text-[11px] font-semibold uppercase text-gray-400 mb-2 tracking-wider">Evaluation Breakdown</h4>
                {result ? (
                  result.error ? (
                    <div className="space-y-2 text-xs text-rose-300">
                      <div className="flex items-center gap-1 text-rose-400 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" /> AI Marker Error
                      </div>
                      <p className="bg-rose-500/10 border border-rose-500/20 rounded p-2 text-[11px] leading-relaxed">
                        {result.error}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                        <span className="text-gray-300 font-medium">Marks Awarded</span>
                        <span className="text-lg font-black text-[#10b981]">{result.marksAwarded} / {result.maxMarks}</span>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-[#10b981] flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Matched Criteria
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {result.matchedKeywords?.map((kw: string, i: number) => (
                            <span key={i} className="bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 text-[10px] px-1.5 py-0.5 rounded">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      {Array.isArray(result.missingKeywords) && result.missingKeywords.length > 0 && (
                        <div>
                          <p className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Missing Criteria
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {result.missingKeywords.map((kw: string, i: number) => (
                              <span key={i} className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] px-1.5 py-0.5 rounded">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-gray-300 bg-[#070a12] p-2.5 rounded border border-gray-800/60 mt-2">
                        <strong className="text-white">Feedback:</strong> {result.detailedFeedback}
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-gray-500 italic mt-4">
                    Upload mark scheme and handwritten answer images to evaluate and auto-save the score into Firebase.
                  </p>
                )}
              </div>

              {result?.improvementTip && (
                <div className="mt-1 p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] rounded">
                  <strong>Examiner Tip:</strong> {result.improvementTip}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Manual Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveManualPaper} className="bg-[#0b0f19] border border-gray-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Log Past Paper Score</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Paper Title</label>
                <input
                  type="text"
                  placeholder="e.g. Paper 1"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  required
                  className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Status</label>
                <select
                  value={manualAttemptStatus}
                  onChange={(e) => setManualAttemptStatus(e.target.value as AttemptStatus)}
                  className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                >
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Complete</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1">Month</label>
                  <select
                    value={manualMonth}
                    onChange={(e) => setManualMonth(e.target.value)}
                    className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                  >
                    {MONTHS.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={manualYear}
                    onChange={(e) => setManualYear(Number(e.target.value))}
                    className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                  />
                </div>
              </div>

              {manualAttemptStatus === 'COMPLETED' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Score</label>
                    <input
                      type="number"
                      value={manualScore}
                      onChange={(e) => setManualScore(Math.min(Number(e.target.value) || 0, manualMaxScore))}
                      className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Max Score</label>
                    <input
                      type="number"
                      min={1}
                      value={manualMaxScore}
                      onChange={(e) => {
                        const nextMax = Math.max(1, Number(e.target.value) || 1);
                        setManualMaxScore(nextMax);
                        setManualScore((prev) => Math.min(prev, nextMax));
                      }}
                      className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={manualAttemptStatus === 'COMPLETED' && manualScore > manualMaxScore}
                className="px-3 py-1.5 bg-[#10b981] hover:bg-[#0ef5a8] text-black font-bold rounded text-xs disabled:opacity-40"
              >
                Save Paper
              </button>
            </div>
          </form>
        </div>
      )}

      {repeatDraft && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveRepeatedPaper} className="bg-[#0b0f19] border border-gray-800 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-white">Repeat Paper</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Paper Title</label>
                <input
                  type="text"
                  value={repeatDraft.title}
                  onChange={(e) => setRepeatDraft({ ...repeatDraft, title: e.target.value })}
                  required
                  className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Status</label>
                <select
                  value={repeatDraft.attemptStatus}
                  onChange={(e) => setRepeatDraft({ ...repeatDraft, attemptStatus: e.target.value as AttemptStatus })}
                  className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs focus:outline-none focus:border-[#10b981]"
                >
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="PENDING">Pending</option>
                  <option value="COMPLETED">Complete</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1">Month</label>
                  <select
                    value={repeatDraft.month}
                    onChange={(e) => setRepeatDraft({ ...repeatDraft, month: e.target.value })}
                    className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                  >
                    {MONTHS.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={repeatDraft.year}
                    onChange={(e) => setRepeatDraft({ ...repeatDraft, year: Number(e.target.value) })}
                    className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                  />
                </div>
              </div>

              {repeatDraft.attemptStatus === 'COMPLETED' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Score</label>
                    <input
                      type="number"
                      value={repeatDraft.score}
                      onChange={(e) => setRepeatDraft({ ...repeatDraft, score: Math.min(Number(e.target.value) || 0, repeatDraft.maxScore) })}
                      className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Max Score</label>
                    <input
                      type="number"
                      min={1}
                      value={repeatDraft.maxScore}
                      onChange={(e) => {
                        const nextMax = Math.max(1, Number(e.target.value) || 1);
                        setRepeatDraft({ ...repeatDraft, maxScore: nextMax, score: Math.min(repeatDraft.score, nextMax) });
                      }}
                      className="w-full bg-[#070a12] border border-gray-800 rounded p-2 text-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRepeatDraft(null)}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={repeatDraft.attemptStatus === 'COMPLETED' && repeatDraft.score > repeatDraft.maxScore}
                className="px-3 py-1.5 bg-[#10b981] hover:bg-[#0ef5a8] text-black font-bold rounded text-xs disabled:opacity-40"
              >
                Save Repeat
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}