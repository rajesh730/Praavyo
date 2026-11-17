'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { CalendarCheck, ChevronLeft, ChevronRight, GraduationCap, LineChart, Users } from 'lucide-react';
import AppDate from '@/components/common/AppDate';
import EmptyState from '@/components/EmptyState';
import Modal from '@/components/Modal';
import { byGrade, gradeSummaries } from './shared';
import {
  ClearFiltersButton, downloadCsv, ExportButton, FilterPanel, Initials, MetricGrid,
  ResultCount, SearchField, SelectField, TableCard, TH, THEAD, usePagedList,
} from './ui';

/**
 * Published results, one student at a time: choose the exam (and grade,
 * section), pick a student, see their result.
 *
 * What a teacher sees depends on their role in that grade:
 *   class teacher   — the whole published card: every subject, the overall
 *                     grade and GPA, and progress across exams;
 *   subject teacher — only their own subjects' results and progress, never
 *                     the overall result. (Students and parents always see
 *                     the full card in their own dashboards.)
 */

const examKey = (row) => row.examId || row.exam || 'result';

/** Groups the flat published rows into one entry per student per exam. */
function groupResults(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.studentId || `${row.grade}|${row.rollNumber}|${row.studentName}`}|${examKey(row)}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        studentKey: row.studentId || `${row.grade}|${row.rollNumber}|${row.studentName}`,
        studentName: row.studentName,
        rollNumber: row.rollNumber,
        section: row.section || '',
        grade: row.grade,
        examKey: examKey(row),
        exam: row.exam || 'Result',
        publishedAt: row.publishedAt,
        classResult: null,
        subjects: [],
      });
    }
    const entry = map.get(key);
    if (row.kind === 'CLASS_RESULT') entry.classResult = row;
    else entry.subjects.push(row);
    if (row.publishedAt && (!entry.publishedAt || row.publishedAt > entry.publishedAt)) entry.publishedAt = row.publishedAt;
  });
  return [...map.values()];
}

const byRoll = (a, b) =>
  String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true })
  || a.studentName.localeCompare(b.studentName);

function GradeBadge({ grade, absent, tone = 'success' }) {
  if (absent) return <span className="badge badge-warning text-xs">Absent</span>;
  return <span className={`badge ${tone === 'brand' ? 'badge-brand' : 'badge-success'} text-xs`}>{grade || '—'}</span>;
}

export default function ResultsTab({ workspace }) {
  const [query, setQuery] = useState('');
  const [exam, setExam] = useRememberedState('teacher-results:exam', '');
  const [grade, setGrade] = useRememberedState('teacher-results:grade', 'ALL');
  const [section, setSection] = useRememberedState('teacher-results:section', 'ALL');
  const [openKey, setOpenKey] = useState('');

  const entries = useMemo(() => groupResults(workspace.publishedResults), [workspace.publishedResults]);
  const classGrades = useMemo(
    () => new Set(gradeSummaries(workspace).filter((row) => row.classTeacher).map((row) => row.grade)),
    [workspace],
  );

  // Exams newest first, so the screen opens on the latest published result.
  const exams = useMemo(() => {
    const latest = new Map();
    entries.forEach((entry) => {
      const seen = latest.get(entry.examKey);
      if (!seen || String(entry.publishedAt || '') > String(seen.publishedAt || '')) {
        latest.set(entry.examKey, { value: entry.examKey, label: entry.exam, publishedAt: entry.publishedAt });
      }
    });
    return [...latest.values()].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  }, [entries]);
  const activeExam = exams.some((option) => option.value === exam) ? exam : exams[0]?.value || '';
  const inExam = entries.filter((entry) => entry.examKey === activeExam);
  const grades = [...new Set(inExam.map((entry) => entry.grade))].sort(byGrade);
  const activeGrade = grades.includes(grade) ? grade : 'ALL';
  const sections = [...new Set(inExam
    .filter((entry) => activeGrade === 'ALL' || entry.grade === activeGrade)
    .map((entry) => entry.section).filter(Boolean))].sort();
  const activeSection = sections.includes(section) ? section : 'ALL';
  const needle = query.trim().toLowerCase();
  const rows = inExam
    .filter((entry) =>
      (activeGrade === 'ALL' || entry.grade === activeGrade)
      && (activeSection === 'ALL' || entry.section === activeSection)
      && (!needle || entry.studentName.toLowerCase().includes(needle) || String(entry.rollNumber).toLowerCase() === needle))
    .sort((a, b) => byGrade(a.grade, b.grade) || byRoll(a, b));
  const filterKey = `${activeExam}|${activeGrade}|${activeSection}|${needle}`;
  const { pageItems, pagination } = usePagedList(rows, { resetKey: filterKey });

  if (entries.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={GraduationCap}
          title="No published results yet"
          description="When the school publishes an exam, your students' results appear here. Class teachers see the whole result; subject teachers see their own subject."
        />
      </div>
    );
  }

  const openIndex = rows.findIndex((entry) => entry.key === openKey);
  const open = openIndex >= 0 ? rows[openIndex] : null;
  const isClass = (entry) => classGrades.has(entry.grade) && Boolean(entry.classResult);
  const latest = inExam.reduce((max, entry) => (entry.publishedAt && (!max || entry.publishedAt > max) ? entry.publishedAt : max), null);
  const filtered = needle || activeGrade !== 'ALL' || activeSection !== 'ALL';

  const clear = () => {
    setQuery('');
    setGrade('ALL');
    setSection('ALL');
  };

  const exportCsv = () => downloadCsv(
    `Results - ${exams.find((option) => option.value === activeExam)?.label || 'exam'}.csv`,
    ['Roll Number', 'Student', 'Grade', 'Section', 'Result'],
    rows.map((entry) => [
      entry.rollNumber, entry.studentName, entry.grade, entry.section,
      isClass(entry)
        ? `${entry.classResult.overallGrade || '—'}${entry.classResult.gpa != null ? ` (GPA ${entry.classResult.gpa})` : ''}`
        : entry.subjects.map((row) => `${row.subject}: ${row.absent ? 'Absent' : row.gradeResult || '—'}`).join('; '),
    ]),
  );

  return (
    <div className="space-y-4">
      <MetricGrid
        cards={[
          { label: 'Students', value: inExam.length, note: 'With a published result', icon: Users, tone: 'brand' },
          { label: 'Exams Published', value: exams.length, note: exams.slice(0, 2).map((option) => option.label).join(', '), icon: GraduationCap, tone: 'success' },
          { label: 'Published On', value: latest ? <AppDate value={latest} /> : '—', note: 'Selected exam', icon: CalendarCheck, tone: 'warning', small: true },
        ]}
      />

      <FilterPanel columns="xl:grid-cols-[200px_160px_160px_minmax(200px,1fr)_auto_auto]">
        <SelectField
          label="Exam"
          value={activeExam}
          onChange={(value) => { setExam(value); setOpenKey(''); }}
          options={exams.map(({ value, label }) => ({ value, label }))}
          allLabel={exams.length ? 'Choose exam' : 'No exams'}
          hideAll
        />
        <SelectField label="Filter by grade" value={activeGrade} onChange={(value) => { setGrade(value); setSection('ALL'); }} options={grades} allLabel="All My Grades" />
        <SelectField label="Filter by section" value={activeSection} onChange={setSection} options={sections} allLabel="All Sections" />
        <SearchField value={query} onChange={setQuery} placeholder="Search student or roll number..." />
        <ClearFiltersButton onClick={clear} disabled={!filtered} />
        <ExportButton onClick={exportCsv} disabled={rows.length === 0} />
      </FilterPanel>

      <TableCard footer={rows.length > 0 ? pagination : null}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong px-4 py-2.5">
          <ResultCount shown={rows.length} total={inExam.length} noun="student" />
          <p className="text-xs font-semibold text-muted">Click a student to see their result.</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No students match these filters"
            description="Try another grade, section or name, or clear the filters."
            actionLabel="Clear Filters"
            onAction={clear}
          />
        ) : (<>
          <ul className="divide-y divide-line sm:hidden">
            {pageItems.map((entry) => (
              <li key={entry.key}>
                <button type="button" onClick={() => setOpenKey(entry.key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <Initials name={entry.studentName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{entry.studentName}</span>
                    <span className="block truncate text-xs font-semibold text-muted">
                      Roll {entry.rollNumber || '—'} · {entry.grade}{entry.section ? ` · ${entry.section}` : ''}
                    </span>
                  </span>
                  <RowResult entry={entry} isClass={isClass(entry)} compact />
                  <ChevronRight aria-hidden size={16} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm text-ink">
              <thead className={THEAD}>
                <tr>
                  <th className={`${TH} w-20`}>Roll</th>
                  <th className={TH}>Student</th>
                  <th className={TH}>Grade</th>
                  <th className={TH}>Section</th>
                  <th className={TH}>Result</th>
                  <th className={`${TH} w-10`}><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((entry) => (
                  <tr
                    key={entry.key}
                    onClick={() => setOpenKey(entry.key)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className={`${TH} tabular-nums font-semibold text-muted`}>{entry.rollNumber || '—'}</td>
                    <td className={TH}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); setOpenKey(entry.key); }} className="flex items-center gap-3 text-left">
                        <Initials name={entry.studentName} />
                        <span className="min-w-0 truncate font-semibold text-ink hover:text-brand">{entry.studentName}</span>
                      </button>
                    </td>
                    <td className={`${TH} font-semibold text-ink`}>{entry.grade}</td>
                    <td className={`${TH} text-muted`}>{entry.section || '—'}</td>
                    <td className={TH}><RowResult entry={entry} isClass={isClass(entry)} /></td>
                    <td className={TH}><ChevronRight aria-hidden size={16} className="text-muted" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </TableCard>

      <Modal
        isOpen={Boolean(open)}
        onClose={() => setOpenKey('')}
        title={open ? `${open.studentName} · ${open.exam}` : ''}
      >
        {open && (
          <StudentResult
            entry={open}
            isClass={isClass(open)}
            history={entries.filter((entry) => entry.studentKey === open.studentKey)}
            onPrevious={openIndex > 0 ? () => setOpenKey(rows[openIndex - 1].key) : null}
            onNext={openIndex < rows.length - 1 ? () => setOpenKey(rows[openIndex + 1].key) : null}
            position={`${openIndex + 1} of ${rows.length}`}
          />
        )}
      </Modal>
    </div>
  );
}

/** The result shown in a student's row of the list. */
function RowResult({ entry, isClass, compact = false }) {
  if (isClass) {
    const { overallGrade, gpa } = entry.classResult;
    return (
      <span className="inline-flex shrink-0 items-center gap-2">
        <GradeBadge grade={overallGrade} tone="brand" />
        {gpa != null && <span className="text-xs font-semibold tabular-nums text-muted">GPA {gpa}</span>}
      </span>
    );
  }
  if (compact) {
    const first = entry.subjects[0];
    return first ? <GradeBadge grade={first.gradeResult} absent={first.absent} /> : null;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {entry.subjects.map((row) => (
        <span key={row.subject} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          {row.subject} <GradeBadge grade={row.gradeResult} absent={row.absent} />
        </span>
      ))}
    </span>
  );
}

/** One student's result for the chosen exam, and their progress across exams. */
function StudentResult({ entry, isClass, history, onPrevious, onNext, position }) {
  const ordered = [...history].sort((a, b) => String(a.publishedAt || '').localeCompare(String(b.publishedAt || '')));
  const subjectRows = isClass ? entry.classResult.subjects || [] : entry.subjects;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Initials name={entry.studentName} large />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{entry.studentName}</p>
            <p className="truncate text-xs font-semibold text-muted">
              Roll {entry.rollNumber || '—'} · {entry.grade}{entry.section ? ` · Section ${entry.section}` : ''} · Published <AppDate value={entry.publishedAt} fallback="—" />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">{position}</span>
          <button type="button" onClick={onPrevious || undefined} disabled={!onPrevious} className="btn-icon btn-secondary btn-sm" aria-label="Previous student">
            <ChevronLeft aria-hidden size={16} />
          </button>
          <button type="button" onClick={onNext || undefined} disabled={!onNext} className="btn-icon btn-secondary btn-sm" aria-label="Next student">
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">
          {isClass ? `${entry.exam} — full result` : `${entry.exam} — your subject${subjectRows.length === 1 ? '' : 's'}`}
        </h3>
        <div className="overflow-x-auto rounded-card border border-line-strong">
          <table className="w-full text-left text-sm text-ink">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Subject</th>
                {isClass && <th className={`${TH} text-center`}>Credit</th>}
                <th className={`${TH} text-center`}>Achievement</th>
                {isClass && <th className={`${TH} text-center`}>Grade point</th>}
                <th className={`${TH} text-center`}>Grade</th>
                <th className={TH}>Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subjectRows.map((row) => {
                const title = row.title || row.subject;
                // On a subject row `grade` is the student's class ("Grade 2");
                // the letter grade is `gradeResult`.
                const grade = isClass ? row.grade : row.gradeResult;
                return (
                  <tr key={title}>
                    <td className={`${TH} font-semibold`}>{title}</td>
                    {isClass && <td className={`${TH} text-center tabular-nums text-muted`}>{row.creditHours ?? '—'}</td>}
                    <td className={`${TH} text-center tabular-nums`}>
                      {row.absent ? 'Absent'
                        : row.achievement != null ? `${row.achievement}%`
                          : row.obtained != null ? `${row.obtained}/${row.fullMarks ?? '—'}` : '—'}
                    </td>
                    {isClass && <td className={`${TH} text-center tabular-nums text-muted`}>{row.gradePoint ?? '—'}</td>}
                    <td className={`${TH} text-center`}><GradeBadge grade={grade} absent={row.absent} /></td>
                    <td className={`${TH} text-muted`}>{row.remark || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            {isClass && (
              <tfoot className="border-t border-line-strong bg-surface-2">
                <tr>
                  <td className={`${TH} font-semibold`} colSpan={3}>Overall</td>
                  <td className={`${TH} text-center font-semibold tabular-nums`}>{entry.classResult.gpa != null ? `GPA ${entry.classResult.gpa}` : '—'}</td>
                  <td className={`${TH} text-center`}><GradeBadge grade={entry.classResult.overallGrade} tone="brand" /></td>
                  <td className={`${TH} font-semibold`}>{entry.classResult.overallRemark || '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {ordered.length > 1 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Progress across exams</h3>
          <div className="overflow-x-auto rounded-card border border-line-strong">
            <table className="w-full text-left text-sm text-ink">
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Exam</th>
                  {isClass
                    ? <><th className={`${TH} text-center`}>GPA</th><th className={`${TH} text-center`}>Grade</th></>
                    : entry.subjects.map((row) => <th key={row.subject} className={`${TH} text-center`}>{row.subject}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ordered.map((item) => (
                  <tr key={item.key} className={item.key === entry.key ? 'bg-surface-2' : ''}>
                    <td className={`${TH} font-semibold`}>{item.exam}</td>
                    {isClass
                      ? <>
                          <td className={`${TH} text-center tabular-nums`}>{item.classResult?.gpa ?? '—'}</td>
                          <td className={`${TH} text-center`}><GradeBadge grade={item.classResult?.overallGrade} tone="brand" /></td>
                        </>
                      : entry.subjects.map((row) => {
                        const match = item.subjects.find((subject) => subject.subject === row.subject);
                        return (
                          <td key={row.subject} className={`${TH} text-center`}>
                            {match ? <GradeBadge grade={match.gradeResult} absent={match.absent} /> : '—'}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Link
        href="/teacher/exams/cas/progress"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
      >
        <LineChart aria-hidden size={16} /> Open student progress (learning-outcome levels)
      </Link>
    </div>
  );
}
