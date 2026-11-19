'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { newFieldId, structureProblems, totalFullMarks } from '@pravyo/core/internalMarkScheme';
import { useCas } from './CasLayout.js';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Button, Card, Field, Input, Spinner } from './ui/Kit.js';

const BLANK_STRUCTURE = { theoryFullMarks: 100, internalFullMarks: 0, fields: [] };

function copyStructure(structure) {
  return {
    theoryFullMarks: Number(structure?.theoryFullMarks ?? 100),
    internalFullMarks: Number(structure?.internalFullMarks ?? 0),
    fields: (structure?.fields || []).map((field) => ({ ...field, fullMarks: Number(field.fullMarks) })),
  };
}

/**
 * One marks structure per grade. It deliberately applies to every internal
 * exam in that grade: First, Second, Third, Final, or any school-named exam.
 * An exam pins this structure on publication, so changing a later term cannot
 * reinterpret a published report card.
 */
export default function InternalAssessmentConfiguration({ grade }) {
  const { api, t } = useCas();
  const path = grade ? `${api.internal('/scheme')}?${new URLSearchParams({ grade })}` : null;
  const query = useCasQuery(path);
  const { run, pending, error, success, setError } = useCasMutation();
  const saved = query.data?.scheme || null;
  const scope = `${grade || ''}:${saved?.revision ?? 'new'}`;
  const [formState, setFormState] = useState({ scope: '', structure: copyStructure(BLANK_STRUCTURE), passEachPart: true });
  const form = formState.scope === scope ? formState : { scope, structure: copyStructure(saved?.default || BLANK_STRUCTURE), passEachPart: saved?.passEachPart !== false };

  useEffect(() => {
    setFormState({
      scope,
      structure: copyStructure(saved?.default || BLANK_STRUCTURE),
      passEachPart: saved?.passEachPart !== false,
    });
  }, [scope, saved]);

  const problems = useMemo(() => structureProblems(form.structure), [form.structure]);
  const allocated = form.structure.fields.reduce((sum, field) => sum + (Number(field.fullMarks) || 0), 0);
  const fullMarks = totalFullMarks(form.structure);
  const setStructure = (next) => setFormState({ ...form, structure: next });

  function updateField(index, patch) {
    setStructure({
      ...form.structure,
      fields: form.structure.fields.map((field, current) => current === index ? { ...field, ...patch } : field),
    });
  }

  function moveField(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= form.structure.fields.length) return;
    const fields = [...form.structure.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    setStructure({ ...form.structure, fields });
  }

  async function save() {
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    const result = await run(path, {
      method: 'PUT',
      body: {
        grade,
        revision: saved?.revision || 0,
        passEachPart: form.passEachPart,
        default: form.structure,
        // The requested workflow is global for the grade; individual subject
        // overrides remain a future, explicit decision rather than a hidden rule.
        subjects: [],
      },
    }, { successMessage: t('Assessment structure saved for every internal exam in this grade.', 'यस कक्षाका सबै आन्तरिक परीक्षाका लागि मूल्याङ्कन संरचना सुरक्षित भयो।') });
    if (result.ok) query.reload();
  }

  if (!grade) return null;

  return (
    <Card
      title={t('Assessment structure', 'मूल्याङ्कन संरचना')}
      description={t(
        `Global for ${grade}: it is used by First, Second, Third, Final, and any other internal exam in this grade.`,
        `${grade} का सबै आन्तरिक परीक्षाका लागि एउटै संरचना प्रयोग हुन्छ।`,
      )}
      actions={<Button onClick={save} disabled={pending || query.loading || Boolean(problems.length)}>{pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t('Save structure', 'संरचना सुरक्षित गर्नुहोस्')}</Button>}
    >
      {query.loading ? <Spinner label={t('Loading assessment structure…', 'मूल्याङ्कन संरचना लोड हुँदैछ…')} /> : (
        <>
          <Alert tone="danger">{error || query.error}</Alert>
          <Alert tone="success">{success}</Alert>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('Theory full marks (TH)', 'सैद्धान्तिक पूर्णाङ्क (TH)')} required>
              <Input type="number" min={0} max={1000} step="0.01" value={form.structure.theoryFullMarks} onChange={(event) => setStructure({ ...form.structure, theoryFullMarks: Number(event.target.value) })} />
            </Field>
            <Field label={t('Internal full marks (INT)', 'आन्तरिक पूर्णाङ्क (INT)')} required>
              <Input type="number" min={0} max={1000} step="0.01" value={form.structure.internalFullMarks} onChange={(event) => setStructure({ ...form.structure, internalFullMarks: Number(event.target.value) })} />
            </Field>
            <Field label={t('Total full marks', 'कुल पूर्णाङ्क')}>
              <Input value={fullMarks} readOnly aria-label={t('Calculated total full marks', 'गणना गरिएको कुल पूर्णाङ्क')} className="bg-surface-2" />
            </Field>
          </div>

          <div className="mt-2 rounded-card border border-line p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{t('Internal assessment fields', 'आन्तरिक मूल्याङ्कनका शीर्षकहरू')}</p>
                <p className="text-sm text-muted">{t('Add only the numeric fields your school uses. With no fields, teachers enter one INT total.', 'विद्यालयले प्रयोग गर्ने अंकका शीर्षक मात्र थप्नुहोस्। शीर्षक नभए शिक्षकले एउटा INT कुल अंक लेख्छन्।')}</p>
              </div>
              <Button variant="secondary" className="btn-sm" onClick={() => setStructure({ ...form.structure, fields: [...form.structure.fields, { id: newFieldId(), name: '', fullMarks: 0 }] })}>
                <Plus size={15} aria-hidden /> {t('Add field', 'शीर्षक थप्नुहोस्')}
              </Button>
            </div>
            {!form.structure.fields.length ? (
              <p className="text-sm text-muted">{t('No fields added. INT will be one directly entered mark.', 'कुनै शीर्षक छैन। INT एउटा सीधै प्रविष्ट गर्ने अंक हुनेछ।')}</p>
            ) : (
              <div className="space-y-2">
                {form.structure.fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                    <Field label={index === 0 ? t('Assessment name', 'मूल्याङ्कन शीर्षक') : ''}>
                      <Input value={field.name} maxLength={60} placeholder={t('e.g. Weekly Test', 'जस्तै साप्ताहिक परीक्षा')} onChange={(event) => updateField(index, { name: event.target.value })} />
                    </Field>
                    <Field label={index === 0 ? t('Full marks', 'पूर्णाङ्क') : ''}>
                      <Input type="number" min={0} max={1000} step="0.01" value={field.fullMarks} onChange={(event) => updateField(index, { fullMarks: Number(event.target.value) })} />
                    </Field>
                    <div className="mb-3 flex gap-1">
                      <Button variant="ghost" className="btn-icon" onClick={() => moveField(index, -1)} disabled={!index} aria-label={t(`Move ${field.name || 'field'} up`, 'माथि सार्नुहोस्')}><ArrowUp size={16} /></Button>
                      <Button variant="ghost" className="btn-icon" onClick={() => moveField(index, 1)} disabled={index === form.structure.fields.length - 1} aria-label={t(`Move ${field.name || 'field'} down`, 'तल सार्नुहोस्')}><ArrowDown size={16} /></Button>
                      <Button variant="danger" className="btn-icon" onClick={() => setStructure({ ...form.structure, fields: form.structure.fields.filter((_, current) => current !== index) })} aria-label={t(`Remove ${field.name || 'field'}`, 'हटाउनुहोस्')}><Trash2 size={16} /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className={`mt-3 text-sm font-medium ${allocated === Number(form.structure.internalFullMarks) ? 'text-success' : 'text-warning'}`}>
              {t(`Allocated internal marks: ${allocated}/${Number(form.structure.internalFullMarks) || 0}`, `आन्तरिक बाँडफाँड: ${allocated}/${Number(form.structure.internalFullMarks) || 0}`)}
            </p>
          </div>

          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-0.5" checked={form.passEachPart} onChange={(event) => setFormState({ ...form, passEachPart: event.target.checked })} />
            <span>{t('Require a passing mark in both TH and INT when both are used.', 'TH र INT दुवै प्रयोग हुँदा दुवैमा उत्तीर्ण हुनुपर्छ।')}</span>
          </label>
          {problems.length > 0 && <Alert tone="warning">{problems[0]}</Alert>}
        </>
      )}
    </Card>
  );
}
