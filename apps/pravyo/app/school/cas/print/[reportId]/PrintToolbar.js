'use client';

import Link from 'next/link';
import { Printer as FaPrint } from 'lucide-react';

/** Screen-only controls. Hidden from the printed sheet by `.cas-print-hide`. */
export default function PrintToolbar({ reportId, lang, status }) {
  return (
    <div className="cas-print-hide mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/school/cas/student-result" className="font-semibold text-brand">
          ← Student Result
        </Link>
        {status === 'DRAFT' && (
          <span className="badge badge-warning uppercase tracking-wide">
            Draft
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/school/cas/print/${reportId}?lang=${lang === 'ne' ? 'en' : 'ne'}`}
          className="btn btn-secondary inline-flex items-center font-semibold"
        >
          {lang === 'ne' ? 'English' : 'नेपाली'}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary inline-flex items-center gap-2 font-semibold"
        >
          <FaPrint className="text-xs" /> Print A4
        </button>
      </div>
    </div>
  );
}
