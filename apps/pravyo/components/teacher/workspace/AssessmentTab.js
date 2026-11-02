'use client';

import { useRouter } from 'next/navigation';
import { ClipboardCheck, PenLine } from 'lucide-react';
import { byGrade, EmptyNote, openMarkEntry } from './shared';

/** Every exam the school opened to this teacher, grouped by exam. */
export default function AssessmentTab({ workspace }) {
  const router = useRouter();

  if (workspace.examAccess.length === 0) {
    return (
      <EmptyNote icon={ClipboardCheck} title="No exams open for you yet">
        Your school opens an exam for each grade and subject you teach. It will appear here, ready for mark entry.
      </EmptyNote>
    );
  }

  const exams = new Map();
  workspace.examAccess.forEach((row) => {
    const key = row.examId || row.exam;
    if (!exams.has(key)) exams.set(key, { name: row.exam, rows: [] });
    exams.get(key).rows.push(row);
  });

  return (
    <div className="space-y-4">
      {[...exams.entries()].map(([key, exam]) => (
        <section key={key} className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <h2 className="font-semibold text-ink">{exam.name}</h2>
            <span className="badge badge-neutral text-xs">{exam.rows.length} to enter</span>
          </div>
          <ul className="divide-y divide-line">
            {[...exam.rows]
              .sort((a, b) => byGrade(a.grade, b.grade) || a.subject.localeCompare(b.subject))
              .map((row) => (
                <li key={`${row.grade}-${row.subjectId}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{row.subject}</span>
                    <span className="block text-sm text-muted">{row.grade}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openMarkEntry(router, row)}
                    className="btn btn-primary btn-sm inline-flex shrink-0 items-center gap-1.5"
                  >
                    <PenLine aria-hidden size={15} /> Enter marks
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <p className="text-center text-xs text-muted">Marks are saved in the CAS assessment book. Use “Back to Praavyo” there to return here.</p>
    </div>
  );
}
