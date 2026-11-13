'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, CircleCheck, ClipboardCheck, Eye, FileSpreadsheet, LineChart, Lock, PenLine } from 'lucide-react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import EmptyState from '@/components/EmptyState';
import { byGrade, openMarkEntry } from './shared';
import {
  CardHeading, ClearFiltersButton, FilterPanel, FilterTabs, MetricGrid, ResultCount,
  SearchField, SelectField, TableCard, TH, THEAD,
} from './ui';

/** A quiet link to another assessment screen; navigation, not an edit action. */
function ToolLink({ href, icon: Icon, title, text }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-card border border-line-strong bg-surface p-3.5 shadow-card transition hover:border-brand"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-muted group-hover:border-brand-line group-hover:bg-brand-soft group-hover:text-brand">
        <Icon aria-hidden size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs font-semibold text-muted">{text}</span>
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

// A CAS exam is published for the whole grade at once, so a subject is either
// open for marks or published and locked — never "partly" published.
const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open for marks' },
  { value: 'PUBLISHED', label: 'Published · locked' },
];

const statusOf = (row) => (row.publishStatus === 'PUBLISHED' ? 'PUBLISHED' : 'OPEN');

/** Published results are locked; the school unpublishes in Manage Exams to change them. */
function PublishState({ row }) {
  if (statusOf(row) === 'PUBLISHED') {
    return (
      <span className="badge badge-success inline-flex items-center gap-1 text-xs">
        <Lock aria-hidden size={12} /> Published · locked
      </span>
    );
  }
  return (
    <span className="badge badge-brand inline-flex items-center gap-1 text-xs">
      <PenLine aria-hidden size={12} /> Open for marks
    </span>
  );
}

function MarksButton({ row, examName, onOpen }) {
  const locked = row.publishStatus === 'PUBLISHED';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`btn btn-sm inline-flex shrink-0 items-center gap-1.5 ${locked ? 'btn-secondary' : 'btn-primary'}`}
      aria-label={`${locked ? 'View' : 'Enter'} ${examName} marks for ${row.subject}, ${row.grade}`}
    >
      {locked
        ? <><Eye aria-hidden size={15} /> View marks</>
        : <><PenLine aria-hidden size={15} /> Enter marks</>}
    </button>
  );
}

export default function AssessmentTab({ workspace }) {
  const router = useRouter();
  const exams = groupExams(workspace.examAccess);
  const [chosenExam, setChosenExam] = useRememberedState('teacher-assessment:exam', '');
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useRememberedState('teacher-assessment:grade', 'ALL');
  const [status, setStatus] = useRememberedState('teacher-assessment:status', 'ALL');
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
        <div className="card">
          <EmptyState
            icon={ClipboardCheck}
            title="No CAS exams open for you yet"
            description="Your school opens a CAS exam for each grade and subject you teach in Grades 1–5. It will appear here, ready for mark entry."
          />
        </div>
        <OtherTools />
      </div>
    );
  }

  const allRows = workspace.examAccess;
  const countOf = (value) => allRows.filter((row) => statusOf(row) === value).length;

  const grades = [...new Set(active.rows.map((row) => row.grade))].sort(byGrade);
  const activeGrade = grades.includes(grade) ? grade : 'ALL';
  const activeStatus = STATUS_OPTIONS.some((option) => option.value === status) ? status : 'ALL';
  const needle = query.trim().toLowerCase();
  const rows = active.rows.filter((row) =>
    (activeGrade === 'ALL' || row.grade === activeGrade)
    && (activeStatus === 'ALL' || statusOf(row) === activeStatus)
    && (!needle || row.subject.toLowerCase().includes(needle) || row.grade.toLowerCase().includes(needle)));
  const filtered = needle || activeGrade !== 'ALL' || activeStatus !== 'ALL';

  const clear = () => {
    setQuery('');
    setGrade('ALL');
    setStatus('ALL');
  };

  const tabs = exams.map((exam) => ({
    key: exam.id,
    label: exam.name,
    icon: exam.locked ? Lock : ClipboardCheck,
    count: exam.rows.length,
    hint: exam.current
      ? <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">Current</span>
      : null,
  }));

  return (
    <div className="space-y-4">
      <MetricGrid
        cards={[
          { label: 'Assigned Subjects', value: allRows.length, note: `Across ${exams.length} exam${exams.length === 1 ? '' : 's'}`, icon: BookOpen, tone: 'brand' },
          { label: 'Open for Marks', value: countOf('OPEN'), note: 'Waiting for your entry', icon: PenLine, tone: 'success' },
          { label: 'Published', value: countOf('PUBLISHED'), note: 'Locked, view only', icon: CircleCheck, tone: 'neutral' },
        ]}
      />

      <FilterPanel>
        <SearchField value={query} onChange={setQuery} placeholder="Search subject or grade..." />
        <SelectField label="Filter by grade" value={activeGrade} onChange={setGrade} options={grades} allLabel="All My Grades" />
        <SelectField label="Filter by status" value={activeStatus} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All Status" />
        <ClearFiltersButton onClick={clear} disabled={!filtered} />
      </FilterPanel>

      <TableCard>
        <div className="border-b border-line-strong p-4">
          <CardHeading
            icon={ClipboardCheck}
            title="CAS assessment"
            description="Learning-outcome levels for Grades 1–5. Choose an exam, then a subject."
          />
        </div>

        {exams.length > 1
          ? <FilterTabs tabs={tabs} active={active.id} onChange={setChosenExam} label="CAS exam" />
          : (
            <p className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-semibold text-muted">
              {active.name}
              {active.current && <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success">Current</span>}
            </p>
          )}

        <div className="border-b border-line-strong px-4 py-2.5">
          <ResultCount shown={rows.length} total={active.rows.length} noun="subject" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No subjects match these filters"
            description="Try another grade or status, or clear the filters."
            actionLabel="Clear Filters"
            onAction={clear}
          />
        ) : (<>
          <ul className="divide-y divide-line sm:hidden">
            {rows.map((row) => (
              <li key={`${row.grade}-${row.subjectId}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{row.subject}</span>
                  <span className="mb-1 block text-xs font-semibold text-muted">{row.grade}</span>
                  <PublishState row={row} />
                </span>
                <MarksButton row={row} examName={active.name} onOpen={() => openMarkEntry(router, row)} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm text-ink">
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Subject</th>
                  <th className={TH}>Grade</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={`${row.grade}-${row.subjectId}`} className="transition-colors hover:bg-surface-2">
                    <td className={TH}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
                          <BookOpen aria-hidden size={16} />
                        </span>
                        <span className="min-w-0 truncate font-semibold text-ink">{row.subject}</span>
                      </div>
                    </td>
                    <td className={`${TH} font-semibold text-ink`}>{row.grade}</td>
                    <td className={TH}><PublishState row={row} /></td>
                    <td className={`${TH} text-right`}>
                      <MarksButton row={row} examName={active.name} onOpen={() => openMarkEntry(router, row)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}

        {active.rows.some((row) => row.publishStatus !== 'OPEN' && row.publishStatus) && (
          <p className="flex items-start gap-2 border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-muted">
            <Lock aria-hidden size={13} className="mt-0.5 shrink-0" />
            Published results are locked, so their marks cannot be changed. If a mark needs correcting, ask your school to unpublish the exam in Manage Exams.
          </p>
        )}

        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Opens the CAS assessment book. Use “Back to Praavyo” there to come back.
        </p>
      </TableCard>

      <OtherTools />
    </div>
  );
}
