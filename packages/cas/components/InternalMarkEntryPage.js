'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';
import { internalExamResult } from '@pravyo/core/internalExamResult';
import { useCas } from './CasLayout.js';
import { casFetch, useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';

const EMPTY = {};

function columnsFor(subject) {
  return subject.columns?.length
    ? subject.columns
    : [{ key: 'TH', part: 'theory', label: 'TH', fullMarks: subject.fullMarks }];
}

function subjectEntry(entry) {
  if (!entry) return { theory: null, internal: {}, absent: false };
  return {
    theory: typeof entry.theory === 'number' ? entry.theory : (typeof entry.marks === 'number' ? entry.marks : null),
    internal: { ...(entry.internal || {}) },
    absent: Boolean(entry.absent),
  };
}

/** Dynamic marks register: all entry columns come from the saved school structure. */
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
    return { student, invalid, result: internalExamResult({ subjects: takes, marks, passPercent: sheet.exam.passPercent, passEachPart: sheet.passEachPart }) };
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
    for (let next = rowIndex + 1; next < rows.length; next += 1) {
      const target = document.getElementById(`mark-${rows[next].student.id}-${subjectId}-${columnKey}`);
      if (target) { target.focus(); target.select(); return; }
    }
  }

  const published = sheet?.exam?.published;
  const anyEditable = subjects.some((subject) => subject.canEdit);

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Mark Entry', 'अंक प्रविष्टि')}
        description={t('Enter TH and each configured INT field. Internal and final totals are calculated automatically; blank is never treated as zero.', 'TH र तय गरिएका INT शीर्षकमा अंक लेख्नुहोस्। कुल स्वतः गणना हुन्छ।')}
        actions={anyEditable && !published && <Button onClick={save} disabled={pending || !dirtyCount}><Save size={16} aria-hidden /> {pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t(`Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`, `${dirtyCount} परिवर्तन सुरक्षित गर्नुहोस्`)}</Button>}
      />
      <InternalExamFilterBar filters={filters} t={t} />
      <Alert tone="danger">{error || sheetQuery.error}</Alert>
      <Alert tone="success">{success}</Alert>
      {published && <Alert tone="info">{t('These results are published, so marks are locked. Unpublish the exam in Manage Exams before correcting them.', 'नतिजा प्रकाशित भएकाले अंक लक छन्। परिवर्तनका लागि परीक्षा अप्रकाशित गर्नुहोस्।')}</Alert>}

      {!filters.grades.length && !filters.loading ? (
        <Card><EmptyState title={t('No grades to show', 'कक्षा छैन')} description={t('Ask your school to assign you a grade and subject on the Teachers page.', 'विद्यालयलाई शिक्षकको कक्षा र विषय तोक्न भन्नुहोस्।')} /></Card>
      ) : !exam && !filters.examsQuery.loading ? (
        <Card><EmptyState title={t('No internal exam for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')} description={api.audience === 'teacher' ? t('Your school creates internal exams. Marks can be entered once it does.', 'विद्यालयले परीक्षा बनाएपछि अंक प्रविष्ट गर्न सकिन्छ।') : undefined} action={api.audience === 'teacher' ? undefined : <Link href="/school/internal-exam/exams" className="btn btn-primary">{t('Manage exams', 'परीक्षा व्यवस्थापन')}</Link>} /></Card>
      ) : !sheet ? <Card><Spinner label={t('Loading marks…', 'अंक लोड हुँदैछ…')} /></Card>
        : !rows.length ? <Card><EmptyState title={t('No students in this grade or section', 'यस कक्षामा विद्यार्थी छैनन्')} /></Card>
          : !subjects.length ? <Card><EmptyState title={t('This grade has no examined subjects', 'यस कक्षामा परीक्षा हुने विषय छैन')} /></Card>
            : (
              <div className="card overflow-x-auto p-0">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead className="bg-surface-2 text-left">
                    <tr>
                      <th rowSpan="2" className="sticky left-0 z-20 w-12 min-w-12 bg-surface-2 px-3 py-2 font-semibold">{t('Roll', 'रोल')}</th>
                      <th rowSpan="2" className="sticky left-12 z-20 bg-surface-2 px-3 py-2 font-semibold">{t('Student', 'विद्यार्थी')}</th>
                      {subjects.map((subject) => {
                        const columns = columnsFor(subject);
                        const split = Number(subject.structure?.internalFullMarks) > 0;
                        return <th key={subject.id} colSpan={columns.length + (split ? 2 : 0)} className="border-l border-line px-2 py-2 text-center font-semibold"><span className="block whitespace-nowrap">{t(subject.titleEn, subject.titleNe) || subject.code}</span><span className="block text-2xs font-normal text-muted">/ {subject.fullMarks} · <Badge tone={subject.entered === subject.expected ? 'success' : 'warning'}>{subject.entered}/{subject.expected}</Badge></span></th>;
                      })}
                      <th rowSpan="2" className="border-l border-line px-3 py-2 text-center font-semibold">{t('Total', 'जम्मा')}</th><th rowSpan="2" className="px-3 py-2 text-center font-semibold">%</th><th rowSpan="2" className="px-3 py-2 text-center font-semibold">GPA</th><th rowSpan="2" className="px-3 py-2 text-center font-semibold">{t('Grade', 'ग्रेड')}</th>
                    </tr>
                    <tr>
                      {subjects.flatMap((subject) => {
                        const header = columnsFor(subject).map((column) => <th key={`${subject.id}:${column.key}`} className="border-l border-line px-2 py-1.5 text-center text-2xs font-semibold"><span className="block whitespace-nowrap">{column.label}</span><span className="font-normal text-muted">/{column.fullMarks}</span></th>);
                        if (Number(subject.structure?.internalFullMarks) > 0) header.push(<th key={`${subject.id}:int`} className="border-l border-line px-2 py-1.5 text-center text-2xs font-semibold">INT<br /><span className="font-normal text-muted">/{subject.structure.internalFullMarks}</span></th>, <th key={`${subject.id}:total`} className="border-l border-line px-2 py-1.5 text-center text-2xs font-semibold">{t('Total', 'जम्मा')}<br /><span className="font-normal text-muted">/{subject.fullMarks}</span></th>);
                        return header;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ student, invalid, result }, rowIndex) => (
                      <tr key={student.id} className="border-t border-line">
                        <td className="sticky left-0 z-10 w-12 min-w-12 bg-surface px-3 py-1.5 text-muted">{student.rollNumber || '—'}</td><td className="sticky left-12 z-10 bg-surface px-3 py-1.5 font-medium text-ink whitespace-nowrap">{student.name}</td>
                        {subjects.flatMap((subject) => {
                          const columns = columnsFor(subject);
                          const split = Number(subject.structure?.internalFullMarks) > 0;
                          const line = result.subjects.find((item) => item.id === subject.id);
                          if (!student.takes.includes(subject.id)) {
                            const skipped = columns.map((column) => <td key={`${subject.id}:${column.key}`} className="border-l border-line px-2 py-1.5 text-center text-subtle">—</td>);
                            if (split) skipped.push(<td key={`${subject.id}:int`} className="border-l border-line px-2 py-1.5 text-center text-subtle">—</td>, <td key={`${subject.id}:total`} className="border-l border-line px-2 py-1.5 text-center text-subtle">—</td>);
                            return skipped;
                          }
                          const cells = columns.map((column) => {
                            const text = cellText(student.id, subject.id, column);
                            const dirty = drafts[student.id]?.[subject.id]?.[column.key] !== undefined;
                            const invalidCell = invalid.has(`${subject.id}:${column.key}`);
                            const failed = line?.entered && !line.passed;
                            if (!subject.canEdit) return <td key={`${subject.id}:${column.key}`} className={`border-l border-line px-2 py-1.5 text-center ${failed ? 'font-semibold text-danger' : ''}`}>{text || '·'}</td>;
                            return <td key={`${subject.id}:${column.key}`} className="border-l border-line px-1 py-1 text-center"><input id={`mark-${student.id}-${subject.id}-${column.key}`} value={text} inputMode="decimal" autoComplete="off" aria-label={`${student.name} ${subject.titleEn} ${column.label} out of ${column.fullMarks}`} onChange={(event) => setCell(student.id, subject.id, column, event.target.value.trim())} onKeyDown={(event) => onKeyDown(event, rowIndex, subject.id, column.key)} className={`w-16 text-center ${invalidCell ? 'border-danger bg-danger-soft' : dirty ? 'border-brand bg-brand-soft' : ''} ${failed && !invalidCell ? 'text-danger' : ''}`} /></td>;
                          });
                          if (split) {
                            const intValue = line?.absent ? 'AB' : line?.internal?.entered ? line.internal.obtained : (line?.internal?.soFar || '·');
                            const totalValue = line?.absent ? 'AB' : line?.entered ? line.obtained : '·';
                            cells.push(<td key={`${subject.id}:int`} className="border-l border-line bg-surface-2 px-2 py-1.5 text-center font-medium">{intValue}</td>, <td key={`${subject.id}:total`} className="border-l border-line bg-surface-2 px-2 py-1.5 text-center font-semibold">{totalValue}</td>);
                          }
                          return cells;
                        })}
                        <td className="border-l border-line px-3 py-1.5 text-center font-semibold">{result.obtained}<span className="font-normal text-muted">/{result.fullMarks}</span></td><td className="px-3 py-1.5 text-center">{result.percent ?? '—'}</td><td className="px-3 py-1.5 text-center">{result.gpa ?? '—'}</td><td className="px-3 py-1.5 text-center font-semibold">{result.complete ? result.overallGrade || 'NG' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
