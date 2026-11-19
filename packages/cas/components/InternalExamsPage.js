'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock as FaLock, Pen as FaPen, Plus as FaPlus, Send as FaPaperPlane, Trash2 as FaTrash, Unlock as FaUnlock, PenLine } from 'lucide-react';
import { CAS_EXAM_TERMS } from '@pravyo/core/casExamTerms';
import { DEFAULT_FULL_MARKS, DEFAULT_PASS_PERCENT } from '@pravyo/core/internalExamResult';
import { useCas } from './CasLayout.js';
import { useCasMutation } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from './ui/Kit.js';
import IssueDateInput from './ui/IssueDateInput.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';
import InternalAssessmentConfiguration from './InternalAssessmentConfiguration.js';

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
  const { run, pending, error, success, setSuccess } = useCasMutation();
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

  // { exam, publish: true | false } while a confirmation is open.
  const [confirming, setConfirming] = useState(null);

  async function changePublishing() {
    const { exam, publish } = confirming;
    setConfirming(null);
    const result = await run('/api/cas/internal-exams/publish', { method: 'POST', body: { exam: exam.id, publish } });
    if (result.ok) {
      setSuccess(publish
        ? t(`${exam.name} published: ${result.data?.published || 0} report cards sent to students and parents. The marks are now locked.`, `${exam.name} प्रकाशित भयो। अङ्क अब लक छन्।`)
        : t(`${exam.name} unpublished. Its report cards were removed and the marks are unlocked for editing.`, `${exam.name} अप्रकाशित भयो। अङ्क सम्पादनका लागि खुला छन्।`));
      examsQuery.reload();
    }
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
      {confirming && (
        <PublishingDialog
          t={t}
          exam={confirming.exam}
          grade={grade}
          publish={confirming.publish}
          onCancel={() => setConfirming(null)}
          onConfirm={changePublishing}
        />
      )}
      <Alert tone="danger">{error}</Alert>
      <Alert tone="success">{success}</Alert>

      {canEdit && <InternalAssessmentConfiguration grade={grade} />}

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
                      {exam.published
                        ? <Badge tone="success"><FaLock aria-hidden size={11} className="mr-1 inline" />{t('Published · marks locked', 'प्रकाशित · अङ्क लक')}</Badge>
                        : <Badge>{t('Not published', 'अप्रकाशित')}</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/school/internal-exam/marks" onClick={() => filters.setExam(exam.id)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                      <PenLine size={14} aria-hidden /> {exam.published ? t('View marks', 'अङ्क हेर्नुहोस्') : t('Mark entry', 'अङ्क प्रविष्टि')}
                    </Link>
                    {canEdit && (exam.published ? (
                      <Button variant="secondary" className="btn-sm" disabled={pending} onClick={() => setConfirming({ exam, publish: false })}>
                        <FaUnlock size={14} aria-hidden /> {t('Unpublish', 'अप्रकाशित')}
                      </Button>
                    ) : (
                      <Button className="btn-sm" disabled={pending} onClick={() => setConfirming({ exam, publish: true })}>
                        <FaPaperPlane size={14} aria-hidden /> {t('Publish results', 'नतिजा प्रकाशित')}
                      </Button>
                    ))}
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

/** Publish or unpublish one internal exam, after an explicit tick. */
function PublishingDialog({ t, exam, grade, publish, onCancel, onConfirm }) {
  const [checked, setChecked] = useState(false);
  const points = publish
    ? [
      t('Every student’s report card goes to them and their parents straight away.', 'हरेक विद्यार्थीको नतिजा पत्र तुरुन्तै विद्यार्थी र अभिभावकलाई पठाइन्छ।'),
      t('Every mark must be entered (or the student marked absent) first.', 'पहिले सबै अङ्क प्रविष्ट भएको हुनुपर्छ।'),
      t('The marks, attendance and activities lock. Nobody can change them until you unpublish here.', 'अङ्क, हाजिरी र क्रियाकलाप लक हुन्छन्।'),
    ]
    : [
      t(`The published report cards for ${grade} are removed. Students and parents stop seeing them.`, `${grade} का प्रकाशित नतिजा पत्र हट्छन्।`),
      t('The marks are kept and unlock, so teachers and the school can correct them.', 'अङ्क सुरक्षित रहन्छन् र सच्याउन खुला हुन्छन्।'),
      t('When the corrections are done, publish the exam again here.', 'सच्याएपछि यहीँबाट फेरि प्रकाशित गर्नुहोस्।'),
    ];
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="internal-publishing-title">
      <div className="modal-panel">
        <h2 id="internal-publishing-title" className="text-lg font-semibold text-ink">
          {publish
            ? t(`Publish ${exam.name} for ${grade}?`, `${grade} को ${exam.name} प्रकाशित गर्ने?`)
            : t(`Unpublish ${exam.name} for ${grade}?`, `${grade} को ${exam.name} अप्रकाशित गर्ने?`)}
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {points.map((point) => <li key={point}>{point}</li>)}
        </ul>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          {publish
            ? t('I have checked these results on the Results screen and they are correct.', 'मैले नतिजा जाँचेँ र सही छन्।')
            : t('I understand students and parents will lose access until it is published again.', 'फेरि प्रकाशित नभएसम्म विद्यार्थी र अभिभावकले हेर्न पाउँदैनन् भन्ने बुझेँ।')}
        </label>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel', 'रद्द गर्नुहोस्')}</Button>
          <Button variant={publish ? 'primary' : 'danger'} disabled={!checked} onClick={onConfirm}>
            {publish ? <FaPaperPlane aria-hidden /> : <FaUnlock aria-hidden />}
            {publish ? t('Publish results', 'नतिजा प्रकाशित गर्नुहोस्') : t('Unpublish exam', 'परीक्षा अप्रकाशित गर्नुहोस्')}
          </Button>
        </div>
      </div>
    </div>
  );
}
