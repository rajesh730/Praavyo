'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';
import { internalExamResult } from '@pravyo/core/internalExamResult';
import { useCas } from './CasLayout.js';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';

const EMPTY = {};

/**
 * Mark entry for an internal exam, the way a school keeps its mark ledger:
 * one row per student, one column per subject, with total, percentage, GPA
 * and grade worked out as marks are typed.
 *
 * Type a mark, `AB` for absent, or clear the cell. A subject teacher can type
 * only in their own subject's column; the school can type in every column.
 */
export default function InternalMarkEntryPage() {
  const { t } = useCas();
  const filters = useInternalExamFilters();
  const { exam, section } = filters;
  const sheetQuery = useCasQuery(
    exam ? `/api/cas/internal-exams/sheet?${new URLSearchParams({ exam: exam.id, ...(section ? { section } : {}) })}` : null,
  );
  const sheet = sheetQuery.data;
  const { run, pending, error, success, setError } = useCasMutation();
  // Typed but unsaved cells: { [studentId]: { [subjectId]: text } }. Tied to
  // the exam and section they were typed under, so switching starts clean.
  const scope = `${exam?.id || ''}:${section}`;
  const [draftState, setDraftState] = useState({ scope, cells: {} });
  const drafts = draftState.scope === scope ? draftState.cells : EMPTY;
  const setDrafts = (update) => setDraftState((current) => ({
    scope,
    cells: typeof update === 'function' ? update(current.scope === scope ? current.cells : {}) : update,
  }));
  const dirtyCount = Object.values(drafts).reduce((sum, row) => sum + Object.keys(row).length, 0);

  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const subjects = useMemo(() => sheet?.subjects || [], [sheet]);
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);

  const savedText = (studentId, subjectId) => {
    const entry = sheet?.marks?.[studentId]?.[subjectId];
    if (!entry) return '';
    return entry.absent ? 'AB' : String(entry.marks ?? '');
  };
  const cellText = (studentId, subjectId) => drafts[studentId]?.[subjectId] ?? savedText(studentId, subjectId);

  function setCell(studentId, subjectId, text) {
    setDrafts((current) => {
      const row = { ...(current[studentId] || {}) };
      if (text === savedText(studentId, subjectId)) delete row[subjectId];
      else row[subjectId] = text;
      const next = { ...current, [studentId]: row };
      if (!Object.keys(row).length) delete next[studentId];
      return next;
    });
  }

  // Each student's live result, from saved marks overlaid with drafts.
  const rows = useMemo(() => (sheet?.students || []).map((student) => {
    const marks = {};
    const invalid = new Set();
    for (const subjectId of student.takes) {
      const parsed = parseCell(cellText(student.id, subjectId), subjectById.get(subjectId)?.fullMarks);
      if (parsed === undefined) invalid.add(subjectId);
      else if (parsed) marks[subjectId] = parsed;
    }
    const takes = student.takes.map((id) => subjectById.get(id)).filter(Boolean);
    return { student, invalid, result: internalExamResult({ subjects: takes, marks, passPercent: sheet.exam.passPercent }) };
  // cellText reads drafts and sheet, both listed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sheet, drafts, subjectById]);

  const invalidCount = rows.reduce((sum, row) => sum + row.invalid.size, 0);

  async function save() {
    if (invalidCount) {
      setError(t('Fix the cells marked in red first: a mark from 0 to the full marks, or AB for absent.', 'रातो चिन्ह लागेका कोठा सच्याउनुहोस्।'));
      return;
    }
    const entries = Object.entries(drafts).flatMap(([student, cells]) => Object.entries(cells).map(([subject, text]) => {
      const parsed = parseCell(text, subjectById.get(subject)?.fullMarks);
      return { student, subject, marks: parsed && !parsed.absent ? parsed.marks : null, absent: Boolean(parsed?.absent) };
    }));
    if (!entries.length) return;
    const result = await run('/api/cas/internal-exams/marks', { method: 'PUT', body: { exam: exam.id, entries } }, {
      successMessage: t(`${entries.length} mark${entries.length === 1 ? '' : 's'} saved`, `${entries.length} अङ्क सुरक्षित भयो`),
    });
    if (result.ok) {
      setDrafts({});
      sheetQuery.reload();
    }
  }

  // Enter moves down the column, like a paper ledger.
  function onKeyDown(event, rowIndex, subjectId) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    for (let next = rowIndex + 1; next < rows.length; next += 1) {
      const target = document.getElementById(`mark-${rows[next].student.id}-${subjectId}`);
      if (target) { target.focus(); target.select(); return; }
    }
  }

  const published = sheet?.exam?.published;
  const anyEditable = subjects.some((subject) => subject.canEdit);

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Mark Entry', 'अङ्क प्रविष्टि')}
        description={t('Type each student’s marks. AB marks a student absent. Totals, percentage, GPA and grade update as you type.', 'प्रत्येक विद्यार्थीको अङ्क लेख्नुहोस्। अनुपस्थितका लागि AB लेख्नुहोस्।')}
        actions={anyEditable && !published && (
          <Button onClick={save} disabled={pending || !dirtyCount}>
            <Save size={16} aria-hidden /> {pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : dirtyCount ? t(`Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`, `${dirtyCount} परिवर्तन सुरक्षित`) : t('Saved', 'सुरक्षित')}
          </Button>
        )}
      />
      <InternalExamFilterBar filters={filters} t={t} />
      <Alert tone="danger">{error || sheetQuery.error}</Alert>
      <Alert tone="success">{success}</Alert>
      {published && (
        <Alert tone="info">
          {t('These results are published, so marks are locked. Unpublish them on the Results screen to make changes.', 'नतिजा प्रकाशित भएकाले अङ्क लक छन्।')}
        </Alert>
      )}

      {!filters.grades.length && !filters.loading ? (
        <Card><EmptyState title={t('No grades to show', 'कक्षा छैन')} description={t('Ask your school to assign you a grade and subject on the Teachers page.', 'शिक्षक पृष्ठमा कक्षा र विषय तोक्न विद्यालयलाई भन्नुहोस्।')} /></Card>
      ) : !exam && !filters.examsQuery.loading ? (
        <Card>
          <EmptyState
            title={t('No internal exam for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')}
            action={<Link href="/school/internal-exam/exams" className="btn btn-primary">{t('Manage exams', 'परीक्षा व्यवस्थापन')}</Link>}
          />
        </Card>
      ) : !sheet ? (
        <Card><Spinner label={t('Loading marks…', 'अङ्क लोड हुँदैछ…')} /></Card>
      ) : !rows.length ? (
        <Card><EmptyState title={t('No students in this grade or section', 'यस कक्षामा विद्यार्थी छैनन्')} /></Card>
      ) : !subjects.length ? (
        <Card><EmptyState title={t('This grade has no examined subjects', 'यस कक्षामा परीक्षा हुने विषय छैन')} description={t('Add subjects under Manage Subjects on the school dashboard.', 'विद्यालय ड्यासबोर्डको Manage Subjects मा विषय थप्नुहोस्।')} /></Card>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className="sticky left-0 z-10 w-12 min-w-12 bg-surface-2 px-3 py-2 font-semibold">{t('Roll', 'रोल')}</th>
                <th className="sticky left-12 z-10 bg-surface-2 px-3 py-2 font-semibold">{t('Student', 'विद्यार्थी')}</th>
                {subjects.map((subject) => (
                  <th key={subject.id} className="px-2 py-2 text-center font-semibold">
                    <span className="block whitespace-nowrap">{t(subject.titleEn, subject.titleNe) || subject.code}</span>
                    <span className="block text-2xs font-normal text-muted">/ {subject.fullMarks}</span>
                    <span className="mt-0.5 block">
                      <Badge tone={subject.entered === subject.expected ? 'success' : 'warning'}>{subject.entered}/{subject.expected}</Badge>
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">{t('Total', 'जम्मा')}</th>
                <th className="px-3 py-2 text-center font-semibold">%</th>
                <th className="px-3 py-2 text-center font-semibold">GPA</th>
                <th className="px-3 py-2 text-center font-semibold">{t('Grade', 'ग्रेड')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, invalid, result }, rowIndex) => (
                <tr key={student.id} className="border-t border-line">
                  <td className="sticky left-0 w-12 min-w-12 bg-surface px-3 py-1.5 text-muted">{student.rollNumber || '—'}</td>
                  <td className="sticky left-12 bg-surface px-3 py-1.5 font-medium text-ink whitespace-nowrap">{student.name}</td>
                  {subjects.map((subject) => {
                    if (!student.takes.includes(subject.id)) {
                      return <td key={subject.id} className="px-2 py-1.5 text-center text-subtle" title={t('Does not take this subject', 'यो विषय लिँदैन')}>—</td>;
                    }
                    const text = cellText(student.id, subject.id);
                    const dirty = drafts[student.id]?.[subject.id] !== undefined;
                    const line = result.subjects.find((item) => item.id === subject.id);
                    const failed = line?.entered && !line.passed;
                    if (!subject.canEdit) {
                      return <td key={subject.id} className={`px-2 py-1.5 text-center ${failed ? 'font-semibold text-danger' : ''}`}>{text || '·'}</td>;
                    }
                    return (
                      <td key={subject.id} className="px-1 py-1 text-center">
                        <input
                          id={`mark-${student.id}-${subject.id}`}
                          value={text}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${student.name} ${subject.titleEn}`}
                          onChange={(event) => setCell(student.id, subject.id, event.target.value.trim())}
                          onKeyDown={(event) => onKeyDown(event, rowIndex, subject.id)}
                          className={`w-16 text-center ${invalid.has(subject.id) ? 'border-danger bg-danger-soft' : dirty ? 'border-brand bg-brand-soft' : ''} ${failed && !invalid.has(subject.id) ? 'text-danger' : ''}`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-center font-semibold">{result.obtained}<span className="font-normal text-muted">/{result.fullMarks}</span></td>
                  <td className="px-3 py-1.5 text-center">{result.percent ?? '—'}</td>
                  <td className="px-3 py-1.5 text-center">{result.gpa ?? '—'}</td>
                  <td className="px-3 py-1.5 text-center font-semibold">{result.complete ? result.overallGrade || 'NG' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * A typed cell: '' → null (not entered), AB → absent, a number within full
 * marks → marks. Anything else → undefined (invalid).
 */
function parseCell(text, fullMarks) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (/^(ab|a|absent)$/i.test(value)) return { absent: true };
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const marks = Number(value);
  if (!(marks >= 0) || marks > (fullMarks || 0)) return undefined;
  return { marks, absent: false };
}
