'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardCheck, Eye, FileSpreadsheet, LineChart, Lock, PenLine } from 'lucide-react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { byGrade, EmptyNote, openMarkEntry } from './shared';

/** A quiet link to another assessment screen; navigation, not an edit action. */
function ToolLink({ href, icon: Icon, title, text }) {
  return (
    <Link
      href={href}
      className="card group flex items-center gap-3 p-3.5 transition hover:border-brand"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-surface-2 text-muted group-hover:bg-brand-soft group-hover:text-brand">
        <Icon aria-hidden size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-muted group-hover:text-brand" />
    </Link>
  );
}

function OtherTools() {
  return (
    <section aria-labelledby="assessment-other-tools" className="space-y-2">
      <h2 id="assessment-other-tools" className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Other assessment work
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <ToolLink
          href="/school/internal-exam/marks"
          icon={FileSpreadsheet}
          title="Internal exam marks"
          text="Marks for the school's own exams, Grades 1–10"
        />
        <ToolLink
          href="/school/cas/student-progress"
          icon={LineChart}
          title="Student progress"
          text="CAS levels of the students you teach, by subject"
        />
      </div>
    </section>
  );
}

/** CAS exams the school opened to this teacher, grouped into one exam at a time. */
function groupExams(examAccess) {
  const exams = new Map();
  examAccess.forEach((row) => {
    const key = row.examId || row.exam;
    if (!exams.has(key)) exams.set(key, { id: key, name: row.exam, current: Boolean(row.currentExam), rows: [] });
    exams.get(key).rows.push(row);
  });
  // Exam ids are ObjectIds, so sorting them puts exams in the order the school
  // created them (First Terminal, Second Terminal, Board ...).
  return [...exams.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((exam) => ({
      ...exam,
      locked: exam.rows.every((row) => row.publishStatus === 'PUBLISHED'),
      rows: [...exam.rows].sort((a, b) => byGrade(a.grade, b.grade) || a.subject.localeCompare(b.subject)),
    }));
}

/** Published results are locked; the school unpublishes in Manage Exams to change them. */
function PublishState({ row }) {
  if (row.publishStatus === 'PUBLISHED') {
    return (
      <span className="badge badge-success mt-1 inline-flex items-center gap-1 text-xs">
        <Lock aria-hidden size={12} /> Published · locked
      </span>
    );
  }
  if (row.publishStatus === 'PARTLY_PUBLISHED') {
    return (
      <span className="badge badge-warning mt-1 inline-flex items-center gap-1 text-xs">
        <Lock aria-hidden size={12} /> Published for {row.publishedStudents} of {row.totalStudents} students
      </span>
    );
  }
  return null;
}

function CasHeader() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
        <ClipboardCheck aria-hidden size={20} />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-ink">CAS assessment</h2>
        <p className="text-sm text-muted">Learning-outcome levels for Grades 1–5. Choose an exam, then a subject.</p>
      </div>
    </div>
  );
}

export default function AssessmentTab({ workspace }) {
  const router = useRouter();
  const exams = groupExams(workspace.examAccess);
  const [chosenExam, setChosenExam] = useRememberedState('teacher-assessment:exam', '');
  // Opens on the exam the school marked current in Manage Exams; without one,
  // on the first exam that is still open for marks. A tab the teacher picks
  // is kept for the rest of the visit.
  const active = exams.find((exam) => exam.id === chosenExam)
    || exams.find((exam) => exam.current)
    || exams.find((exam) => !exam.locked)
    || exams[0];

  if (!active) {
    return (
      <div className="space-y-5">
        <EmptyNote icon={ClipboardCheck} title="No CAS exams open for you yet">
          Your school opens a CAS exam for each grade and subject you teach in Grades 1–5. It will appear here, ready for mark entry.
        </EmptyNote>
        <OtherTools />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden">
        <div className="space-y-4 p-4">
          <CasHeader />
          {exams.length > 1 && (
            <div className="tabs max-w-full" role="tablist" aria-label="CAS exam">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  type="button"
                  role="tab"
                  id={`cas-exam-tab-${exam.id}`}
                  aria-selected={exam.id === active.id}
                  aria-controls="cas-exam-panel"
                  onClick={() => setChosenExam(exam.id)}
                  className="tab"
                >
                  {exam.locked && <Lock aria-label="Published" size={13} />}
                  {exam.name}
                  {exam.current && (
                    <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">Current</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          id="cas-exam-panel"
          role={exams.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={exams.length > 1 ? `cas-exam-tab-${active.id}` : undefined}
        >
          {exams.length === 1 && (
            <p className="border-t border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-muted">{active.name}</p>
          )}
          <ul className="divide-y divide-line border-t border-line">
            {active.rows.map((row) => {
              const locked = row.publishStatus === 'PUBLISHED';
              return (
                <li key={`${row.grade}-${row.subjectId}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{row.subject}</span>
                    <span className="block text-sm text-muted">{row.grade}</span>
                    <PublishState row={row} />
                  </span>
                  <button
                    type="button"
                    onClick={() => openMarkEntry(router, row)}
                    className={`btn btn-sm inline-flex shrink-0 items-center gap-1.5 ${locked ? 'btn-secondary' : 'btn-primary'}`}
                    aria-label={`${locked ? 'View' : 'Enter'} ${active.name} marks for ${row.subject}, ${row.grade}`}
                  >
                    {locked
                      ? <><Eye aria-hidden size={15} /> View marks</>
                      : <><PenLine aria-hidden size={15} /> Enter marks</>}
                  </button>
                </li>
              );
            })}
          </ul>
          {active.rows.some((row) => row.publishStatus !== 'OPEN' && row.publishStatus) && (
            <p className="flex items-start gap-2 border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-muted">
              <Lock aria-hidden size={13} className="mt-0.5 shrink-0" />
              Published results are locked, so their marks cannot be changed. If a mark needs correcting, ask your school to unpublish the exam in Manage Exams.
            </p>
          )}
        </div>

        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Opens the CAS assessment book. Use “Back to Praavyo” there to come back.
        </p>
      </section>

      <OtherTools />
    </div>
  );
}
