import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/authOptions';
import CasLayout from '@pravyo/cas/components/CasLayout';
import InternalExamLocked from '@/components/exams/InternalExamLocked';
import { isInternalExamLocked } from '@/lib/exams/internalExamLock';

export const dynamic = 'force-dynamic';

/**
 * The teacher's internal exam workspace: the same screen the school uses, on the
 * teacher's own URL, talking to the teacher API (/api/teacher/exams/internal/...).
 *
 * A convenience gate, not the security boundary: every teacher API route
 * re-checks the teacher (casRoute `teacherHandler`) and the service limits
 * them to the grades and subjects the school assigned.
 */
export default async function TeacherExamLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect('/login?as=teacher');
  // The school enters and manages marks in its own area.
  if (session.user.role !== 'TEACHER') redirect('/school/internal-exam/marks');
  // Not ready yet: the Super Admin keeps Internal Exam locked (its API refuses too).
  if (await isInternalExamLocked()) {
    return <InternalExamLocked backHref="/teacher/dashboard?tab=exams" />;
  }
  return <CasLayout area="internal" audience="teacher">{children}</CasLayout>;
}
