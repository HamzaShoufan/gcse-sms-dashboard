import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

export interface PracticeLog {
  score: number;
  maxScore: number;
  testName: string;
}

export interface SubjectTopic {
  unitCode: string;
  title: string;
  logs: PracticeLog[];
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  targetGrade: string;
  currentGrade: string; // Replaced targetScore
  topics: SubjectTopic[];
}

export interface Task {
  id: string;
  subjectId?: string;
  title: string;
  type: 'HOMEWORK' | 'TEST';
  dueDate: string;
  status: string;
  priority: string;
  estimatedHours: number;
}

export async function getSubjectById(subjectId: string): Promise<Subject | null> {
  const docRef = doc(db, 'subjects', subjectId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return { id: docSnap.id, ...docSnap.data() } as Subject;
}

export async function getTasksBySubject(subjectId: string): Promise<Task[]> {
  const q = query(collection(db, 'tasks'), where('subjectId', '==', subjectId));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Task[];
}