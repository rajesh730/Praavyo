import { redirect } from 'next/navigation';

/** The exam chooser (CAS or Internal Exam) lives on the teacher dashboard. */
export default function TeacherExamsPage() {
  redirect('/teacher/dashboard?tab=exams');
}
