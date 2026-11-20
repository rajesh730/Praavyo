'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCasMutation } from '../lib/client/useCas.js';
import { Alert, Button, Field, Input } from './ui/Kit.js';
import IssueDateInput from './ui/IssueDateInput.js';

/**
 * The internal exam form, in one place: Manage Exams (create / edit) and the
 * "Create exam" choice in every internal Exam picker (Mark Entry, Attendance &
 * Activities, Results) use these same fields and the same API, so an exam
 * made from either is the same school-wide exam.
 *
 * The school writes the exam's name itself (Unit Test, Pre-board, First
 * Terminal…); there is no fixed list, and nothing is shared with CAS's exams
 * (owner, 2026-11-20). Three fields, like CAS's own form: the exam name
 * (what every screen lists), the report title (the heading printed at the
 * top of the card; empty = the exam name) and the issue date.
 */
export const EMPTY_EXAM_FORM = { name: '', reportTitle: '', issueDate: '' };

/** The request body both create and edit send. */
export function examBody(form) {
  return { name: form.name, reportTitle: form.reportTitle || '', issueDate: form.issueDate || '' };
}

export function InternalExamFields({ form, setForm, academicYear, calendar, t }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={t('Exam name', 'परीक्षाको नाम')} required>
        <Input
          required
          autoFocus
          minLength={2}
          maxLength={120}
          value={form.name}
          placeholder={t(`e.g. First Terminal Examination ${academicYear?.label || ''}`.trim(), `जस्तै: प्रथम त्रैमासिक परीक्षा ${academicYear?.label || ''}`.trim())}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Field>
      {/* Empty prints the exam name, which the placeholder shows. */}
      <Field label={t('Report title (top of the card)', 'नतिजा शीर्षक (पत्रको माथि)')}>
        <Input
          maxLength={120}
          value={form.reportTitle}
          placeholder={form.name || t('Same as the exam name', 'परीक्षाको नाम जस्तै')}
          onChange={(event) => setForm({ ...form, reportTitle: event.target.value })}
        />
      </Field>
      <Field label={t('Issue date (B.S.)', 'जारी मिति (वि.सं.)')}>
        <IssueDateInput value={form.issueDate} onChange={(issueDate) => setForm({ ...form, issueDate })} calendar={calendar} t={t} />
      </Field>
    </div>
  );
}

/**
 * Create a school-wide internal exam without leaving the current screen.
 * `onCreated(exam)` receives the copy for `grade`, so the picker can select it.
 */
export function InternalExamCreateDialog({ api, academicYear, grade, calendar, t, onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY_EXAM_FORM);
  const { run, pending, error } = useCasMutation();

  async function submit(event) {
    event.preventDefault();
    const result = await run(api.internal(), { method: 'POST', body: { ...examBody(form), academicYear: academicYear.id, grade } });
    if (result.ok) onCreated(result.data);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="internal-create-exam-title">
      <form className="modal-panel" onSubmit={submit}>
        <h2 id="internal-create-exam-title" className="text-lg font-semibold text-ink">{t('Create exam', 'परीक्षा सिर्जना')}</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          {t('The exam is created for every grade of the school. Each grade enters its marks and publishes on its own.', 'परीक्षा विद्यालयका सबै कक्षाका लागि सिर्जना हुन्छ। हरेक कक्षाले आफ्नै अङ्क प्रविष्टि र प्रकाशन गर्छ।')}
        </p>
        <Alert tone="danger">{error}</Alert>
        <InternalExamFields form={form} setForm={setForm} academicYear={academicYear} calendar={calendar} t={t} />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel', 'रद्द गर्नुहोस्')}</Button>
          <Button type="submit" disabled={pending}><Plus size={16} aria-hidden /> {pending ? t('Creating…', 'सिर्जना हुँदैछ…') : t('Create exam', 'परीक्षा सिर्जना')}</Button>
        </div>
      </form>
    </div>
  );
}
