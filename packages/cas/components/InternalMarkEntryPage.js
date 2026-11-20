'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ClipboardList, Save } from 'lucide-react';
import { internalExamResult } from '@pravyo/core/internalExamResult';
import { useCas } from './CasLayout.js';
import { casFetch, useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';
import StudentSearchBox from './ui/StudentSearchBox.js';

/**
 * Each student's progress in the tab being filled, coloured like CAS
 * Assessment: green = every mark in, yellow = some, red = none.
 */
const MARK_STATUS = {
  complete: { dot: 'bg-success', cell: 'bg-success-soft', en: 'All marks entered', ne: 'सबै अङ्क भरियो' },
  partial: { dot: 'bg-warning', cell: 'bg-warning-soft', en: 'Some marks entered', ne: 'केही अङ्क भरियो' },
  none: { dot: 'bg-danger', cell: 'bg-danger-soft', en: 'No marks yet', ne: 'अङ्क भरिएको छैन' },
};
const ABSENT = /^(ab|a|absent)$/i;

function statusOf(progress) {
  if (!progress?.total) return null;
  if (progress.entered >= progress.total) return 'complete';
  return progress.entered > 0 ? 'partial' : 'none';
}

const EMPTY = {};

function columnsFor(subject) {
  return subject.columns?.length
    ? subject.columns
    : [{ key: 'TH', part: 'theory', label: 'TH', fullMarks: subject.fullMarks }];
}

function entryColumnsFor(subject, entryMode) {
  return columnsFor(subject).filter((column) => column.part === entryMode);
}

function subjectEntry(entry) {
  if (!entry) return { theory: null, internal: {}, absent: false };
  return {
    theory: typeof entry.theory === 'number' ? entry.theory : (typeof entry.marks === 'number' ? entry.marks : null),
    internal: { ...(entry.internal || {}) },
    absent: Boolean(entry.absent),
  };
}

/**
 * Internal Exam mark entry in two steps, each its own simple table:
 *   1. Theory    one TH column per subject
 *   2. Internal  one subject at a time: only the fields set in Manage Exams
 * Each cell is the input itself (no box inside the cell), like a register.
 * Totals and grades live on the Results page. Typed changes are kept across
 * the steps and saved together.
 */
export default function InternalMarkEntryPage() {
  const { t, api } = useCas();
  const filters = useInternalExamFilters();
  const { exam, section } = filters;
  const sheetPath = exam ? `${api.internal('/sheet')}?${new URLSearchParams({ exam: exam.id, ...(section ? { section } : {}) })}` : null;
  const sheetQuery = useCasQuery(sheetPath);
  const sheet = sheetQuery.data;
  const { run, pending, error, success, setError } = useCasMutation();
  const scope = `${exam?.id || ''}:${section}`;
  const [draftState, setDraftState] = useState({ scope, cells: {} });
  // 'theory' | 'internal'
  const [entryMode, setEntryMode] = useState('theory');
  const [internalSubjectId, setInternalSubjectId] = useState('');
  // Find a student (one box: pick or type) and show only a status.
  const [findStudent, setFindStudent] = useState('');
  const [findText, setFindText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const drafts = draftState.scope === scope ? draftState.cells : EMPTY;
  const setDrafts = (update) => setDraftState((current) => ({
    scope,
    cells: typeof update === 'function' ? update(current.scope === scope ? current.cells : {}) : update,
  }));
  const dirtyCount = Object.values(drafts).reduce((sum, subjects) => sum + Object.values(subjects).reduce((count, cells) => count + Object.keys(cells).length, 0), 0);

  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const subjects = useMemo(() => sheet?.subjects || [], [sheet]);
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);

  function savedText(studentId, subjectId, column) {
    const entry = sheet?.marks?.[studentId]?.[subjectId];
    if (!entry) return '';
    if (entry.absent) return 'AB';
    const value = column.part === 'theory' ? (entry.theory ?? entry.marks) : entry.internal?.[column.key];
    return value === null || value === undefined ? '' : String(value);
  }

  const cellText = (studentId, subjectId, column) => drafts[studentId]?.[subjectId]?.[column.key] ?? savedText(studentId, subjectId, column);

  /**
   * A keystroke in a mark cell. Refused, with a message, when it would make a
   * mark above the column's full marks or something that is not a mark
   * ("AB" for absent is allowed), so a wrong mark can never be typed.
   */
  function typeCell(student, subject, column, text) {
    const partial = /^(a|ab|absent|abs|abse|absen)$/i.test(text) || /^\d{0,4}(\.\d{0,2})?$/.test(text);
    if (!partial) {
      setError(t('Type a number, or AB for absent.', 'अङ्क वा अनुपस्थितका लागि AB लेख्नुहोस्।'));
      return;
    }
    const value = Number(text);
    if (text && !/^a/i.test(text) && value > column.fullMarks) {
      setError(t(
        `${subject.titleEn} ${column.label}: the mark can't be more than ${column.fullMarks}.`,
        `${subject.titleNe || subject.titleEn} ${column.label}: अङ्क ${column.fullMarks} भन्दा बढी हुन सक्दैन।`,
      ));
      return;
    }
    setError(null);
    setCell(student.id, subject.id, column, text);
  }

  function setCell(studentId, subjectId, column, text) {
    setDrafts((current) => {
      const subject = { ...(current[studentId]?.[subjectId] || {}) };
      if (text === savedText(studentId, subjectId, column)) delete subject[column.key];
      else subject[column.key] = text;
      const row = { ...(current[studentId] || {}) };
      if (Object.keys(subject).length) row[subjectId] = subject;
      else delete row[subjectId];
      const next = { ...current };
      if (Object.keys(row).length) next[studentId] = row;
      else delete next[studentId];
      return next;
    });
  }

  const rows = useMemo(() => (sheet?.students || []).map((student) => {
    const marks = {};
    const invalid = new Set();
    for (const subjectId of student.takes) {
      const subject = subjectById.get(subjectId);
      if (!subject) continue;
      const current = subjectEntry(sheet?.marks?.[student.id]?.[subjectId]);
      const typed = drafts[student.id]?.[subjectId] || {};
      const parsedCells = columnsFor(subject).map((column) => ({
        column,
        parsed: Object.hasOwn(typed, column.key) ? parseCell(typed[column.key], column.fullMarks) : null,
      }));
      const hasAbsent = parsedCells.some(({ parsed }) => parsed?.absent);
      if (hasAbsent) current.absent = true;
      for (const { column, parsed } of parsedCells) {
        if (!Object.hasOwn(typed, column.key)) continue;
        if (parsed === undefined) invalid.add(`${subjectId}:${column.key}`);
        else if (!parsed?.absent && !hasAbsent) {
          current.absent = false;
          if (column.part === 'theory') current.theory = parsed?.marks ?? null;
          else if (parsed) current.internal[column.key] = parsed.marks;
          else delete current.internal[column.key];
        }
      }
      if (current.theory !== null || Object.keys(current.internal).length || current.absent) marks[subjectId] = current;
    }
    const takes = student.takes.map((id) => subjectById.get(id)).filter(Boolean);
    return { student, invalid, result: internalExamResult({ subjects: takes, marks }) };
  }), [sheet, drafts, subjectById]);

  const invalidCount = rows.reduce((sum, row) => sum + row.invalid.size, 0);

  async function save() {
    if (invalidCount) {
      setError(t('Fix the cells marked in red first: use a mark within its full marks, or AB for absent.', 'रातो चिन्ह लागेका कोठा सच्याउनुहोस्।'));
      return;
    }
    const entries = [];
    for (const [student, subjectCells] of Object.entries(drafts)) {
      for (const [subject, cells] of Object.entries(subjectCells)) {
        const definition = subjectById.get(subject);
        const parsedCells = Object.entries(cells).map(([key, text]) => {
          const column = columnsFor(definition).find((item) => item.key === key);
          return { key, text, column, parsed: parseCell(text, column?.fullMarks) };
        });
        // AB is a whole-subject status, not an assessment-field mark. One AB
        // draft therefore wins over other cells in that subject deterministically.
        if (parsedCells.some(({ parsed }) => parsed?.absent)) {
          entries.push({ student, subject, absent: true });
          continue;
        }
        for (const { key, column, parsed } of parsedCells) {
          if (!column || parsed === undefined) continue;
          const base = { student, subject, absent: Boolean(parsed?.absent) };
          if (column.part === 'theory') base.theory = parsed?.marks ?? null;
          else base.internal = { [key]: parsed?.marks ?? null };
          entries.push(base);
        }
      }
    }
    if (!entries.length) return;
    const result = await run(api.internal('/marks'), { method: 'PUT', body: { exam: exam.id, entries } }, {
      successMessage: t(`${entries.length} change${entries.length === 1 ? '' : 's'} saved`, `${entries.length} परिवर्तन सुरक्षित भयो`),
    });
    if (result.ok) {
      try { sheetQuery.setData(await casFetch(sheetPath)); } catch { sheetQuery.reload(); }
      setDrafts({});
    }
  }

  function onKeyDown(event, rowIndex, subjectId, columnKey) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    // The next row shown (the list may be filtered).
    for (let next = rowIndex + 1; next < visibleRows.length; next += 1) {
      const target = document.getElementById(`mark-${visibleRows[next].student.id}-${subjectId}-${columnKey}`);
      if (target) { target.focus(); target.select(); return; }
    }
  }

  const published = sheet?.exam?.published;
  const anyEditable = subjects.some((subject) => subject.canEdit);
  const theorySubjects = subjects.filter((subject) => entryColumnsFor(subject, 'theory').length);
  const internalSubjects = subjects.filter((subject) => entryColumnsFor(subject, 'internal').length);
  const internalSubject = internalSubjects.find((subject) => subject.id === internalSubjectId) || internalSubjects[0] || null;

  /**
   * How many of a student's cells in this tab hold a mark (typed or saved):
   * Theory = one TH cell per subject they take; Internal = the chosen
   * subject's fields. AB in any cell makes that whole subject entered.
   */
  function progressOf(student, { live = true } = {}) {
    const textOf = live ? cellText : savedText;
    const groups = entryMode === 'theory'
      ? theorySubjects.filter((subject) => student.takes.includes(subject.id)).map((subject) => [subject, entryColumnsFor(subject, 'theory')])
      : internalSubject && student.takes.includes(internalSubject.id) ? [[internalSubject, entryColumnsFor(internalSubject, 'internal')]] : [];
    let entered = 0;
    let total = 0;
    for (const [subject, columns] of groups) {
      const texts = columns.map((column) => String(textOf(student.id, subject.id, column) || '').trim());
      const absent = texts.some((text) => ABSENT.test(text));
      total += columns.length;
      entered += absent ? columns.length : texts.filter(Boolean).length;
    }
    return { entered, total };
  }

  // Colours follow what is typed; the status filter (and its counts) follow
  // what is saved, so a student never vanishes from the list mid-typing.
  const statusById = new Map(rows.map(({ student }) => {
    const progress = progressOf(student);
    return [student.id, { progress, status: statusOf(progress), savedStatus: statusOf(progressOf(student, { live: false })) }];
  }));
  const statusCounts = { complete: 0, partial: 0, none: 0 };
  for (const { savedStatus } of statusById.values()) if (savedStatus) statusCounts[savedStatus] += 1;
  const serial = new Map(rows.map(({ student }, index) => [student.id, index + 1]));
  const wanted = findText.trim().toLowerCase();
  // A pick from another exam or section no longer applies.
  const pickedStudent = rows.some(({ student }) => student.id === findStudent) ? findStudent : '';
  const visibleRows = rows.filter(({ student }) => (!pickedStudent || student.id === pickedStudent)
    && (!wanted || student.name.toLowerCase().includes(wanted) || String(student.rollNumber || '').toLowerCase().startsWith(wanted))
    && (statusFilter === 'all' || statusById.get(student.id)?.savedStatus === statusFilter));

  const th = 'px-3 py-2 text-center text-xs font-semibold text-muted';
  const thLeft = 'px-3 py-2 text-left text-xs font-semibold text-muted';
  const td = 'border-l border-line px-2 py-1.5 text-center tabular-nums';
  const noneCell = (key) => <td key={key} className={`${td} text-subtle`}>—</td>;

  /** SN, Roll and Student: the same first three columns in every table. */
  const studentHead = (
    <>
      <th className={`w-12 min-w-12 bg-surface-2 sm:sticky sm:left-0 sm:z-20 ${th}`}>{t('SN', 'क्र.सं.')}</th>
      <th className={`w-14 bg-surface-2 ${th}`}>{t('Roll', 'रोल')}</th>
      {/* Phones pin only the Student column, so the mark columns get the room. */}
      <th className={`sticky left-0 z-20 bg-surface-2 sm:left-12 ${thLeft}`}>{t('Student', 'विद्यार्थी')}</th>
    </>
  );
  /** SN, roll, and the name tinted green / yellow / red with the count, e.g. 3/5. */
  const studentCells = (student) => {
    const { progress, status } = statusById.get(student.id) || {};
    const look = MARK_STATUS[status];
    return (
      <>
        <td className="w-12 min-w-12 bg-surface px-3 py-1.5 text-center text-muted tabular-nums sm:sticky sm:left-0 sm:z-10">{serial.get(student.id)}</td>
        <td className="px-3 py-1.5 text-center text-muted">{student.rollNumber || '—'}</td>
        <td className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1.5 font-medium text-ink sm:left-12 sm:px-3 ${look?.cell || 'bg-surface'}`} title={look ? `${student.name} · ${t(look.en, look.ne)}` : student.name}>
          {/* A long name shortens on phones; the full name is in the title. */}
          <span className="flex max-w-[10rem] items-center gap-2 sm:max-w-none">
            {look && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} aria-hidden />}
            <span className="min-w-0 truncate sm:overflow-visible">{student.name}</span>
            {look && <span className="ml-auto pl-2 text-xs font-normal tabular-nums text-muted">{progress.entered}/{progress.total}</span>}
          </span>
        </td>
      </>
    );
  };

  /** One typed cell (or read-only text when this person cannot edit the subject). */
  function markCell(student, subject, column, rowIndex) {
    const key = `${subject.id}:${column.key}`;
    if (!student.takes.includes(subject.id)) return noneCell(key);
    const text = cellText(student.id, subject.id, column);
    if (!subject.canEdit || published) return <td key={key} className={`${td} h-12 min-w-24 text-base`}>{text || '·'}</td>;
    const dirty = drafts[student.id]?.[subject.id]?.[column.key] !== undefined;
    const invalidCell = Boolean(visibleRows[rowIndex]?.invalid.has(key));
    return (
      <td key={key} className="border-l border-line p-0">
        <input
          id={`mark-${student.id}-${subject.id}-${column.key}`}
          value={text} inputMode="decimal" autoComplete="off"
          aria-label={`${student.name} ${subject.titleEn} ${column.label} out of ${column.fullMarks}`}
          aria-invalid={invalidCell}
          onChange={(event) => typeCell(student, subject, column, event.target.value.trim())}
          onKeyDown={(event) => onKeyDown(event, rowIndex, subject.id, column.key)}
          className={`block h-12 w-full min-w-24 rounded-none border-0 px-2 text-center text-base font-medium tabular-nums shadow-none focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--color-brand)] ${invalidCell ? 'bg-danger-soft text-danger shadow-[inset_0_0_0_2px_var(--color-danger)]' : dirty ? 'bg-brand-soft' : 'bg-transparent hover:bg-surface-2'}`}
        />
      </td>
    );
  }

  const progress = (subject) => (
    <Badge tone={subject.entered === subject.expected ? 'success' : 'warning'}>{subject.entered}/{subject.expected}</Badge>
  );

  /** A row of subject buttons. */
  function SubjectPicker({ list, value, onChange }) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t('Subject', 'विषय')}>
        <span className="mr-1 text-sm font-medium text-ink">{t('Subject', 'विषय')}:</span>
        {list.map((subject) => (
          <button key={subject.id} type="button" onClick={() => onChange(subject.id)} aria-pressed={value === subject.id} className={`btn btn-sm ${value === subject.id ? 'btn-primary' : 'btn-secondary'}`}>
            {t(subject.titleEn, subject.titleNe) || subject.code}
          </button>
        ))}
      </div>
    );
  }


  function TheoryTable() {
    if (!theorySubjects.length) return <Card><EmptyState title={t('No theory paper in this structure', 'यस संरचनामा सैद्धान्तिक परीक्षा छैन')} /></Card>;
    return (
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="bg-surface-2">
            <tr>
              {studentHead}
              {theorySubjects.map((subject) => {
                const column = entryColumnsFor(subject, 'theory')[0];
                return (
                  <th key={subject.id} className={`border-l border-line ${th}`}>
                    <span className="block whitespace-nowrap text-ink">{t(subject.titleEn, subject.titleNe) || subject.code}</span>
                    <span className="font-normal">TH / {column.fullMarks}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ student }, rowIndex) => (
              <tr key={student.id} className="border-t border-line">
                {studentCells(student)}
                {theorySubjects.map((subject) => markCell(student, subject, entryColumnsFor(subject, 'theory')[0], rowIndex))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function InternalTable() {
    if (!internalSubject) {
      return (
        <Alert tone="info">{api.audience === 'teacher'
          ? t('Your school has not set up internal assessment yet.', 'विद्यालयले आन्तरिक मूल्याङ्कन तयार गरेको छैन।')
          : t('There is no internal assessment in the structure. Set it in Manage Exams → Assessment.', 'संरचनामा आन्तरिक मूल्याङ्कन छैन। परीक्षा व्यवस्थापन → मूल्याङ्कनमा तयार गर्नुहोस्।')}</Alert>
      );
    }
    const columns = entryColumnsFor(internalSubject, 'internal');
    return (
      <>
        {SubjectPicker({ list: internalSubjects, value: internalSubject.id, onChange: setInternalSubjectId })}
        <div className="card overflow-x-auto p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
            <p className="font-semibold text-ink">{t(internalSubject.titleEn, internalSubject.titleNe) || internalSubject.code} · {t('Internal / Practical', 'आन्तरिक / प्रयोगात्मक')} / {internalSubject.structure?.internalFullMarks}</p>
            {progress(internalSubject)}
          </div>
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="bg-surface-2">
              <tr>
                {studentHead}
                {columns.map((column) => (
                  <th key={column.key} className={`border-l border-line ${th}`}>
                    <span className="block whitespace-nowrap text-ink">{column.label}</span>
                    <span className="font-normal">/ {column.fullMarks}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ student }, rowIndex) => (
                <tr key={student.id} className="border-t border-line">
                  {studentCells(student)}
                  {columns.map((column) => markCell(student, internalSubject, column, rowIndex))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  /** Find a student (pick or type) and show only green / yellow / red students. */
  function FindBar() {
    const chips = [
      { key: 'all', label: t('All', 'सबै'), count: rows.length },
      ...Object.entries(MARK_STATUS).map(([key, look]) => ({ key, look, label: t(look.en, look.ne), count: statusCounts[key] })),
    ];
    return (
      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-[16rem] max-w-md flex-1">
          <StudentSearchBox
            t={t}
            students={rows.map(({ student }) => ({ id: student.id, name: student.name, rollNumber: student.rollNumber }))}
            studentId={pickedStudent}
            search={findText}
            onSelectStudent={setFindStudent}
            onSearch={setFindText}
            placeholder={t('Find a student: type a name or roll, or pick', 'विद्यार्थी खोज्नुहोस्: नाम वा रोल लेख्नुहोस्, वा छान्नुहोस्')}
            searchHint={t('name or roll', 'नाम वा रोल')}
            meta={(student) => {
              const { progress, status } = statusById.get(student.id) || {};
              const look = MARK_STATUS[status];
              return look ? (
                <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted">
                  <span className={`h-2 w-2 rounded-full ${look.dot}`} aria-hidden />{progress.entered}/{progress.total}
                </span>
              ) : null;
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('Show students by marks entered', 'अङ्क भरिएअनुसार विद्यार्थी देखाउनुहोस्')}>
          {chips.map(({ key, look, label, count }) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
              className={`btn btn-sm ${statusFilter === key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {look && <span className={`h-2.5 w-2.5 rounded-full ${look.dot}`} aria-hidden />}
              {label} <span className="tabular-nums opacity-80">({count})</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const steps = [
    { id: 'theory', icon: BookOpen, label: t('1. Theory marks', '१. सैद्धान्तिक अङ्क') },
    { id: 'internal', icon: ClipboardList, label: t('2. Internal / Practical marks', '२. आन्तरिक / प्रयोगात्मक अङ्क') },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Mark Entry', 'अंक प्रविष्टि')}
        description={t('Enter theory marks, then internal marks. Totals and grades are on the Results page. Type AB for absent; a blank is never zero.', 'पहिले सैद्धान्तिक, त्यसपछि आन्तरिक अङ्क लेख्नुहोस्। जम्मा र ग्रेड नतिजा पृष्ठमा छन्। अनुपस्थितका लागि AB लेख्नुहोस्।')}
        actions={anyEditable && !published && <Button onClick={save} disabled={pending || !dirtyCount}><Save size={16} aria-hidden /> {pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t(`Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`, `${dirtyCount} परिवर्तन सुरक्षित गर्नुहोस्`)}</Button>}
      />
      <InternalExamFilterBar filters={filters} t={t} />
      {sheet && (
        <div className="tabs mb-4" role="tablist" aria-label={t('Mark entry step', 'अङ्क प्रविष्टि चरण')}>
          {steps.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" role="tab" className="tab" aria-selected={entryMode === id} onClick={() => setEntryMode(id)}>
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>
      )}
      <Alert tone="danger">{error || sheetQuery.error}</Alert>
      <Alert tone="success">{success}</Alert>
      {published && <Alert tone="info">{t('These results are published, so marks are locked. Unpublish the exam in Manage Exams before correcting them.', 'नतिजा प्रकाशित भएकाले अंक लक छन्। परिवर्तनका लागि परीक्षा अप्रकाशित गर्नुहोस्।')}</Alert>}

      {!filters.grades.length && !filters.loading ? (
        <Card><EmptyState title={t('No grades to show', 'कक्षा छैन')} description={(api.audience === 'teacher' ? t('Ask your school to make you a subject teacher on its Teachers page.', 'विद्यालयलाई शिक्षक पृष्ठमा तपाईंलाई विषय शिक्षक तोक्न भन्नुहोस्।') : undefined)} /></Card>
      ) : !exam && !filters.examsQuery.loading ? (
        <Card><EmptyState title={api.audience === 'teacher' ? t('No exam to enter marks for', 'अङ्क प्रविष्ट गर्ने परीक्षा छैन') : t('No internal exam for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')} description={api.audience === 'teacher' ? t('This grade has no open internal exam right now. Published exams are locked until your school unpublishes them.', 'यस कक्षामा अहिले खुला आन्तरिक परीक्षा छैन।') : undefined} action={api.audience === 'teacher' ? undefined : <Link href="/school/internal-exam/exams" className="btn btn-primary">{t('Manage exams', 'परीक्षा व्यवस्थापन')}</Link>} /></Card>
      ) : !sheet ? <Card><Spinner label={t('Loading marks…', 'अंक लोड हुँदैछ…')} /></Card>
        : !rows.length ? <Card><EmptyState title={t('No students in this grade or section', 'यस कक्षामा विद्यार्थी छैनन्')} /></Card>
          : !subjects.length ? <Card><EmptyState title={t('This grade has no examined subjects', 'यस कक्षामा परीक्षा हुने विषय छैन')} /></Card>
            : (
              <>
                {FindBar()}
                {!visibleRows.length && (
                  <Alert tone="info">{t('No student matches. Clear the search or choose All.', 'कुनै विद्यार्थी मिलेन। खोज हटाउनुहोस् वा सबै छान्नुहोस्।')}</Alert>
                )}
                {entryMode === 'theory' ? TheoryTable() : InternalTable()}
              </>
            )}
    </>
  );
}

function parseCell(text, fullMarks) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (/^(ab|a|absent)$/i.test(value)) return { absent: true };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const marks = Number(value);
  if (!(marks >= 0) || marks > (fullMarks || 0)) return undefined;
  return { marks, absent: false };
}
