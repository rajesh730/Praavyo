'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pen as FaPen, Plus as FaPlus, Trash2 as FaTrash, PenLine } from 'lucide-react';
import { CAS_EXAM_TERMS } from '@pravyo/core/casExamTerms';
import { DEFAULT_FULL_MARKS, DEFAULT_PASS_PERCENT } from '@pravyo/core/internalExamResult';
import { useCas } from './CasLayout.js';
import { useCasMutation } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from './ui/Kit.js';
import IssueDateInput from './ui/IssueDateInput.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';

const EMPTY_FORM = {
  term: 'FIRST', name: '', fullMarks: DEFAULT_FULL_MARKS, passPercent: DEFAULT_PASS_PERCENT, issueDate: '', overrides: {},
};

/**
 * Manage internal exams: one exam per grade and term, with the full marks the
 * school wants (one figure for every subject, or per subject).
 */
export default function InternalExamsPage() {
  const { actor, t } = useCas();
  const filters = useInternalExamFilters({ withSection: false });
  const { academicYear, grade, exams, subjects, examsQuery } = filters;
  const { run, pending, error, success } = useCasMutation();
  // null = closed, 'new' = create form, an exam id = editing that exam.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const canEdit = actor?.role === 'SCHOOL_ADMIN';

  function open(exam) {
    if (!exam) {
      setForm(EMPTY_FORM);
      setEditing('new');
      return;
    }
    setForm({
      term: exam.term,
      name: exam.name,
      fullMarks: exam.fullMarks,
      passPercent: exam.passPercent,
      issueDate: exam.issueDate,
      overrides: Object.fromEntries(exam.subjectFullMarks.map((row) => [row.subject, row.fullMarks])),
    });
    setEditing(exam.id);
  }

  async function save(event) {
    event.preventDefault();
    const body = {
      term: form.term,
      name: form.name,
      fullMarks: Number(form.fullMarks),
      passPercent: Number(form.passPercent),
      issueDate: form.issueDate || '',
      subjectFullMarks: Object.entries(form.overrides)
        .filter(([, value]) => value !== '' && Number(value) > 0 && Number(value) !== Number(form.fullMarks))
        .map(([subject, value]) => ({ subject, fullMarks: Number(value) })),
    };
    const result = editing === 'new'
      ? await run('/api/cas/internal-exams', { method: 'POST', body: { ...body, academicYear: academicYear.id, grade } }, { successMessage: t('Exam created', 'परीक्षा सिर्जना भयो') })
      : await run('/api/cas/internal-exams', { method: 'PATCH', body: { ...body, id: editing } }, { successMessage: t('Exam saved', 'परीक्षा सुरक्षित भयो') });
    if (result.ok) {
      setEditing(null);
      examsQuery.reload();
    }
  }

  async function remove(exam) {
    if (!window.confirm(t(`Delete ${exam.name}? Every mark entered for it will be deleted too.`, `${exam.name} मेटाउने? यसका सबै अङ्क पनि मेटिन्छन्।`))) return;
    const result = await run('/api/cas/internal-exams', { method: 'DELETE', body: { id: exam.id } }, { successMessage: t('Exam deleted', 'परीक्षा मेटियो') });
    if (result.ok) examsQuery.reload();
  }

  const termTitle = (value) => CAS_EXAM_TERMS.find((term) => term.value === value)?.title || value;

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Manage Exams', 'परीक्षा व्यवस्थापन')}
        description={t(
          'The school’s own written exams, for every grade. Set the full marks once; results are worked out as a percentage of them.',
          'विद्यालयका आफ्नै लिखित परीक्षा। पूर्णाङ्क तोक्नुहोस्; नतिजा त्यसको प्रतिशतमा निकालिन्छ।',
        )}
      />
      <InternalExamFilterBar filters={filters} t={t} showExam={false} withSection={false} />
      <Alert tone="danger">{error}</Alert>
      <Alert tone="success">{success}</Alert>

      <Card
        title={grade ? t(`${grade} exams`, `${grade} का परीक्षा`) : t('Exams', 'परीक्षाहरू')}
        actions={canEdit && grade && editing !== 'new' && <Button onClick={() => open(null)}><FaPlus aria-hidden /> {t('Create exam', 'परीक्षा सिर्जना')}</Button>}
      >
        {editing && (
          <form onSubmit={save} className="mb-4 rounded-card border border-line bg-surface-2 p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={t('Term', 'परीक्षा चरण')} required>
                <Select value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value, name: form.name || '' })}>
                  {CAS_EXAM_TERMS.map((term) => <option key={term.value} value={term.value}>{term.title}</option>)}
                </Select>
              </Field>
              <Field label={t('Exam name', 'परीक्षाको नाम')} required>
                <Input required minLength={2} maxLength={120} value={form.name} placeholder={`${termTitle(form.term)} ${academicYear?.label || ''}`.trim()} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label={t('Full marks (each subject)', 'पूर्णाङ्क (प्रत्येक विषय)')} required>
                <Input type="number" required min={1} max={1000} step={1} value={form.fullMarks} onChange={(event) => setForm({ ...form, fullMarks: event.target.value })} />
              </Field>
              <Field label={t('Pass marks (%)', 'उत्तीर्णाङ्क (%)')} required>
                <Input type="number" required min={0} max={100} step="any" value={form.passPercent} onChange={(event) => setForm({ ...form, passPercent: event.target.value })} />
              </Field>
              <Field label={t('Issue date (B.S.)', 'जारी मिति (वि.सं.)')}>
                <IssueDateInput value={form.issueDate} onChange={(issueDate) => setForm({ ...form, issueDate })} calendar={actor?.calendar} t={t} />
              </Field>
            </div>

            {subjects.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm font-semibold text-brand">
                  {t('Different full marks for some subjects?', 'केही विषयको पूर्णाङ्क फरक छ?')}
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {subjects.map((subject) => (
                    <Field key={subject.id} label={t(subject.titleEn, subject.titleNe) || subject.code}>
                      <Input
                        type="number" min={1} max={1000} step={1}
                        value={form.overrides[subject.id] ?? ''}
                        placeholder={String(form.fullMarks || DEFAULT_FULL_MARKS)}
                        onChange={(event) => setForm({ ...form, overrides: { ...form.overrides, [subject.id]: event.target.value } })}
                      />
                    </Field>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-3 flex gap-2">
              <Button type="submit" disabled={pending}>{pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t('Save exam', 'परीक्षा सुरक्षित गर्नुहोस्')}</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel', 'रद्द')}</Button>
            </div>
          </form>
        )}

        {examsQuery.loading ? <Spinner label={t('Loading exams…', 'परीक्षा लोड हुँदैछ…')} />
          : !exams.length ? (
            <EmptyState
              title={t('No internal exams for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')}
              description={canEdit ? t('Create the first one, e.g. First Terminal Examination.', 'पहिलो परीक्षा सिर्जना गर्नुहोस्।') : t('Your school has not created one yet.', 'विद्यालयले अझै सिर्जना गरेको छैन।')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {exams.map((exam) => (
                <li key={exam.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{exam.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span>{exam.termTitle}</span>
                      <span>· {t('Full marks', 'पूर्णाङ्क')} {exam.fullMarks}{exam.subjectFullMarks.length ? ` (${t('some subjects differ', 'केही विषय फरक')})` : ''}</span>
                      <span>· {t('Pass', 'उत्तीर्ण')} {exam.passPercent}%</span>
                      {exam.published ? <Badge tone="success">{t('Published', 'प्रकाशित')}</Badge> : <Badge>{t('Not published', 'अप्रकाशित')}</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/school/internal-exam/marks" onClick={() => filters.setExam(exam.id)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                      <PenLine size={14} aria-hidden /> {t('Mark entry', 'अङ्क प्रविष्टि')}
                    </Link>
                    {canEdit && !exam.published && (
                      <>
                        <Button variant="secondary" className="btn-sm" onClick={() => open(exam)}><FaPen size={14} aria-hidden /> {t('Edit', 'सम्पादन')}</Button>
                        <Button variant="danger" className="btn-sm" disabled={pending} onClick={() => remove(exam)}><FaTrash size={14} aria-hidden /> {t('Delete', 'मेटाउनुहोस्')}</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  );
}
