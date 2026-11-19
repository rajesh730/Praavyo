'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { MAX_FIELDS, MAX_FULL_MARKS, legacyStructure, newFieldId, structureProblems } from '@pravyo/core/internalMarkScheme';
import { useCas } from './CasLayout.js';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Button, Card, Field, Input, Spinner } from './ui/Kit.js';

/**
 * Internal Exam only (CAS never reads this): one school-wide marks
 * structure used by every Internal Exam of every grade.
 *
 *   Full marks = Theory (TH) + Internal / Practical (INT)
 *   INT        = Full marks − TH, shared out over the school's own fields
 *
 * Inputs hold the text the person typed, so clearing a box leaves it empty
 * instead of snapping back to 0 (which then read "034").
 */

const SUGGESTED_FIELDS = ['Class Test', 'Weekly Test', 'Assignment', 'Project Work', 'Practical', 'Attendance'];

const round2 = (value) => Math.round(value * 100) / 100;
const asNumber = (text) => (String(text ?? '').trim() === '' ? null : Number(text));
const isMarks = (value) => typeof value === 'number' && Number.isFinite(value);
const toText = (value) => (isMarks(Number(value)) && value !== null && value !== '' ? String(Number(value)) : '');
/** Tidy a typed number once the box loses focus: "034" → "34", "10.50" → "10.5". */
const tidy = (text) => {
  const value = asNumber(text);
  return isMarks(value) ? String(round2(value)) : String(text ?? '').trim();
};

function formFrom(structure) {
  const source = structure || legacyStructure();
  const theory = Number(source.theoryFullMarks) || 0;
  const internal = Number(source.internalFullMarks) || 0;
  return {
    total: toText(round2(theory + internal)),
    theory: toText(theory),
    fields: (source.fields || []).map((field) => ({ id: field.id, name: field.name, fullMarks: toText(field.fullMarks) })),
  };
}

/** The structure the server stores, from the form; null parts stay null. */
function structureFrom(form) {
  const total = asNumber(form.total);
  const theory = asNumber(form.theory);
  const internal = isMarks(total) && isMarks(theory) ? round2(total - theory) : null;
  return {
    totalFullMarks: total,
    theoryFullMarks: theory,
    internalFullMarks: internal,
    fields: form.fields.map((field) => ({ id: field.id, name: field.name.trim(), fullMarks: asNumber(field.fullMarks) })),
  };
}

export default function InternalAssessmentConfiguration() {
  const { api, t } = useCas();
  const path = api.internal('/scheme');
  const query = useCasQuery(path);
  const { run, pending, error, success, setError } = useCasMutation();
  const saved = query.data?.scheme || null;
  const scope = `school:${saved?.revision ?? 'new'}`;

  const [formState, setFormState] = useState({ scope: '', form: formFrom(null) });
  const [panel, setPanel] = useState('theory');
  const [draft, setDraft] = useState({ name: '', fullMarks: '' });
  const nameRef = useRef(null);
  const marksRef = useRef(null);
  const form = formState.scope === scope ? formState.form : formFrom(saved?.default);

  useEffect(() => {
    setFormState({ scope, form: formFrom(saved?.default) });
    setDraft({ name: '', fullMarks: '' });
  }, [scope, saved]);

  const structure = useMemo(() => structureFrom(form), [form]);
  const { totalFullMarks: total, theoryFullMarks: theory, internalFullMarks: internal } = structure;
  const allocated = round2(structure.fields.reduce((sum, field) => sum + (isMarks(field.fullMarks) ? field.fullMarks : 0), 0));
  const remaining = isMarks(internal) ? round2(internal - allocated) : null;

  const problems = useMemo(() => {
    if (!isMarks(total) || total <= 0) return [t('Enter the full marks of the exam, for example 100.', 'परीक्षाको पूर्णाङ्क लेख्नुहोस्, जस्तै १००।')];
    if (total > MAX_FULL_MARKS) return [t(`Full marks cannot be more than ${MAX_FULL_MARKS}.`, `पूर्णाङ्क ${MAX_FULL_MARKS} भन्दा बढी हुन सक्दैन।`)];
    if (!isMarks(theory) || theory < 0) return [t('Enter the theoretical full marks (0 if there is no theory paper).', 'सैद्धान्तिक पूर्णाङ्क लेख्नुहोस् (सैद्धान्तिक परीक्षा नभए ०)।')];
    if (theory > total) return [t(`Theoretical marks (${theory}) cannot be more than the full marks (${total}).`, `सैद्धान्तिक अङ्क (${theory}) पूर्णाङ्क (${total}) भन्दा बढी हुन सक्दैन।`)];
    return structureProblems(structure, { totalFullMarks: total });
  }, [structure, total, theory, t]);

  const savedForm = formFrom(saved?.default);
  const dirty = JSON.stringify(structureFrom(savedForm)) !== JSON.stringify(structure);
  const internalNeedsWork = form.fields.length > 0 && remaining !== 0;

  const setForm = (patch) => setFormState({ scope, form: { ...form, ...patch } });
  const updateField = (index, patch) => setForm({ fields: form.fields.map((field, current) => (current === index ? { ...field, ...patch } : field)) });
  const removeField = (index) => setForm({ fields: form.fields.filter((_, current) => current !== index) });

  function pickSuggestion(name) {
    setDraft({ name, fullMarks: draft.fullMarks || (remaining > 0 ? String(remaining) : '') });
    marksRef.current?.focus();
  }

  function addField(event) {
    event?.preventDefault();
    const name = draft.name.trim();
    const fullMarks = asNumber(draft.fullMarks);
    if (!name) {
      setError(t('Enter a field name, for example Class Test.', 'शीर्षक लेख्नुहोस्, जस्तै कक्षा परीक्षण।'));
      nameRef.current?.focus();
      return;
    }
    if (!isMarks(fullMarks) || fullMarks <= 0) {
      setError(t('Enter full marks above 0 for this field.', 'यस शीर्षकको पूर्णाङ्क ० भन्दा बढी लेख्नुहोस्।'));
      marksRef.current?.focus();
      return;
    }
    if (isMarks(remaining) && fullMarks > remaining) {
      setError(remaining > 0
        ? t(`Only ${remaining} internal marks are left. Enter ${remaining} or less.`, `${remaining} आन्तरिक अङ्क मात्र बाँकी छ। ${remaining} वा कम लेख्नुहोस्।`)
        : t('All internal marks are already allocated. Lower another field first.', 'सबै आन्तरिक अङ्क बाँडिइसकेको छ। पहिले अर्को शीर्षक घटाउनुहोस्।'));
      marksRef.current?.focus();
      return;
    }
    if (form.fields.length >= MAX_FIELDS) {
      setError(t(`You can add up to ${MAX_FIELDS} fields.`, `अधिकतम ${MAX_FIELDS} शीर्षक थप्न सकिन्छ।`));
      return;
    }
    if (form.fields.some((field) => field.name.trim().toLowerCase() === name.toLowerCase())) {
      setError(t(`"${name}" has already been added.`, `"${name}" पहिले नै थपिएको छ।`));
      nameRef.current?.focus();
      return;
    }
    setError(null);
    const fields = [...form.fields, { id: newFieldId(), name, fullMarks: String(round2(fullMarks)) }];
    setForm({ fields });
    const left = isMarks(internal) ? round2(internal - allocated - fullMarks) : 0;
    setDraft({ name: '', fullMarks: left > 0 ? String(left) : '' });
    nameRef.current?.focus();
  }

  function splitEqually() {
    if (!form.fields.length || !(internal > 0)) return;
    const share = Math.floor((internal / form.fields.length) * 100) / 100;
    const last = round2(internal - share * (form.fields.length - 1));
    setForm({ fields: form.fields.map((field, index) => ({ ...field, fullMarks: String(index === form.fields.length - 1 ? last : share) })) });
  }

  function reset() {
    setFormState({ scope, form: savedForm });
    setDraft({ name: '', fullMarks: '' });
    setError(null);
  }

  async function save() {
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    const result = await run(path, {
      method: 'PUT',
      body: { revision: saved?.revision || 0, default: structure, subjects: [] },
    }, { successMessage: t('Assessment structure saved. Every Internal Exam in every grade now uses it.', 'मूल्याङ्कन संरचना सुरक्षित भयो। सबै कक्षाका सबै आन्तरिक परीक्षामा यही लागू हुन्छ।') });
    if (result.ok) query.reload();
  }

  return (
    <Card
      title={t('Assessment structure', 'मूल्याङ्कन संरचना')}
      description={t('Applies to every Internal Exam in every grade.', 'सबै कक्षाका सबै आन्तरिक परीक्षामा लागू हुन्छ।')}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="badge badge-warning">{t('Unsaved changes', 'सुरक्षित नभएका परिवर्तन')}</span>}
          {dirty && <Button variant="ghost" onClick={reset} disabled={pending}>{t('Undo changes', 'परिवर्तन रद्द')}</Button>}
          <Button onClick={save} disabled={pending || query.loading || (saved && !dirty) || Boolean(problems.length)}>
            {pending ? t('Saving…', 'सुरक्षित हुँदैछ…') : t('Save structure', 'संरचना सुरक्षित गर्नुहोस्')}
          </Button>
        </div>
      )}
    >
      {query.loading ? <Spinner label={t('Loading assessment structure…', 'मूल्याङ्कन संरचना लोड हुँदैछ…')} /> : (
        <>
          <Alert tone="danger">{error || query.error}</Alert>
          <Alert tone="success">{success}</Alert>

          <div className="tabs mb-4" role="tablist" aria-label={t('Assessment area', 'मूल्याङ्कन क्षेत्र')}>
            <button type="button" role="tab" className="tab" aria-selected={panel === 'theory'} onClick={() => setPanel('theory')}>
              <BookOpen size={15} aria-hidden /> {t('Manage Theoretical Exam', 'सैद्धान्तिक परीक्षा व्यवस्थापन')}
            </button>
            <button type="button" role="tab" className="tab" aria-selected={panel === 'internal'} onClick={() => setPanel('internal')}>
              <ClipboardList size={15} aria-hidden /> {t('Manage Internal / Practical', 'आन्तरिक / प्रयोगात्मक व्यवस्थापन')}
              {internalNeedsWork && <span className="h-2 w-2 rounded-full bg-warning" aria-label={t('needs attention', 'ध्यान दिनुहोस्')} />}
            </button>
          </div>

          {panel === 'theory' ? (
            <div className="max-w-3xl">
              <div className="grid gap-x-3 sm:grid-cols-3">
                <Field label={t('Full marks', 'पूर्णाङ्क')} required>
                  <Input
                    type="number" inputMode="decimal" min={1} max={MAX_FULL_MARKS} step="any" placeholder="100"
                    value={form.total}
                    aria-invalid={!isMarks(total) || total <= 0}
                    onChange={(event) => setForm({ total: event.target.value })}
                    onBlur={() => setForm({ total: tidy(form.total) })}
                  />
                </Field>
                <Field label={t('Theoretical full marks (TH)', 'सैद्धान्तिक पूर्णाङ्क (TH)')} required>
                  <Input
                    type="number" inputMode="decimal" min={0} max={MAX_FULL_MARKS} step="any" placeholder="50"
                    value={form.theory}
                    aria-invalid={!isMarks(theory) || theory < 0 || (isMarks(total) && theory > total)}
                    onChange={(event) => setForm({ theory: event.target.value })}
                    onBlur={() => setForm({ theory: tidy(form.theory) })}
                  />
                </Field>
                <Field label={t('Internal marks (INT)', 'आन्तरिक अङ्क (INT)')}>
                  <Input
                    readOnly tabIndex={-1}
                    value={isMarks(internal) && internal >= 0 ? String(internal) : ''}
                    placeholder="–"
                    title={t('Full marks − Theoretical marks', 'पूर्णाङ्क − सैद्धान्तिक अङ्क')}
                    aria-invalid={isMarks(internal) && internal < 0}
                    className="cursor-default bg-surface-2 font-semibold"
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-line p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t('Internal / practical assessment fields', 'आन्तरिक / प्रयोगात्मक मूल्याङ्कन शीर्षकहरू')}</p>
                  <p className="text-sm text-muted">{t('Each field becomes a column in Internal Exam mark entry. Together they must add up to the internal marks.', 'हरेक शीर्षक आन्तरिक परीक्षा अङ्क प्रविष्टिमा एउटा स्तम्भ बन्छ। सबैको जोड आन्तरिक अङ्कसँग बराबर हुनुपर्छ।')}</p>
                </div>
                {form.fields.length > 1 && internal > 0 && (
                  <Button variant="secondary" className="btn-sm" onClick={splitEqually}>{t('Split equally', 'बराबर बाँड्नुहोस्')}</Button>
                )}
              </div>

              {!(internal > 0) ? (
                <Alert tone="info">
                  {t('There are no internal marks to share out. Lower the theoretical marks in Manage Theoretical Exam to make room for internal / practical marks.', 'बाँड्न आन्तरिक अङ्क छैन। आन्तरिक / प्रयोगात्मकका लागि सैद्धान्तिक परीक्षा व्यवस्थापनमा सैद्धान्तिक अङ्क घटाउनुहोस्।')}
                </Alert>
              ) : (
                <>
                  <div className="table-wrap rounded-control border border-line">
                    <table className="w-full min-w-[32rem] text-sm">
                      <thead className="bg-surface-2">
                        <tr className="text-left text-xs font-semibold text-muted">
                          <th className="w-12 px-3 py-2 text-center">{t('SN', 'क्र.सं.')}</th>
                          <th className="px-2 py-2">{t('Field name', 'शीर्षक')}</th>
                          <th className="w-32 px-2 py-2">{t('Full marks', 'पूर्णाङ्क')}</th>
                          <th className="w-32 px-3 py-2 text-right">{t('Action', 'कार्य')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.fields.map((field, index) => {
                          const marks = asNumber(field.fullMarks);
                          return (
                            <tr key={field.id} className="border-t border-line">
                              <td className="px-3 py-2 text-center text-muted tabular-nums">{index + 1}</td>
                              <td className="px-2 py-2">
                                <Input
                                  value={field.name} maxLength={60}
                                  aria-label={t(`Field ${index + 1} name`, 'शीर्षक')}
                                  aria-invalid={!field.name.trim()}
                                  onChange={(event) => updateField(index, { name: event.target.value })}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <Input
                                  type="number" inputMode="decimal" min={0.01} max={MAX_FULL_MARKS} step="any"
                                  value={field.fullMarks}
                                  aria-label={t(`${field.name || 'Field'} full marks`, 'पूर्णाङ्क')}
                                  aria-invalid={!isMarks(marks) || marks <= 0}
                                  onChange={(event) => updateField(index, { fullMarks: event.target.value })}
                                  onBlur={() => updateField(index, { fullMarks: tidy(field.fullMarks) })}
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button variant="ghost" className="btn-sm text-danger" onClick={() => removeField(index)} aria-label={t(`Remove ${field.name || 'field'}`, 'शीर्षक हटाउनुहोस्')}>
                                  <Trash2 size={15} aria-hidden /> {t('Remove', 'हटाउनुहोस्')}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}

                        {form.fields.length < MAX_FIELDS && (
                          <tr className="border-t border-line bg-brand-soft/50">
                            <td className="px-3 py-2 text-center text-brand"><Plus size={16} className="inline" aria-hidden /></td>
                            <td className="px-2 py-2">
                              <Input
                                ref={nameRef} value={draft.name} maxLength={60}
                                placeholder={t('New field, e.g. Class Test', 'नयाँ शीर्षक, जस्तै कक्षा परीक्षण')}
                                aria-label={t('New field name', 'नयाँ शीर्षक')}
                                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                                onKeyDown={(event) => { if (event.key === 'Enter') addField(event); }}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                ref={marksRef} type="number" inputMode="decimal" min={0.01} max={MAX_FULL_MARKS} step="any"
                                value={draft.fullMarks} placeholder={remaining > 0 ? String(remaining) : '10'}
                                aria-label={t('New field full marks', 'नयाँ शीर्षकको पूर्णाङ्क')}
                                onChange={(event) => setDraft({ ...draft, fullMarks: event.target.value })}
                                onBlur={() => setDraft({ ...draft, fullMarks: tidy(draft.fullMarks) })}
                                onKeyDown={(event) => { if (event.key === 'Enter') addField(event); }}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button className="btn-sm" onClick={addField}>
                                <Plus size={15} aria-hidden /> {t('Add', 'थप्नुहोस्')}
                              </Button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-line-strong bg-surface-2">
                          <td />
                          <td className="px-2 py-2.5 font-semibold text-ink">{t('Internal total', 'आन्तरिक जम्मा')}</td>
                          <td className="px-2 py-2.5 font-semibold text-ink tabular-nums">{allocated} / {internal}</td>
                          <td className={`px-3 py-2.5 text-right text-xs font-semibold ${!form.fields.length ? 'text-muted' : remaining === 0 ? 'text-success' : remaining < 0 ? 'text-danger' : 'text-warning'}`}>
                            {!form.fields.length
                              ? t('No fields yet', 'शीर्षक छैन')
                              : remaining === 0
                                ? t('✓ All allocated', '✓ सबै बाँडियो')
                                : remaining > 0
                                  ? t(`${remaining} left`, `${remaining} बाँकी`)
                                  : t(`${-remaining} too many`, `${-remaining} बढी`)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {!form.fields.length && (
                    <p className="mt-2 text-sm text-muted">{t(`With no fields, teachers type one internal mark out of ${internal}.`, `शीर्षक नभए शिक्षकले ${internal} मध्ये एउटै आन्तरिक अङ्क लेख्नुहुन्छ।`)}</p>
                  )}

                  {form.fields.length < MAX_FIELDS && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted">{t('Quick pick:', 'छिटो छान्नुहोस्:')}</span>
                      {SUGGESTED_FIELDS.filter((name) => !form.fields.some((field) => field.name.trim().toLowerCase() === name.toLowerCase())).map((name) => (
                        <button key={name} type="button" className="badge badge-neutral cursor-pointer hover:border-brand-line hover:text-brand" onClick={() => pickSuggestion(name)}>
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {problems.length > 0 && <div className="mt-4"><Alert tone="warning">{problems[0]}</Alert></div>}
        </>
      )}
    </Card>
  );
}
