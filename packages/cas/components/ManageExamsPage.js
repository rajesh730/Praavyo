'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import Link from 'next/link';
import { ArrowLeft as FaArrowLeft, BookOpen as FaBookOpen, Check as FaCheck, ChevronDown as FaChevronDown, ChevronUp as FaChevronUp, Pen as FaPen, Plus as FaPlus, Trash2 as FaTrash, X as FaTimes, Undo2 as FaUndo } from 'lucide-react';
import { useCas } from './CasLayout.js';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from './ui/Kit.js';
import IssueDateInput from './ui/IssueDateInput.js';
import { todayBsNumeric } from '@pravyo/core/nepaliDate';

export default function ManageExamsPage() {
  const { actor, academicYear, years, school, t } = useCas();
  // Filters are remembered until the page is refreshed.
  const [yearId, setYearId] = useRememberedState('cas-exams:year', '');
  const [gradeChoice, setGradeChoice] = useRememberedState('cas-exams:grade', '');
  const [examName, setExamName] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [issueDate, setIssueDate] = useState(() => todayBsNumeric());
  const [editing, setEditing] = useState(null);
  const [openExamId, setOpenExamId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const canEdit = actor?.role === 'SCHOOL_ADMIN';
  const selectedYearId = (years.some((year) => year.id === yearId) && yearId) || academicYear?.id || '';
  const grades = school?.grades || [];
  const selectedGrade = grades.includes(gradeChoice) ? gradeChoice : grades[0] || '';
  const curriculumQuery = useCasQuery(
    selectedGrade && selectedYearId
      ? `/api/cas/curriculum?${new URLSearchParams({ grade: selectedGrade, academicYear: selectedYearId })}`
      : null,
  );
  const subjects = curriculumQuery.data || [];
  const subjectName = (subject) => t(subject.titleEn, subject.titleNe) || subject.code;
  const themeName = (theme) => t(theme.titleEn, theme.titleNe) || theme.titleEn || theme.titleNe || theme.key;
  const queryPath = selectedYearId
    ? `/api/cas/exams?${new URLSearchParams({ academicYear: selectedYearId, includeArchived: 'true' })}`
    : null;
  const examsQuery = useCasQuery(queryPath);
  const { run, pending, error, success, setSuccess } = useCasMutation();
  const exams = examsQuery.data?.exams || [];
  const assignments = examsQuery.data?.assignments || [];
  const teacherAssignmentQuery = useCasQuery(
    selectedYearId && selectedGrade
      ? `/api/cas/exam-teachers?${new URLSearchParams({ academicYear: selectedYearId, grade: selectedGrade })}`
      : null,
  );
  const teacherAssignments = teacherAssignmentQuery.data?.assignments || [];
  const teachers = teacherAssignmentQuery.data?.teachers || [];

  async function createExam(event) {
    event.preventDefault();
    const result = await run('/api/cas/exams', {
      method: 'POST', body: { academicYear: selectedYearId, name: examName, reportTitle, issueDate },
    }, { successMessage: t('Exam created', 'परीक्षा सिर्जना भयो') });
    if (result.ok) {
      setExamName('');
      setReportTitle('');
      setIssueDate(todayBsNumeric());
      setShowCreate(false);
      examsQuery.reload();
    }
  }

  async function saveExam(event) {
    event.preventDefault();
    const result = await run('/api/cas/exams', {
      method: 'PATCH', body: {
        exam: editing.id,
        name: editing.name,
        academicYear: editing.academicYear,
        reportTitle: editing.reportTitle,
        issueDate: editing.issueDate,
      },
    }, { successMessage: t('Exam updated', 'परीक्षा अद्यावधिक भयो') });
    if (result.ok) {
      setEditing(null);
      examsQuery.reload();
    }
  }

  async function deleteExam(exam) {
    if (!window.confirm(t(
      `Delete "${exam.name}"?\n\nIf no marks or results exist yet, it is removed completely. ` +
      'If it already has marks or results, it is archived instead: it leaves assessment, ' +
      'but every published result stays in Student Result.',
      `"${exam.name}" हटाउने?\n\nअङ्क वा नतिजा नभएको परीक्षा पूर्ण रूपमा हट्छ। ` +
      'अङ्क वा नतिजा भएको परीक्षा संग्रहित हुन्छ, र प्रकाशित नतिजा Student Result मा रहिरहन्छ।',
    ))) return;
    const result = await run('/api/cas/exams', {
      method: 'DELETE', body: { exam: exam.id },
    });
    if (result.ok) {
      setSuccess(result.data?.archived
        ? t('Exam archived. Its published results are kept in Student Result.', 'परीक्षा संग्रहित भयो। प्रकाशित नतिजा Student Result मा सुरक्षित छ।')
        : t('Exam deleted', 'परीक्षा हटाइयो'));
      if (openExamId === exam.id) setOpenExamId('');
      if (editing?.id === exam.id) setEditing(null);
      examsQuery.reload();
    }
  }

  async function restoreExam(exam) {
    const result = await run('/api/cas/exams', {
      method: 'PATCH', body: { action: 'restore', exam: exam.id },
    }, { successMessage: t('Exam restored', 'परीक्षा पुनः सक्रिय भयो') });
    if (result.ok) examsQuery.reload();
  }

  async function toggleExamTheme(exam, subject, theme, assigned) {
    if (!selectedGrade) return;
    const assignedExamIds = assignments
      .filter((assignment) =>
        assignment.grade === selectedGrade &&
        assignment.subject === subject.id &&
        assignment.themeKey === theme.key)
      .map((assignment) => assignment.exam);
    const nextExamIds = assigned
      ? assignedExamIds.filter((id) => id !== exam.id)
      : [...new Set([...assignedExamIds, exam.id])];
    const result = await run('/api/cas/exams', {
      method: 'PUT',
      body: {
        academicYear: selectedYearId,
        grade: selectedGrade,
        subject: subject.id,
        themeKey: theme.key,
        examIds: nextExamIds,
      },
    }, {
      successMessage: assigned
        ? t('Theme removed from exam', 'परीक्षाबाट थिम हटाइयो')
        : t('Theme added to exam', 'थिम परीक्षामा थपियो'),
    });
    if (result.ok) examsQuery.reload();
  }

  async function toggleSubjectTeacher(exam, subject, teacher, assigned) {
    const teacherIds = teacherAssignments
      .filter((row) => row.exam === exam.id && row.grade === selectedGrade && row.subject === subject.id)
      .map((row) => row.teacher);
    const nextTeacherIds = assigned
      ? teacherIds.filter((id) => id !== teacher.id)
      : [...new Set([...teacherIds, teacher.id])];
    const result = await run('/api/cas/exam-teachers', {
      method: 'POST',
      body: {
        academicYear: selectedYearId,
        exam: exam.id,
        grade: selectedGrade,
        subject: subject.id,
        teacherIds: nextTeacherIds,
      },
    }, {
      successMessage: assigned
        ? t('Teacher access removed', 'Teacher access removed')
        : t('Teacher assigned to this subject', 'Teacher assigned to this subject'),
    });
    if (result.ok) teacherAssignmentQuery.reload();
  }

  return (
    <>
      <PageHeader
        title={t('Manage Exams', 'परीक्षा व्यवस्थापन')}
        description={t('Create each exam once per academic year. It is available to every grade; theme assignments remain grade-specific.', 'हरेक शैक्षिक वर्षमा परीक्षा एकपटक सिर्जना गर्नुहोस्। यो सबै कक्षामा उपलब्ध हुन्छ; थिमको तोकाइ कक्षाअनुसार रहन्छ।')}
        actions={<Link href="/school/cas/curriculum" className="btn btn-secondary inline-flex items-center gap-2 font-semibold"><FaArrowLeft aria-hidden />{t('Curriculum', 'पाठ्यक्रम')}</Link>}
      />

      {(error || examsQuery.error) && <Alert tone="danger">{error || examsQuery.error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}
      {!selectedYearId && (
        <Alert tone="info">{t('Configure an academic year in Pravyo before managing exams.', 'परीक्षा व्यवस्थापन गर्नुअघि Pravyo मा शैक्षिक वर्ष सेट गर्नुहोस्।')}</Alert>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Academic year', 'शैक्षिक वर्ष')}>
            <Select value={selectedYearId} onChange={(event) => setYearId(event.target.value)}>
              {(years.length ? years : academicYear ? [academicYear] : []).map((year) => (
                <option key={year.id} value={year.id}>{year.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('Grade', 'कक्षा')}>
            <Select value={selectedGrade} onChange={(event) => setGradeChoice(event.target.value)} disabled={!grades.length}>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card
        title={t('Exams', 'परीक्षाहरू')}
        description={t('Exams are shared across all grades in this academic year.', 'यस शैक्षिक वर्षका परीक्षा सबै कक्षामा साझा हुन्छन्।')}
        actions={canEdit && <Button onClick={() => { setShowCreate((value) => !value); setEditing(null); }}><FaPlus aria-hidden />{showCreate ? t('Cancel', 'रद्द गर्नुहोस्') : t('Create exam', 'परीक्षा सिर्जना गर्नुहोस्')}</Button>}
      >
        {showCreate && (
          <form onSubmit={createExam} className="mb-4 grid gap-3 border-b border-line pb-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto] xl:items-end">
            <Field label={t('Exam name', 'परीक्षाको नाम')} required>
              <Input autoFocus required minLength={2} maxLength={120} value={examName} placeholder="First Terminal Examination 2083" onChange={(event) => setExamName(event.target.value)} />
            </Field>
            <Field label={t('Report title', 'नतिजा शीर्षक')}>
              <Input maxLength={120} value={reportTitle} placeholder={examName || 'First Terminal Exam'} onChange={(event) => setReportTitle(event.target.value)} />
            </Field>
            <Field label={t('Issue date (B.S.)', 'जारी मिति (वि.सं.)')} required>
              <IssueDateInput required value={issueDate} onChange={setIssueDate} calendar={actor?.calendar} t={t} />
            </Field>
            <Button type="submit" disabled={pending || !selectedYearId}>{t('Save exam', 'परीक्षा सुरक्षित गर्नुहोस्')}</Button>
          </form>
        )}

        {examsQuery.loading ? <Spinner label={t('Loading exams…', 'परीक्षा लोड हुँदैछ…')} /> : exams.length ? (
          <div className="divide-line">
            {exams.map((exam) => {
              const assignedGrades = [...new Set(assignments.filter((assignment) => assignment.exam === exam.id).map((assignment) => assignment.grade))];
              // Theme keys this exam covers in the selected grade, per subject.
              const assignedBySubject = new Map();
              for (const assignment of assignments) {
                if (assignment.exam !== exam.id || assignment.grade !== selectedGrade) continue;
                if (!assignedBySubject.has(assignment.subject)) assignedBySubject.set(assignment.subject, new Set());
                assignedBySubject.get(assignment.subject).add(assignment.themeKey);
              }
              const assignedSubjects = subjects
                .map((subject) => ({
                  subject,
                  themes: (subject.themes || []).filter((theme) => assignedBySubject.get(subject.id)?.has(theme.key)),
                }))
                .filter((entry) => entry.themes.length);
              const isEditing = editing?.id === exam.id;
              const isThemePanelOpen = openExamId === exam.id;
              return (
                <div key={exam.id} className="py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {isEditing ? (
                    <form onSubmit={saveExam} className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_10rem_auto] xl:items-end">
                      <Field label={t('Exam name', 'परीक्षाको नाम')}><Input autoFocus required minLength={2} maxLength={120} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></Field>
                      <Field label={t('Report title', 'नतिजा शीर्षक')}><Input maxLength={120} value={editing.reportTitle} onChange={(event) => setEditing({ ...editing, reportTitle: event.target.value })} /></Field>
                      <Field label={t('Issue date (B.S.)', 'जारी मिति (वि.सं.)')} required><IssueDateInput required value={editing.issueDate} onChange={(issueDate) => setEditing({ ...editing, issueDate })} calendar={actor?.calendar} t={t} /></Field>
                      <Field label={t('Academic year', 'शैक्षिक वर्ष')}><Select value={editing.academicYear} onChange={(event) => setEditing({ ...editing, academicYear: event.target.value })}>{years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</Select></Field>
                      <div className="mb-3 flex gap-2">
                        <Button type="submit" disabled={pending}><FaCheck aria-hidden />{t('Save', 'सुरक्षित')}</Button>
                        <Button variant="secondary" onClick={() => setEditing(null)}><FaTimes aria-hidden />{t('Cancel', 'रद्द')}</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold text-ink">{exam.name}</h3>
                      <div className="mt-3 grid gap-1">
                        <span className="text-xs font-semibold text-muted">{selectedGrade}</span>
                        {curriculumQuery.loading ? <span className="text-xs text-muted">{t('Loading themes...', 'Loading themes...')}</span> : assignedSubjects.length ? (
                          assignedSubjects.map(({ subject, themes }) => (
                            <span key={subject.id} className="text-sm text-ink">
                              <span className="font-semibold">{subjectName(subject)}:</span>{' '}
                              {themes.map(themeName).join(' · ')}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted">{t('No themes added for this grade', 'यस कक्षाका लागि थिम छैन')}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {exam.issueDate
                          ? <Badge tone="neutral">{t(`Issue date: ${exam.issueDate}`, `जारी मिति: ${exam.issueDate}`)}</Badge>
                          : <Badge tone="warning">{t('No issue date: edit to set one before publishing', 'जारी मिति छैन: प्रकाशन अघि सम्पादन गरी राख्नुहोस्')}</Badge>}
                        {exam.status === 'ARCHIVED' && <Badge tone="warning">{t('Archived', 'संग्रहित')}</Badge>}
                        <Badge tone={assignedGrades.length ? 'success' : 'neutral'}>{assignedGrades.length ? t(`Assigned in ${assignedGrades.length} grades`, `${assignedGrades.length} कक्षामा तोकिएको`) : t('No themes assigned', 'थिम तोकिएको छैन')}</Badge>
                      </div>
                    </div>
                  )}
                  {!isEditing && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="secondary" aria-expanded={isThemePanelOpen} aria-controls={`exam-themes-${exam.id}`} onClick={() => setOpenExamId(isThemePanelOpen ? '' : exam.id)}>
                        <FaBookOpen aria-hidden />{t('Manage themes', 'थिम व्यवस्थापन')}
                        {isThemePanelOpen ? <FaChevronUp aria-hidden /> : <FaChevronDown aria-hidden />}
                      </Button>
                      {canEdit && <>
                      <Button variant="secondary" onClick={() => { setEditing({ id: exam.id, name: exam.name, reportTitle: exam.reportTitle || exam.name, issueDate: exam.issueDate || '', academicYear: exam.academicYear }); setShowCreate(false); }} disabled={pending}><FaPen aria-hidden />{t('Edit', 'सम्पादन')}</Button>
                      {exam.status === 'ARCHIVED' ? (
                        <Button variant="secondary" onClick={() => restoreExam(exam)} disabled={pending}>
                          <FaUndo aria-hidden />{t('Restore', 'पुनः सक्रिय')}
                        </Button>
                      ) : (
                        <Button variant="danger" onClick={() => deleteExam(exam)} disabled={pending}>
                          <FaTrash aria-hidden />{t('Delete', 'हटाउनुहोस्')}
                        </Button>
                      )}
                      </>}
                    </div>
                  )}
                  </div>
                  {isThemePanelOpen && !isEditing && (
                    <section id={`exam-themes-${exam.id}`} className="mt-4 border-t border-line pt-4" aria-label={`${exam.name} themes`}>
                      {!selectedGrade ? <p className="text-sm text-muted">{t('No grades are configured for this school.', 'No grades are configured for this school.')}</p>
                        : curriculumQuery.loading ? <Spinner label={t('Loading themes...', 'Loading themes...')} />
                          : curriculumQuery.error ? <Alert tone="danger">{curriculumQuery.error}</Alert>
                            : subjects.length ? (
                                <>
                                  <p className="mb-3 text-sm text-muted">{selectedGrade}</p>
                                  <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
                                    {subjects.map((subject) => {
                                      const themes = subject.themes || [];
                                      const assignedKeys = assignedBySubject.get(subject.id) || new Set();
                                       const subjectTeacherIds = teacherAssignments
                                         .filter((row) => row.exam === exam.id && row.grade === selectedGrade && row.subject === subject.id)
                                         .map((row) => row.teacher);
                                       const assignedTeachers = teachers.filter((teacher) => subjectTeacherIds.includes(teacher.id));
                                      return (
                                        <div key={subject.id} className="card min-w-0 overflow-hidden">
                                          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
                                            <h4 className="min-w-0 break-words text-sm font-semibold text-ink">{subjectName(subject)}</h4>
                                            <Badge tone={assignedKeys.size ? 'success' : 'neutral'}>{assignedKeys.size}/{themes.length}</Badge>
                                          </div>
                                           <div className="border-b border-line px-3 py-3">
                                             <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                               {t('Teachers with assessment access', 'Teachers with assessment access')}
                                             </p>
                                             {canEdit ? (
                                               teacherAssignmentQuery.loading ? <p className="mt-2 text-xs text-muted">{t('Loading teachers...', 'Loading teachers...')}</p>
                                                 : teachers.length ? (
                                                   <div className="mt-2 space-y-1.5">
                                                     {teachers.map((teacher) => {
                                                       const assigned = subjectTeacherIds.includes(teacher.id);
                                                       const locked = pending || exam.status === 'ARCHIVED';
                                                       return (
                                                         <label key={teacher.id} className={`flex items-center gap-2 text-sm ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                                                           <input
                                                             type="checkbox"
                                                             checked={assigned}
                                                             disabled={locked}
                                                             onChange={() => toggleSubjectTeacher(exam, subject, teacher, assigned)}
                                                             className="h-4 w-4 accent-[var(--brand-primary)]"
                                                           />
                                                           <span className="min-w-0 break-words text-ink">{teacher.name}</span>
                                                           {teacher.subject && <span className="text-xs text-muted">{teacher.subject}</span>}
                                                         </label>
                                                       );
                                                     })}
                                                   </div>
                                                 ) : <p className="mt-2 text-xs text-muted">{t('Register an active teacher in Praavyo first.', 'Register an active teacher in Praavyo first.')}</p>
                                             ) : (
                                               <p className="mt-2 text-xs text-muted">
                                                 {assignedTeachers.length
                                                   ? assignedTeachers.map((teacher) => teacher.name).join(', ')
                                                   : t('No teachers assigned', 'No teachers assigned')}
                                               </p>
                                             )}
                                           </div>
                                          {themes.length ? (
                                            <div className="divide-line">
                                              {themes.map((theme) => {
                                                const assigned = assignedKeys.has(theme.key);
                                                const name = themeName(theme);
                                                const locked = !canEdit || pending || exam.status === 'ARCHIVED' || !theme.outcomeCount;
                                                return (
                                                  <label key={theme.key} className={`flex items-start gap-3 px-3 py-2.5 ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-surface-2'}`}>
                                                    <input
                                                      type="checkbox"
                                                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                                                      checked={assigned}
                                                      disabled={locked}
                                                      onChange={() => toggleExamTheme(exam, subject, theme, assigned)}
                                                      aria-label={`${assigned ? 'Remove' : 'Add'} ${name} from ${exam.name}`}
                                                    />
                                                    <span className="min-w-0">
                                                      <span className="block break-words text-sm font-medium text-ink">{theme.sequence ? `Theme ${theme.sequence}: ` : ''}{name}</span>
                                                      {!theme.outcomeCount && <span className="block text-xs text-muted">{t('No outcomes', 'No outcomes')}</span>}
                                                    </span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <p className="px-3 py-2.5 text-xs text-muted">{t('Add themes to this subject in Curriculum first.', 'Add themes to this subject in Curriculum first.')}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {exam.status === 'ARCHIVED' && <p className="mt-2 text-xs text-muted">{t('This exam is archived, so its themes are locked and its published results stay unchanged. Restore it to make changes.', 'यो परीक्षा संग्रहित छ, त्यसैले थिम परिवर्तन हुँदैन र प्रकाशित नतिजा जस्ताको तस्तै रहन्छ। परिवर्तन गर्न पुनः सक्रिय गर्नुहोस्।')}</p>}
                                  {!canEdit && <p className="mt-2 text-xs text-muted">{t('Only a school administrator can change exam themes.', 'Only a school administrator can change exam themes.')}</p>}
                                </>
                              ) : <EmptyState title={t('No subjects available', 'No subjects available')} description={t('Add subjects for this grade in Curriculum first.', 'Add subjects for this grade in Curriculum first.')} />}
                    </section>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={t('No exams yet', 'अहिलेसम्म परीक्षा छैन')}
            description={t('Create an exam for this year, then assign themes from Manage Exams.', 'यस वर्षका लागि परीक्षा सिर्जना गरी परीक्षा व्यवस्थापनबाट थिम तोक्नुहोस्।')}
            action={canEdit && <Button onClick={() => setShowCreate(true)}><FaPlus aria-hidden />{t('Create exam', 'परीक्षा सिर्जना गर्नुहोस्')}</Button>}
          />
        )}
      </Card>
    </>
  );
}
