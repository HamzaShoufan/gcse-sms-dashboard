'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';

interface Subject {
  id: string;
  name: string;
  code: string;
  currentGrade?: string | number;
  targetGrade?: string | number;
}

export default function Dashboard() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New Subject Form Inputs
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newCurrentGrade, setNewCurrentGrade] = useState('');
  const [newTargetGrade, setNewTargetGrade] = useState('');

  async function fetchSubjects() {
    try {
      const querySnapshot = await getDocs(collection(db, 'subjects'));
      const list: Subject[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Subject[];
      setSubjects(list);
    } catch (err) {
      console.error('Error loading subjects:', err);
    } {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleGoogleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery.trim())}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName || !newSubjectCode) return;

    try {
      await addDoc(collection(db, 'subjects'), {
        name: newSubjectName,
        code: newSubjectCode,
        currentGrade: newCurrentGrade || 'N/A',
        targetGrade: newTargetGrade || 'N/A',
        tasks: [],
        topics: [],
        files: [],
      });

      setNewSubjectName('');
      setNewSubjectCode('');
      setNewCurrentGrade('');
      setNewTargetGrade('');
      setShowSubjectModal(false);
      fetchSubjects();
    } catch (err) {
      console.error('Error adding subject:', err);
    }
  }

  return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-8 space-y-8 w-full">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Academic Dashboard</h1>
          <p className="text-xs text-slate-400 mt-1">Manage specifications, revision notes, and exam targets.</p>
        </div>
        <button
          onClick={() => setShowSubjectModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2.5 rounded-lg font-semibold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          <span>+ Add Subject</span>
        </button>
      </div>

      {/* Professional Google Search Bar */}
      <section className="w-full flex justify-center py-2">
        <form
          onSubmit={handleGoogleSearch}
          className="w-full max-w-3xl relative flex items-center group"
        >
          {/* Search Icon */}
          <div className="absolute left-4 pointer-events-none text-slate-400 group-focus-within:text-indigo-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Input Box */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Google or type a URL..."
            className="w-full bg-slate-900/90 hover:bg-slate-900 text-slate-100 text-sm rounded-2xl pl-12 pr-28 py-3.5 border border-slate-800 focus:border-indigo-500/80 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none transition shadow-inner placeholder:text-slate-500 font-medium"
          />

          {/* Action Buttons inside Input */}
          <div className="absolute right-3 flex items-center gap-2">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-500 hover:text-slate-300 transition p-1"
                title="Clear query"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            <button
              type="submit"
              className="bg-slate-800 hover:bg-indigo-600 hover:text-white border border-slate-700/60 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-sm"
            >
              Search
            </button>
          </div>
        </form>
      </section>

      {/* Subject Cards Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-200">Enrolled Subjects</h2>
          <span className="text-xs font-mono text-slate-500">{subjects.length} Subjects Total</span>
        </div>

        {loading ? (
          <div className="p-8 text-slate-400 font-mono text-sm">Loading subject modules...</div>
        ) : subjects.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
            <p className="text-xs text-slate-500">No subjects created yet. Click above to add your first subject module.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subj) => (
              <Link
                key={subj.id}
                href={`/subjects/${subj.id}`}
                className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 transition duration-200 group flex flex-col justify-between space-y-6 hover:shadow-xl hover:shadow-indigo-500/5"
              >
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-400">{subj.code}</span>
                  <h3 className="text-xl font-bold text-slate-100 group-hover:text-indigo-300 transition truncate">{subj.name}</h3>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-mono">Current</span>
                    <span className="font-bold text-amber-400 text-sm">{subj.currentGrade || 'N/A'}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-500 uppercase font-mono">Target</span>
                    <span className="font-bold text-emerald-400 text-sm">{subj.targetGrade || 'N/A'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddSubject} className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md space-y-4 relative">
            <button
              type="button"
              onClick={() => setShowSubjectModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h3 className="text-base font-bold pr-6">Add New Subject</h3>
            
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Subject Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Physics"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1">Subject / Specification Code</label>
              <input
                type="text"
                required
                placeholder="e.g. 9201"
                value={newSubjectCode}
                onChange={(e) => setNewSubjectCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Current Grade</label>
                <input
                  type="text"
                  placeholder="e.g. 7"
                  value={newCurrentGrade}
                  onChange={(e) => setNewCurrentGrade(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Target Grade</label>
                <input
                  type="text"
                  placeholder="e.g. 9"
                  value={newTargetGrade}
                  onChange={(e) => setNewTargetGrade(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubjectModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-xs rounded hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs rounded font-semibold transition"
              >
                Create Subject
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}