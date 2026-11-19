import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/authOptions';
import CasLayout from '@pravyo/cas/components/CasLayout';

export const dynamic = 'force-dynamic';

/**
 * Gate for every Internal Exam screen; same rules as the CAS area.
 *
 * This is a convenience check, not the security boundary — each API route
 * re-authorizes independently (see @pravyo/cas/lib/casRoute). It exists so an
 * unauthenticated visitor lands on the sign-in page instead of an empty shell.
 */
export default async function CasAreaLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.error) {
    redirect('/login');
  }

  // Teachers enter marks in their own area (/teacher/exams/...), on the
  // teacher API. This area and its API belong to the school.
  if (session.user.role === 'TEACHER') {
    redirect('/teacher/dashboard?tab=exams');
  }

  // Guardians and students read published results in their own dashboards.
  // CAS deliberately does not rebuild that portal.
  if (session.user.role !== 'SCHOOL_ADMIN') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md text-center">
          <h1 className="font-semibold text-ink">
            Internal exams are for schools
          </h1>
          <p className="mt-2 text-sm text-muted">
            Published results appear in your dashboard under Student Result.
          </p>
          <Link
            href="/"
            className="btn btn-primary mt-5 inline-flex items-center justify-center font-semibold"
          >
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return <CasLayout area="internal">{children}</CasLayout>;
}
