'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import Link from 'next/link';
import { BookOpen as FaBookOpen, Pen as FaPen, Plus as FaPlus, Trash2 as FaTrash } from 'lucide-react';
import { useCas } from '@pravyo/cas/components/CasLayout';
import { useCasQuery, useCasMutation } from '@pravyo/cas/lib/client/useCas';
import {
  PageHeader, Card, Button, Field, Input, Select, Alert, Spinner,
  Badge, EmptyState,
} from '@pravyo/cas/components/ui/Kit';
import CurriculumThemeTable from '@pravyo/cas/components/CurriculumThemeTable';
import DefaultThemesPanel from '@pravyo/cas/components/DefaultThemesPanel';

const emptySubject = (grade) => ({ grade, code: '', titleEn: '', titleNe: '', creditHours: '' });
const emptyTheme = (subject) => ({
  subject,
  titleEn: '',
  titleNe: '',
  workingHours: '',
});
function hoursForInput(value) {
  return value === '' || value == null ? null : Number(value);
}

export default function CurriculumPage() {
  const { school, actor, t } = useCas();
  const grades = school?.grades || [];
  const canEdit = actor?.role === 'SCHOOL_ADMIN';
  // The super admin edits the platform's default theme library on this page.
  const isLibrary = Boolean(school?.library);

  // Filters are remembered until the page is refreshed.
  const [chosenGrade, setGrade] = useRememberedState('cas-curriculum:grade', '');
  const [chosenSubject, setSubject] = useRememberedState('cas-curriculum:subject', '');
  const [subjectForm, setSubjectForm] = useState(null);
  const [themeForm, setThemeForm] = useState(null);
  // A theme just created opens straight into editing so its rows can be added.
  const [openTheme, setOpenTheme] = useState('');
  const grade = (grades.includes(chosenGrade) && chosenGrade) || grades[0] || '';

  const { data, loading, error, reload } = useCasQuery(
    grade ? `/api/cas/curriculum?grade=${encodeURIComponent(grade)}` : null,
  );
  const { run, pending, error: saveError, success, setError, setSuccess } = useCasMutation();
  const subjects = data || [];
  const subjectId = subjects.some((subject) => subject.id === chosenSubject)
    ? chosenSubject
    : subjects[0]?.id || '';
  const subject = subjects.find((item) => item.id === subjectId) || null;
  const themes = subject?.themes || [];
  const rowsByTheme = new Map();
  for (const theme of themes) rowsByTheme.set(theme.key, []);
  for (const outcome of subject?.outcomes || []) {
    const key = outcome.themeKey || `${outcome.themeNe || ''}|${outcome.themeEn || ''}`;
    if (!rowsByTheme.has(key)) rowsByTheme.set(key, []);
    rowsByTheme.get(key).push(outcome);
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  async function saveSubject(event) {
    event.preventDefault();
    const isEdit = Boolean(subjectForm.id);
    const result = await run('/api/cas/curriculum/subject', {
      method: isEdit ? 'PATCH' : 'POST',
      body: isEdit
        ? {
            subject: subjectForm.id,
            titleEn: subjectForm.titleEn,
            titleNe: subjectForm.titleNe,
            creditHours: hoursForInput(subjectForm.creditHours),
          }
        : {
            grade,
            code: subjectForm.code,
            titleEn: subjectForm.titleEn,
            titleNe: subjectForm.titleNe,
            creditHours: hoursForInput(subjectForm.creditHours),
          },
    }, {
      successMessage: isEdit
        ? t('Subject updated', 'विषय अद्यावधिक भयो')
        : t('Subject added', 'विषय थपियो'),
    });
    if (result.ok) {
      setSubjectForm(null);
      setSubject(result.data.id);
      reload();
    }
  }

  async function removeSubject() {
    if (!subject) return;
    if (!window.confirm(t(
      `Delete ${subject.titleEn} and all its themes and rows? Subjects that already have scores are archived instead.`,
      `${subject.titleNe || subject.titleEn} र यसका सबै थिम तथा पङ्क्ति मेट्ने? अङ्कन भइसकेको विषय सङ्ग्रहमा राखिन्छ।`,
    ))) return;
    const result = await run('/api/cas/curriculum/subject', {
      method: 'DELETE',
      body: { id: subject.id },
    }, { successMessage: t('Subject removed', 'विषय हटाइयो') });
    if (result.ok) {
      setSubject('');
      reload();
    }
  }

  async function saveTheme(event) {
    event.preventDefault();
    const result = await run('/api/cas/curriculum/theme', {
      method: 'POST',
      body: {
        subject: subjectId,
        titleEn: themeForm.titleEn,
        titleNe: themeForm.titleNe,
        workingHours: hoursForInput(themeForm.workingHours),
      },
    }, { successMessage: t('Theme added. Add its rows, then save.', 'थिम थपियो। पङ्क्ति थपेर सुरक्षित गर्नुहोस्।') });
    if (result.ok) {
      setThemeForm(null);
      setOpenTheme(result.data.key);
      reload();
    }
  }

  async function removeTheme(theme) {
    if (!window.confirm(t(
      `Delete theme "${theme.titleEn || theme.titleNe}" and its rows from ${subject?.titleEn || 'this subject'}?

This affects only your school. A theme with recorded scores is archived instead, and published results do not change. A default theme can be added back from "Default themes".`,
      `${subject?.titleNe || subject?.titleEn || 'यस विषय'} बाट थिम "${theme.titleNe || theme.titleEn}" र यसका पङ्क्ति मेट्ने? यसले तपाईंको विद्यालयमा मात्र असर गर्छ। अङ्कन भइसकेको थिम सङ्ग्रहमा राखिन्छ।`,
    ))) return;
    const result = await run('/api/cas/curriculum/theme', {
      method: 'DELETE',
      body: { subject: subjectId, themeKey: theme.key },
    }, { successMessage: t('Theme removed', 'थिम हटाइयो') });
    if (result.ok) reload();
  }

  async function saveThemeBook(theme, book) {
    clearMessages();
    const result = await run('/api/cas/curriculum/theme', {
      method: 'PUT',
      body: { subject: subjectId, themeKey: theme.key, ...book },
    });
    if (result.ok) {
      if (openTheme === theme.key) setOpenTheme('');
      reload();
    } else {
      setError('');
    }
    return result;
  }

  return (
    <>
      <PageHeader
        title={isLibrary ? t('Default theme library', 'पूर्वनिर्धारित थिम सङ्ग्रह') : t('Curriculum', 'पाठ्यक्रम')}
        description={isLibrary
          ? t('Default subjects, themes and learning outcomes for Grades 1 to 5. Schools copy these into their own curriculum; editing here never changes a school’s copy.',
            'कक्षा १ देखि ५ का पूर्वनिर्धारित विषय, थिम र सिकाइ उपलब्धि। यहाँको परिवर्तनले विद्यालयको प्रति बदल्दैन।')
          : t(
            'Create subjects, chapters and learning-outcome rows for assessment.',
            'मूल्याङ्कनका लागि विषय, थिम र सिकाइ उपलब्धि पङ्क्ति व्यवस्थापन गर्नुहोस्।',
          )}
      />

      {!isLibrary && (
        <Card title={t('Manage Exams', 'परीक्षा व्यवस्थापन')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{t('Create, rename, remove exams, and assign themes from Manage Exams.', 'Create, rename, remove exams, and assign themes from Manage Exams.')}</p>
            <Link href="/school/cas/exams" className="btn btn-primary inline-flex items-center justify-center font-semibold">{t('Manage exams', 'परीक्षा व्यवस्थापन')}</Link>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-x-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <Field label={t('Grade', 'कक्षा')}>
              <Select
                value={grade}
                onChange={(event) => {
                  setGrade(event.target.value);
                  setSubject('');
                  setSubjectForm(null);
                  setThemeForm(null);
                  setOpenTheme('');
                }}
              >
                {grades.length === 0 && <option value="">No grades configured</option>}
                {grades.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label={t('Subject', 'विषय')}>
              <Select
                value={subjectId}
                disabled={subjects.length === 0}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setThemeForm(null);
                  setOpenTheme('');
                }}
              >
                {subjects.length === 0 && <option value="">No subjects yet</option>}
                {subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.titleEn, item.titleNe)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 pb-3">
              <Button
                variant="secondary"
                onClick={() => {
                  clearMessages();
                  setSubjectForm(emptySubject(grade));
                }}
              >
                <FaPlus className="" /> {t('Add subject', 'विषय थप्नुहोस्')}
              </Button>
              <Button
                disabled={!subjectId}
                onClick={() => {
                  clearMessages();
                  setThemeForm(emptyTheme(subjectId));
                }}
              >
                <FaPlus className="" /> {t('Add theme', 'थिम थप्नुहोस्')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {(error || saveError) && <Alert tone="danger">{error || saveError}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {canEdit && !isLibrary && subjectId && (
        // Remounts (and refetches) when themes are added or deleted below.
        <DefaultThemesPanel key={`${subjectId}:${themes.length}`} subjectId={subjectId} t={t} onChanged={reload} />
      )}

      {subjectForm && (
        <Card title={subjectForm.id ? t('Edit subject', 'विषय सम्पादन') : t('New subject', 'नयाँ विषय')}>
          <form onSubmit={saveSubject}>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('Code', 'सङ्केत')} required>
                <Input
                  value={subjectForm.code}
                  disabled={Boolean(subjectForm.id)}
                  required
                  maxLength={20}
                  placeholder="ENG"
                  onChange={(event) =>
                    setSubjectForm({ ...subjectForm, code: event.target.value.toUpperCase() })
                  }
                />
              </Field>
              <Field label={t('Subject name', 'विषयको नाम')} required>
                <Input
                  value={subjectForm.titleEn}
                  required
                  maxLength={120}
                  placeholder="English"
                  onChange={(event) =>
                    setSubjectForm({ ...subjectForm, titleEn: event.target.value })
                  }
                />
              </Field>
              <Field label={t('Subject name (Nepali)', 'विषयको नाम (नेपाली)')}>
                <Input
                  lang="ne"
                  className="cas-ne"
                  value={subjectForm.titleNe}
                  maxLength={120}
                  onChange={(event) =>
                    setSubjectForm({ ...subjectForm, titleNe: event.target.value })
                  }
                />
              </Field>
              <Field label={t('Credit hours', 'क्रेडिट घण्टा')}>
                <Input
                  type="number"
                  min="0"
                  max="40"
                  step="0.5"
                  value={subjectForm.creditHours ?? ''}
                  placeholder="4"
                  onChange={(event) =>
                    setSubjectForm({ ...subjectForm, creditHours: event.target.value })
                  }
                />
              </Field>
            </div>
            <FormActions pending={pending} onCancel={() => setSubjectForm(null)} t={t} />
          </form>
        </Card>
      )}

      {themeForm && (
        <Card title={t('New theme', 'नयाँ थिम')}>
          <form onSubmit={saveTheme}>
            <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,9rem)]">
              <Field label={t('Theme name', 'थिमको नाम')}>
                <Input
                  value={themeForm.titleEn}
                  maxLength={200}
                  placeholder="My Daily Life"
                  onChange={(event) =>
                    setThemeForm({ ...themeForm, titleEn: event.target.value })
                  }
                />
              </Field>
              <Field label={t('Theme name (Nepali)', 'थिमको नाम (नेपाली)')}>
                <Input
                  lang="ne"
                  className="cas-ne"
                  value={themeForm.titleNe}
                  maxLength={200}
                  onChange={(event) =>
                    setThemeForm({ ...themeForm, titleNe: event.target.value })
                  }
                />
              </Field>
              <Field label={t('Working hours', 'कार्य घण्टा')}>
                <Input
                  type="number"
                  min="0"
                  max="500"
                  value={themeForm.workingHours}
                  onChange={(event) =>
                    setThemeForm({ ...themeForm, workingHours: event.target.value })
                  }
                />
              </Field>
            </div>
            <FormActions pending={pending} onCancel={() => setThemeForm(null)} t={t} />
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : !subject ? (
        <Card>
          <EmptyState
            icon={FaBookOpen}
            title={t('No subjects for this grade yet', 'यस कक्षाका लागि विषय छैन')}
            description={t(
              'Add a subject, then create its themes and rows.',
              'पहिले विषय थप्नुहोस्, त्यसपछि थिम र पङ्क्ति बनाउनुहोस्।',
            )}
            action={
              canEdit ? (
                <Button onClick={() => setSubjectForm(emptySubject(grade))}>
                  {t('Add subject', 'विषय थप्नुहोस्')}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-wide text-brand">
                {grade} · {subject.code}
              </p>
              <h2 className="mt-1 font-semibold text-ink">
                {t(subject.titleEn, subject.titleNe)}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="info">
                  {themes.length} {t('themes', 'थिम')}
                </Badge>
                <Badge tone="neutral">
                  {subject.outcomes.length} {t('rows', 'पङ्क्ति')}
                </Badge>
                <Badge tone={subject.creditHours == null ? 'warning' : 'neutral'}>
                  {subject.creditHours == null
                    ? t('No credit hours - left out of GPA', 'क्रेडिट घण्टा छैन - GPA मा गनिँदैन')
                    : `${subject.creditHours} ${t('credit hours', 'क्रेडिट घण्टा')}`}
                </Badge>
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    clearMessages();
                    setSubjectForm({ ...subject });
                  }}
                >
                  <FaPen className="" /> {t('Edit subject', 'विषय सम्पादन')}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={removeSubject}>
                  <FaTrash className="" /> {t('Delete subject', 'विषय मेट्नुहोस्')}
                </Button>
              </div>
            )}
          </div>

          {themes.length === 0 ? (
            <EmptyState
              icon={FaBookOpen}
              title={t('No themes yet', 'थिम छैन')}
              description={t(
                'Create a theme before adding learning-outcome rows.',
                'सिकाइ उपलब्धि पङ्क्ति थप्नुअघि थिम बनाउनुहोस्।',
              )}
              action={
                canEdit ? (
                  <Button onClick={() => setThemeForm(emptyTheme(subjectId))}>
                    {t('Add theme', 'थिम थप्नुहोस्')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <div>
              {themes.map((theme) => (
                <CurriculumThemeTable
                  key={theme.key}
                  subject={subject}
                  theme={theme}
                  rows={rowsByTheme.get(theme.key) || []}
                  canEdit={canEdit}
                  pending={pending}
                  t={t}
                  startEditing={openTheme === theme.key}
                  onSave={saveThemeBook}
                  onDeleteTheme={removeTheme}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function FormActions({ pending, onCancel, t }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? t('Saving...', 'सुरक्षित हुँदै...') : t('Save', 'सुरक्षित गर्नुहोस्')}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        {t('Cancel', 'रद्द')}
      </Button>
    </div>
  );
}
