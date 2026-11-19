'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  DEFAULT_ACTIVITIES, DEFAULT_ACTIVITY_MARKS, MAX_ACTIVITIES, MAX_ACTIVITY_MARKS, activityProblems, newActivityId,
} from '@pravyo/core/internalActivities';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Button, Card, Input, Spinner } from './ui/Kit.js';

const toForm = (fields) => (fields || []).map((field) => ({ id: field.id, name: field.name, fullMarks: String(field.fullMarks) }));
const fromForm = (fields) => fields.map((field) => ({
  id: field.id,
  name: field.name.trim(),
  fullMarks: field.fullMarks.trim() === '' ? null : Number(field.fullMarks),
}));
const tidy = (text) => {
  const value = String(text ?? '').trim();
  return value && Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 100) / 100) : value;
};

/**
 * Manage Exams → Extra Activities: the school's own activity list, each with
 * its full marks (Discipline / 10, Meditation / 5 …). One list for the whole
 * school; every grade and every internal exam uses it. A school starts with
 * the default eight, each out of 10, until it saves its own.
 */
export default function InternalActivitiesConfiguration({ t }) {
  const path = '/api/cas/internal-exams/activities';
  const query = useCasQuery(path);
  const { run, pending, error, success, setError } = useCasMutation();
  const saved = query.data || null;
  const scope = `activities:${saved?.revision ?? 'new'}`;
  const [formState, setFormState] = useState({ scope: '', fields: [] });
  const [draft, setDraft] = useState({ name: '', fullMarks: String(DEFAULT_ACTIVITY_MARKS) });
  const nameRef = useRef(null);
  const fields = formState.scope === scope ? formState.fields : toForm(saved?.fields);

  useEffect(() => {
    setFormState({ scope, fields: toForm(saved?.fields) });
  }, [scope, saved]);

  const list = useMemo(() => fromForm(fields), [fields]);
  const problems = useMemo(() => activityProblems(list), [list]);
  const dirty = JSON.stringify(list) !== JSON.stringify(fromForm(toForm(saved?.fields)));
  const setFields = (next) => setFormState({ scope, fields: next });
  const update = (index, patch) => setFields(fields.map((field, current) => (current === index ? { ...field, ...patch } : field)));

  function add(event) {
    event?.preventDefault();
    const name = draft.name.trim();
    const fullMarks = Number(draft.fullMarks);
    if (!name) {
      setError(t('Enter an activity name, for example Meditation.', 'क्रियाकलापको नाम लेख्नुहोस्, जस्तै ध्यान।'));
      nameRef.current?.focus();
      return;
    }
    if (!Number.isFinite(fullMarks) || fullMarks <= 0 || fullMarks > MAX_ACTIVITY_MARKS) {
      setError(t(`Enter full marks between 1 and ${MAX_ACTIVITY_MARKS}.`, `१ देखि ${MAX_ACTIVITY_MARKS} सम्म पूर्णाङ्क लेख्नुहोस्।`));
      return;
    }
    if (fields.some((field) => field.name.trim().toLowerCase() === name.toLowerCase())) {
      setError(t(`"${name}" is already on the list.`, `"${name}" पहिले नै सूचीमा छ।`));
      nameRef.current?.focus();
      return;
    }
    if (fields.length >= MAX_ACTIVITIES) {
      setError(t(`You can have up to ${MAX_ACTIVITIES} activities.`, `अधिकतम ${MAX_ACTIVITIES} क्रियाकलाप राख्न सकिन्छ।`));
      return;
    }
    setError(null);
    setFields([...fields, { id: newActivityId(), name, fullMarks: tidy(draft.fullMarks) }]);
    setDraft({ name: '', fullMarks: draft.fullMarks });
    nameRef.current?.focus();
  }

  /** Put back any of the default eight that were removed, keeping the school's own. */
  function restoreDefaults() {
    const present = new Set(fields.map((field) => field.id));
    const missing = DEFAULT_ACTIVITIES.filter((field) => !present.has(field.id));
    if (!missing.length) return;
    setFields([...fields, ...toForm(missing)]);
  }

  async function save() {
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    const result = await run(path, { method: 'PUT', body: { revision: saved?.revision || 0, fields: list } }, {
      successMessage: t('Extra activities saved. Every internal exam not yet published uses them now.', 'अतिरिक्त क्रियाकलाप सुरक्षित भयो। अप्रकाशित सबै आन्तरिक परीक्षामा अब यही लागू हुन्छ।'),
    });
    if (result.ok) query.reload();
  }

  const missingDefaults = DEFAULT_ACTIVITIES.filter((field) => !fields.some((item) => item.id === field.id)).length;

  return (
    <Card
      title={t('Extra activities', 'अतिरिक्त क्रियाकलाप')}
      description={t(
        'Your school’s own list, each with its full marks. It is used by every internal exam in every grade, and the report card prints each one as marks out of full marks (e.g. Discipline 9/10).',
        'विद्यालयको आफ्नै सूची, हरेकको पूर्णाङ्कसहित। सबै कक्षाका सबै आन्तरिक परीक्षामा लागू हुन्छ; नतिजा पत्रमा अङ्क/पूर्णाङ्क (जस्तै अनुशासन ९/१०) देखिन्छ।',
      )}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="badge badge-warning">{t('Unsaved changes', 'सुरक्षित नभएका परिवर्तन')}</span>}
          {dirty && <Button variant="ghost" disabled={pending} onClick={() => setFields(toForm(saved?.fields))}>{t('Undo changes', 'परिवर्तन रद्द')}</Button>}
          <Button onClick={save} disabled={pending || query.loading || (saved?.saved && !dirty) || Boolean(problems.length)}>
            {pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t('Save activities', 'क्रियाकलाप सुरक्षित गर्नुहोस्')}
          </Button>
        </div>
      )}
    >
      {query.loading ? <Spinner label={t('Loading activities…', 'क्रियाकलाप लोड हुँदैछ…')} /> : (
        <>
          <Alert tone="danger">{error || query.error}</Alert>
          <Alert tone="success">{success}</Alert>
          {saved && !saved.saved && (
            <Alert tone="info">{t('These are the default activities, each out of 10. Change, remove or add activities, then save to make them your school’s own.', 'यी पूर्वनिर्धारित क्रियाकलाप हुन्, हरेक १० पूर्णाङ्कको। परिवर्तन, हटाउने वा थप्ने गरी सुरक्षित गर्नुहोस्।')}</Alert>
          )}

          <div className="table-wrap rounded-control border border-line">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-surface-2">
                <tr className="text-left text-xs font-semibold text-muted">
                  <th className="w-12 px-3 py-2 text-center">{t('SN', 'क्र.सं.')}</th>
                  <th className="px-2 py-2">{t('Activity', 'क्रियाकलाप')}</th>
                  <th className="w-32 px-2 py-2">{t('Full marks', 'पूर्णाङ्क')}</th>
                  <th className="w-32 px-3 py-2 text-right">{t('Action', 'कार्य')}</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const marks = Number(field.fullMarks);
                  return (
                    <tr key={field.id} className="border-t border-line">
                      <td className="px-3 py-2 text-center text-muted tabular-nums">{index + 1}</td>
                      <td className="px-2 py-2">
                        <Input value={field.name} maxLength={60} aria-label={t(`Activity ${index + 1} name`, 'क्रियाकलाप')} aria-invalid={!field.name.trim()} onChange={(event) => update(index, { name: event.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" inputMode="decimal" min={1} max={MAX_ACTIVITY_MARKS} step="any"
                          value={field.fullMarks}
                          aria-label={t(`${field.name || 'Activity'} full marks`, 'पूर्णाङ्क')}
                          aria-invalid={!(marks > 0 && marks <= MAX_ACTIVITY_MARKS)}
                          onChange={(event) => update(index, { fullMarks: event.target.value })}
                          onBlur={() => update(index, { fullMarks: tidy(field.fullMarks) })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" className="btn-sm text-danger" onClick={() => setFields(fields.filter((_, current) => current !== index))} aria-label={t(`Remove ${field.name || 'activity'}`, 'हटाउनुहोस्')}>
                          <Trash2 size={15} aria-hidden /> {t('Remove', 'हटाउनुहोस्')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {fields.length < MAX_ACTIVITIES && (
                  <tr className="border-t border-line bg-brand-soft/50">
                    <td className="px-3 py-2 text-center text-brand"><Plus size={16} className="inline" aria-hidden /></td>
                    <td className="px-2 py-2">
                      <Input
                        ref={nameRef} value={draft.name} maxLength={60}
                        placeholder={t('New activity, e.g. Meditation', 'नयाँ क्रियाकलाप, जस्तै ध्यान')}
                        aria-label={t('New activity name', 'नयाँ क्रियाकलाप')}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        onKeyDown={(event) => { if (event.key === 'Enter') add(event); }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number" inputMode="decimal" min={1} max={MAX_ACTIVITY_MARKS} step="any"
                        value={draft.fullMarks}
                        aria-label={t('New activity full marks', 'नयाँ क्रियाकलापको पूर्णाङ्क')}
                        onChange={(event) => setDraft({ ...draft, fullMarks: event.target.value })}
                        onKeyDown={(event) => { if (event.key === 'Enter') add(event); }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button className="btn-sm" onClick={add}><Plus size={15} aria-hidden /> {t('Add', 'थप्नुहोस्')}</Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!fields.length && (
            <p className="mt-2 text-sm text-muted">{t('With no activities, the report card leaves the Extra Activities box off.', 'क्रियाकलाप नभए नतिजा पत्रमा अतिरिक्त क्रियाकलाप देखिँदैन।')}</p>
          )}
          {missingDefaults > 0 && (
            <div className="mt-3">
              <Button variant="secondary" className="btn-sm" onClick={restoreDefaults}>
                <RotateCcw size={14} aria-hidden /> {t(`Add back ${missingDefaults} removed default${missingDefaults === 1 ? '' : 's'}`, `हटाइएका ${missingDefaults} पूर्वनिर्धारित फिर्ता थप्नुहोस्`)}
              </Button>
            </div>
          )}
          {problems.length > 0 && <div className="mt-4"><Alert tone="warning">{problems[0]}</Alert></div>}
        </>
      )}
    </Card>
  );
}
