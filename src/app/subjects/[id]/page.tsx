'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

interface PracticeLog {
  marksObtained: number;
  marksAvailable: number;
  percentage: number;
  date: string;
}

interface Topic {
  unitCode: string;
  title: string;
  logs: PracticeLog[];
}

interface Task {
  id: string;
  name: string;
  setDate: string;
  dueDate: string;
  status: 'Incomplete' | 'Pending' | 'Completed';
}

interface RevisionFile {
  id: string;
  name: string;
  size: string;
  url: string;
  uploadedAt: string;
  topicIndex: number;
}

interface SubjectData {
  name: string;
  code: string;
  currentGrade?: string | number;
  targetGrade?: string | number;
  tasks?: Task[];
  topics?: (Topic | string)[];
  files?: RevisionFile[];
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [subject, setSubject] = useState<SubjectData | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);

  // Form Inputs
  const todayStr = new Date().toISOString().split('T')[0];

  const [taskName, setTaskName] = useState('');
  const [taskSetDate, setTaskSetDate] = useState(todayStr);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskStatus, setTaskStatus] = useState<'Incomplete' | 'Pending' | 'Completed'>('Pending');

  // Topic Form Inputs
  const [unitNumber, setUnitNumber] = useState('');
  const [topicNumber, setTopicNumber] = useState('');
  const [topicName, setTopicName] = useState('');

  const [selectedTopicIndex, setSelectedTopicIndex] = useState<number | null>(null);
  const [marksObtained, setMarksObtained] = useState('');
  const [marksAvailable, setMarksAvailable] = useState('');

  const [currentGradeInput, setCurrentGradeInput] = useState('');
  const [targetGradeInput, setTargetGradeInput] = useState('');

  const [selectedFileTopicIndex, setSelectedFileTopicIndex] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function fetchSubject() {
    try {
      const docRef = doc(db, 'subjects', id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as SubjectData;

        // Automatic Task Expiry Check
        if (data.tasks && data.tasks.length > 0) {
          const activeTasks = data.tasks.filter((t) => t.dueDate >= todayStr);
          if (activeTasks.length !== data.tasks.length) {
            await updateDoc(docRef, { tasks: activeTasks });
            data.tasks = activeTasks;
          }
        }

        setSubject(data);
        setCurrentGradeInput(String(data.currentGrade || ''));
        setTargetGradeInput(String(data.targetGrade || ''));
      }
    } catch (err) {
      console.error('Error loading subject:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubject();
  }, [id]);

  // Task Actions
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskName || !taskDueDate) return;

    const validSetDate = taskSetDate > todayStr ? todayStr : (taskSetDate || todayStr);

    const newTask: Task = {
      id: crypto.randomUUID(),
      name: taskName,
      setDate: validSetDate,
      dueDate: taskDueDate,
      status: taskStatus,
    };

    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { tasks: arrayUnion(newTask) });
    setTaskName('');
    setTaskSetDate(todayStr);
    setTaskDueDate('');
    setTaskStatus('Pending');
    setShowTaskModal(false);
    fetchSubject();
  }

  async function handleUpdateTaskStatus(taskId: string, newStatus: Task['status']) {
    if (!subject?.tasks) return;
    const updatedTasks = subject.tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t));
    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { tasks: updatedTasks });
    fetchSubject();
  }

  async function handleDeleteTask(taskId: string) {
    if (!subject?.tasks) return;
    const updatedTasks = subject.tasks.filter((t) => t.id !== taskId);
    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { tasks: updatedTasks });
    fetchSubject();
  }

  // Topic Actions
  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();

    const cleanUnit = unitNumber.trim();
    const cleanTopicNum = topicNumber.trim();
    const cleanTitle = topicName.trim();

    if (!cleanUnit || !cleanTopicNum || !cleanTitle) return;

    // Constructs "Unit X" for backend unit grouping
    const formattedUnitCode = `Unit ${cleanUnit}`;

    // Strips any accidental leading numbers/dots typed into the title box
    const sanitizedTitle = cleanTitle.replace(/^[\d.\s]+/, '');

    // Formats topic title as: "1.1. Forces between objects"
    const formattedTopicTitle = `${cleanUnit}.${cleanTopicNum}. ${sanitizedTitle}`;

    const newTopic: Topic = { 
      unitCode: formattedUnitCode, 
      title: formattedTopicTitle, 
      logs: [] 
    };

    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { topics: arrayUnion(newTopic) });

    // Reset Form
    setUnitNumber('');
    setTopicNumber('');
    setTopicName('');
    setShowTopicModal(false);
    fetchSubject();
  }

  async function handleDeleteTopic(originalIndex: number) {
    if (!subject?.topics) return;
    const updatedTopics = subject.topics.filter((_, idx) => idx !== originalIndex);
    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { topics: updatedTopics });
    fetchSubject();
  }

  // Score Logging Handler
  async function handleAddScore(e: React.FormEvent) {
    e.preventDefault();
    if (selectedTopicIndex === null || !marksObtained || !marksAvailable || !subject?.topics) return;

    const obtained = parseFloat(marksObtained);
    const available = parseFloat(marksAvailable);
    if (available <= 0) return;

    const percentage = Math.round((obtained / available) * 100);
    const newLog: PracticeLog = {
      marksObtained: obtained,
      marksAvailable: available,
      percentage,
      date: todayStr,
    };

    const updatedTopics: Topic[] = (subject.topics || []).map((t) => {
      if (typeof t === 'string') {
        return { unitCode: 'General', title: t, logs: [] };
      }
      return {
        unitCode: t.unitCode?.trim() || 'General',
        title: t.title?.trim() || 'Untitled Topic',
        logs: Array.isArray(t.logs) ? t.logs : [],
      };
    });

    if (updatedTopics[selectedTopicIndex]) {
      updatedTopics[selectedTopicIndex].logs.push(newLog);
    }

    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { topics: updatedTopics });
    setMarksObtained('');
    setMarksAvailable('');
    setSelectedTopicIndex(null);
    setShowScoreModal(false);
    fetchSubject();
  }

  // Grade Adjustment Handler
  async function handleUpdateGrades(e: React.FormEvent) {
    e.preventDefault();
    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, {
      currentGrade: currentGradeInput,
      targetGrade: targetGradeInput,
    });
    setShowGradeModal(false);
    fetchSubject();
  }

  // File Upload Handler
  async function handleSaveFile(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || selectedFileTopicIndex === null) return;

    const fileObj: RevisionFile = {
      id: crypto.randomUUID(),
      name: selectedFile.name,
      size: `${(selectedFile.size / 1024).toFixed(1)} KB`,
      url: URL.createObjectURL(selectedFile),
      uploadedAt: todayStr,
      topicIndex: selectedFileTopicIndex,
    };

    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { files: arrayUnion(fileObj) });
    setSelectedFile(null);
    setSelectedFileTopicIndex(null);
    setShowFileModal(false);
    fetchSubject();
  }

  async function handleDeleteFile(fileId: string) {
    if (!subject?.files) return;
    const updatedFiles = subject.files.filter((f) => f.id !== fileId);
    const docRef = doc(db, 'subjects', id);
    await updateDoc(docRef, { files: updatedFiles });
    fetchSubject();
  }

  if (loading) return <div className="p-8 text-slate-400 font-mono text-sm">Loading subject data...</div>;
  if (!subject) return <div className="p-8 text-slate-400 font-mono text-sm">Subject not found.</div>;

  // Clean and filter topics specifically for THIS subject
  const validTopics: (Topic & { originalIndex: number })[] = (subject.topics || [])
    .map((topic, index) => {
      if (typeof topic === 'string') {
        const cleanStr = topic.trim();
        return cleanStr ? { unitCode: 'General', title: cleanStr, logs: [], originalIndex: index } : null;
      }
      const cleanUnit = topic.unitCode?.trim();
      const cleanTitle = topic.title?.trim();

      if (!cleanUnit && !cleanTitle) return null;

      return {
        unitCode: cleanUnit || 'General',
        title: cleanTitle || 'Untitled Topic',
        logs: Array.isArray(topic.logs) ? topic.logs : [],
        originalIndex: index,
      };
    })
    .filter((t): t is Topic & { originalIndex: number } => t !== null);

  const categorizedTopics = validTopics.map((topic) => {
    const logs = topic.logs || [];
    const avgPercentage =
      logs.length > 0
        ? Math.round(logs.reduce((acc, log) => acc + log.percentage, 0) / logs.length)
        : null;

    let tier: 'GOOD' | 'MEDIUM' | 'LOW' = 'LOW';
    if (avgPercentage !== null) {
      if (avgPercentage > 85) tier = 'GOOD';
      else if (avgPercentage >= 51) tier = 'MEDIUM';
    }

    return { ...topic, avgPercentage, tier };
  });

  const goodTier = categorizedTopics.filter((t) => t.avgPercentage !== null && t.tier === 'GOOD');
  const mediumTier = categorizedTopics.filter((t) => t.avgPercentage !== null && t.tier === 'MEDIUM');
  const lowTier = categorizedTopics.filter((t) => t.avgPercentage === null || t.tier === 'LOW');

  // Group topics by Unit without creating empty header units
  const unitGroupedMap: Record<string, (Topic & { originalIndex: number })[]> = {};
  validTopics.forEach((topic) => {
    const unitKey = topic.unitCode;
    if (!unitGroupedMap[unitKey]) {
      unitGroupedMap[unitKey] = [];
    }
    unitGroupedMap[unitKey].push(topic);
  });

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 space-y-6 w-full">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-slate-800 pb-4">
        <div>
          <Link href="/" className="text-xs text-slate-400 hover:text-indigo-400 transition mb-2 inline-block">
            &larr; Back to Dashboard Overview
          </Link>
          <h1 className="text-3xl font-bold">{subject.name}</h1>
          <p className="text-xs text-slate-400 font-mono">{subject.code}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGradeModal(true)}
            className="flex items-center gap-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg p-2 transition text-left"
          >
            <div className="px-2">
              <span className="block text-[10px] text-slate-400 uppercase font-mono">Current Grade</span>
              <span className="text-base font-bold text-amber-400">{subject.currentGrade || 'N/A'}</span>
            </div>
            <div className="px-2 border-l border-slate-800">
              <span className="block text-[10px] text-slate-400 uppercase font-mono">Target Grade</span>
              <span className="text-base font-bold text-emerald-400">{subject.targetGrade || 'N/A'}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            if (validTopics.length > 0) setSelectedTopicIndex(validTopics[0].originalIndex);
            setShowScoreModal(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
        >
          Log Score
        </button>
        <button
          onClick={() => setShowTaskModal(true)}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-indigo-400 px-4 py-2 rounded-lg text-xs font-semibold transition"
        >
          Add Task
        </button>
        <button
          onClick={() => setShowTopicModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
        >
          Add Topic
        </button>
      </div>

      {/* Row 1: Tasks (1 col) & Topics Breakdown (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Scheduled Homework & Tests</h2>
          {(!subject.tasks || subject.tasks.length === 0) ? (
            <p className="text-xs text-slate-500">No upcoming tasks or tests assigned to this subject.</p>
          ) : (
            <div className="space-y-2">
              {subject.tasks.map((task) => (
                <div key={task.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-2 relative group">
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 transition rounded-full p-1 bg-slate-900 hover:bg-slate-800"
                    title="Delete task"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="flex justify-between items-center pr-6">
                    <span className="font-semibold text-white">{task.name}</span>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <div className="text-[11px] text-slate-400 space-x-2">
                      <span>Set: {task.setDate}</span>
                      <span>Due: {task.dueDate}</span>
                    </div>

                    <select
                      value={task.status}
                      onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as Task['status'])}
                      className={`text-[10px] font-bold px-2 py-0.5 border rounded cursor-pointer bg-slate-950 focus:outline-none ${
                        task.status === 'Completed'
                          ? 'text-emerald-400 border-emerald-800/40'
                          : task.status === 'Incomplete'
                          ? 'text-rose-400 border-rose-800/40'
                          : 'text-amber-400 border-amber-800/40'
                      }`}
                    >
                      <option value="Pending" className="bg-slate-900 text-amber-400">Pending</option>
                      <option value="Incomplete" className="bg-slate-900 text-rose-400">Incomplete</option>
                      <option value="Completed" className="bg-slate-900 text-emerald-400">Completed</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Topic Mastery Section */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold">Topic Performance Breakdown</h2>
            <p className="text-xs text-slate-400">Rule-based tiering categorizing mastery based on practice test logs.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* GOOD TIER */}
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-400">GOOD (&gt;85%)</span>
                <span className="text-xs font-mono font-bold bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded-full">{goodTier.length}</span>
              </div>
              <p className="text-[11px] text-slate-400">Minimal study required.</p>
              <div className="space-y-2 pt-2 border-t border-emerald-900/30">
                {goodTier.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No topics in this tier.</p>
                ) : (
                  goodTier.map((t) => (
                    <div key={t.originalIndex} className="flex justify-between items-center text-xs group">
                      <div>
                        <span className="font-bold text-slate-200">{t.unitCode}</span>: <span className="text-slate-300">{t.title}</span>
                        <div className="text-[10px] text-emerald-400 font-mono">Avg: {t.avgPercentage}%</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setSelectedTopicIndex(t.originalIndex); setShowScoreModal(true); }}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded transition"
                        >
                          Score
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(t.originalIndex)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Delete topic"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* MEDIUM TIER */}
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-amber-400">MEDIUM (51%–85%)</span>
                <span className="text-xs font-mono font-bold bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full">{mediumTier.length}</span>
              </div>
              <p className="text-[11px] text-slate-400">Some study required + practice questions.</p>
              <div className="space-y-2 pt-2 border-t border-amber-900/30">
                {mediumTier.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No topics in this tier.</p>
                ) : (
                  mediumTier.map((t) => (
                    <div key={t.originalIndex} className="flex justify-between items-center text-xs group">
                      <div>
                        <span className="font-bold text-slate-200">{t.unitCode}</span>: <span className="text-slate-300">{t.title}</span>
                        <div className="text-[10px] text-amber-400 font-mono">Avg: {t.avgPercentage}%</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setSelectedTopicIndex(t.originalIndex); setShowScoreModal(true); }}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded transition"
                        >
                          Score
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(t.originalIndex)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Delete topic"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* LOW TIER */}
            <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-rose-400">LOW (&le;50%)</span>
                <span className="text-xs font-mono font-bold bg-rose-900/40 text-rose-300 px-2 py-0.5 rounded-full">{lowTier.length}</span>
              </div>
              <p className="text-[11px] text-slate-400">Alternative study methods + sample questions.</p>
              <div className="space-y-2 pt-2 border-t border-rose-900/30">
                {lowTier.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No topics in this tier.</p>
                ) : (
                  lowTier.map((t) => (
                    <div key={t.originalIndex} className="flex justify-between items-center text-xs group">
                      <div>
                        <span className="font-bold text-slate-200">{t.unitCode}</span>: <span className="text-slate-300">{t.title}</span>
                        <div className="text-[10px] text-rose-400 font-mono">
                          {t.avgPercentage !== null ? `Avg: ${t.avgPercentage}%` : 'No test logs yet'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setSelectedTopicIndex(t.originalIndex); setShowScoreModal(true); }}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded transition"
                        >
                          Score
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(t.originalIndex)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Delete topic"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Full-Width Revision Notes & Files Section (Grouped by Unit -> Topics) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-bold">Revision Notes & Files</h2>
            <p className="text-xs text-slate-400">Hierarchically categorized by Units and specific Topics.</p>
          </div>
          <button
            onClick={() => {
              if (validTopics.length > 0) setSelectedFileTopicIndex(validTopics[0].originalIndex);
              setShowFileModal(true);
            }}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg transition font-semibold"
          >
            Upload File
          </button>
        </div>

        {Object.keys(unitGroupedMap).length === 0 ? (
          <p className="text-xs text-slate-500">Add units and topics to categorize and upload revision files.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(unitGroupedMap).map(([unit, topicsInUnit]) => (
              <div key={unit} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded">
                    {unit}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ({topicsInUnit.length} {topicsInUnit.length === 1 ? 'topic' : 'topics'})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {topicsInUnit.map((topic) => {
                    const topicFiles = (subject.files || []).filter((f) => f.topicIndex === topic.originalIndex);

                    return (
                      <div key={topic.originalIndex} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                        <h4 className="text-xs font-semibold text-slate-200 truncate">{topic.title}</h4>

                        {topicFiles.length === 0 ? (
                          <p className="text-[11px] text-slate-600 italic">No files</p>
                        ) : (
                          <div className="space-y-1.5">
                            {topicFiles.map((file) => (
                              <div key={file.id} className="flex justify-between items-center bg-slate-950 border border-slate-800/60 rounded p-2 text-xs">
                                <div className="truncate pr-2">
                                  <a href={file.url} download={file.name} className="font-medium text-slate-300 hover:text-indigo-400 hover:underline truncate block">
                                    {file.name}
                                  </a>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {file.size} &bull; {file.uploadedAt}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDeleteFile(file.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1"
                                  title="Delete file"
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: Gemini Study Gems */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Important Gemini Study Sessions</h2>
          <p className="text-xs text-slate-400">Direct shortcuts to specialized Gemini Gems for subject revision.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="https://gemini.google.com/gem/a6b3c9c9fb8d"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 transition group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-mono text-indigo-400 font-bold">Gemini Gem</span>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-indigo-300 transition">GCSE Revision Note Generator</h3>
              <p className="text-xs text-slate-400">Generate structured revision notes, key term definitions, and specification-aligned summaries.</p>
            </div>
            <div className="text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1 pt-2">
              Launch Gem &rarr;
            </div>
          </a>

          <a
            href="https://gemini.google.com/gem/d39559dbaf09"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 transition group flex flex-col justify-between space-y-3"
          >
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-400 font-bold">Gemini Gem</span>
              <h3 className="text-base font-bold text-slate-200 group-hover:text-emerald-300 transition">AI Concept Explainer</h3>
              <p className="text-xs text-slate-400">Break down complex subject concepts, theories, and difficult exam questions step-by-step.</p>
            </div>
            <div className="text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1 pt-2">
              Launch Gem &rarr;
            </div>
          </a>
        </div>
      </div>

      {/* Grade Adjuster Modal */}
      {showGradeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateGrades} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowGradeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-base font-bold pr-6">Adjust Subject Grades</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Current Grade</label>
                <input
                  type="text"
                  placeholder="e.g. 8"
                  value={currentGradeInput}
                  onChange={(e) => setCurrentGradeInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Target Grade</label>
                <input
                  type="text"
                  placeholder="e.g. 9"
                  value={targetGradeInput}
                  onChange={(e) => setTargetGradeInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowGradeModal(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded">Cancel</button>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-xs rounded font-semibold">Save Grades</button>
            </div>
          </form>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddTask} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowTaskModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-base font-bold pr-6">Add New Task</h3>
            <input
              type="text"
              required
              placeholder="Task Name (e.g., Unit 1 Practice Questions)"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Set Date</label>
                <input
                  type="date"
                  max={todayStr}
                  value={taskSetDate}
                  onChange={(e) => setTaskSetDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Status</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as 'Incomplete' | 'Pending' | 'Completed')}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
              >
                <option value="Pending">Pending</option>
                <option value="Incomplete">Incomplete</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowTaskModal(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded">Cancel</button>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-xs rounded font-semibold">Save Task</button>
            </div>
          </form>
        </div>
      )}

      {/* Topic Modal */}
      {showTopicModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddTopic} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowTopicModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-base font-bold pr-6">Add New Topic</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Unit Number</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 1"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Topic Number</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="e.g. 1"
                  value={topicNumber}
                  onChange={(e) => setTopicNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Topic Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Forces between objects"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Live Preview */}
            {(unitNumber || topicNumber || topicName) && (
              <div className="bg-slate-950 border border-slate-800/80 rounded p-2.5 text-xs text-slate-400 font-mono">
                <span className="text-[10px] uppercase text-indigo-400 block mb-1">Result Preview:</span>
                {unitNumber || '1'}.{topicNumber || '1'}. {topicName.replace(/^[\d.\s]+/, '') || 'Forces between objects'}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowTopicModal(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded">Cancel</button>
              <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-xs rounded font-semibold">Save Topic</button>
            </div>
          </form>
        </div>
      )}

      {/* Score Log Modal */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddScore} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowScoreModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-base font-bold pr-6">Log Assessment Score</h3>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Select Topic</label>
              <select
                value={selectedTopicIndex ?? ''}
                onChange={(e) => setSelectedTopicIndex(Number(e.target.value))}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
              >
                {validTopics.length === 0 && <option value="">No topics created yet</option>}
                {validTopics.map((t) => (
                  <option key={t.originalIndex} value={t.originalIndex}>
                    {t.unitCode}: {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Marks Achieved</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 18"
                  value={marksObtained}
                  onChange={(e) => setMarksObtained(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Total Marks Available</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 20"
                  value={marksAvailable}
                  onChange={(e) => setMarksAvailable(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowScoreModal(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded">Cancel</button>
              <button
                type="submit"
                disabled={validTopics.length === 0}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded font-semibold transition disabled:opacity-50"
              >
                Log Score
              </button>
            </div>
          </form>
        </div>
      )}

      {/* File Upload Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveFile} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowFileModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-base font-bold pr-6">Upload Revision File</h3>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Select Topic</label>
              <select
                value={selectedFileTopicIndex ?? ''}
                onChange={(e) => setSelectedFileTopicIndex(Number(e.target.value))}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none"
              >
                {validTopics.map((t) => (
                  <option key={t.originalIndex} value={t.originalIndex}>
                    {t.unitCode}: {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Choose File</label>
              <input
                type="file"
                required
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-300 focus:outline-none file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowFileModal(false)} className="px-3 py-1.5 bg-slate-800 text-xs rounded">Cancel</button>
              <button type="submit" disabled={!selectedFile} className="px-3 py-1.5 bg-indigo-600 text-xs rounded font-semibold disabled:opacity-50">Upload</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}