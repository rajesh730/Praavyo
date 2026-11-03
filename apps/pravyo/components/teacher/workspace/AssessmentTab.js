'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, FileSpreadsheet, LineChart, PenLine } from 'lucide-react';
import { byGrade, EmptyNote, openMarkEntry } from './shared';

function WorkspaceLink({ href, icon: Icon, title, text }) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition hover:border-brand">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand"><Icon aria-hidden size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <PenLine aria-hidden size={18} className="shrink-0 text-brand" />
    </Link>
  );
}

/** Internal exam marks, and CAS progress of this teacher's own students. */
function InternalExamLink() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <WorkspaceLink
        href="/school/internal-exam/marks"
        icon={FileSpreadsheet}
        title="Internal exam marks"
        text="Terminal exams set by the school, Grades 1–10. Enter marks for your subjects."
      />
      <WorkspaceLink
        href="/school/cas/student-progress"
        icon={LineChart}
        title="Student progress"
        text="CAS progress of the students you teach, subject by subject (Grades 1–5)."
      />
    </div>
  );
}

/** Every CAS exam the school opened to this teacher, grouped by exam, plus internal exams. */
export default function AssessmentTab({ workspace }) {
  const router = useRouter();

  if (workspace.examAccess.length === 0) {
    return (
      <div className="space-y-4">
        <InternalExamLink />
        <EmptyNote icon={ClipboardCheck} title="No CAS exams open for you yet">
          Your school opens a CAS exam for each grade and subject you teach in Grades 1–5. It will appear here, ready for mark entry.
        </EmptyNote>
      </div>
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
      <InternalExamLink />
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
