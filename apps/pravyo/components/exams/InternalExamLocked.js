import Link from 'next/link';
import { Lock } from 'lucide-react';

/**
 * Shown instead of every Internal Exam screen while the Super Admin keeps the
 * feature locked (lib/exams/internalExamLock.js).
 */
export default function InternalExamLocked({ backHref, backLabel = 'Back to Exams' }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-2 px-4">
      <div className="card max-w-md p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-warning-soft text-warning">
          <Lock aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Internal Exam is locked</h1>
        <p className="mt-2 text-sm text-muted">
          This section is not ready yet, so nobody can enter it for now. It will
          open once Praavyo enables it. CAS works as usual.
        </p>
        <Link
          href={backHref}
          className="btn btn-primary mt-5 inline-flex items-center justify-center font-semibold"
        >
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
