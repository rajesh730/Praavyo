'use client';

import Link from 'next/link';
import { ChevronRight, ClipboardCheck, FileSpreadsheet } from 'lucide-react';

/**
 * Exams: the teacher's chooser between the two kinds of result, the same
 * split as the school's Exams page.
 *
 *   - CAS: continuous assessment for Grades 1–5, the exams the school opened
 *     to this teacher (only those not yet published).
 *   - Internal Exam: the school's own papers for Grades 1–10, entered as marks.
 */
export default function ExamsTab({ workspace }) {
  const openCas = workspace.examAccess.filter((row) => row.publishStatus !== 'PUBLISHED').length;

  const options = [
    {
      href: '/teacher/exams/cas',
      icon: ClipboardCheck,
      title: 'CAS',
      grades: 'Grades 1–5',
      text: 'Continuous assessment by theme and learning outcome for the subjects your school opened to you.',
      status: openCas
        ? `${openCas} subject${openCas === 1 ? '' : 's'} open for marks`
        : 'Nothing waiting for marks',
      waiting: openCas > 0,
    },
    {
      href: '/teacher/exams/internal',
      icon: FileSpreadsheet,
      title: 'Internal Exam',
      grades: 'Grades 1–10',
      text: "Marks for the school's own question papers, subject by subject.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {options.map(({ href, icon: Icon, title, grades, text, status, waiting }) => (
        <Link key={href} href={href} className="card group flex gap-4 p-5 transition hover:border-brand">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
            <Icon aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-ink group-hover:text-brand">{title}</span>
              <span className="badge badge-neutral text-xs">{grades}</span>
            </span>
            <span className="mt-1 block text-sm text-muted">{text}</span>
            {status && (
              <span className={`badge mt-3 text-xs ${waiting ? 'badge-brand' : 'badge-neutral'}`}>{status}</span>
            )}
          </span>
          <ChevronRight aria-hidden className="mt-1 shrink-0 text-muted group-hover:text-brand" />
        </Link>
      ))}
    </div>
  );
}
