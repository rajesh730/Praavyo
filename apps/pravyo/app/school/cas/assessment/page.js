'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { BookOpen as FaBookOpen, CalendarCheck as FaCalendarCheck, ClipboardList as FaClipboardList } from 'lucide-react';
import { useCas } from '@pravyo/cas/components/CasLayout';
import { useCasQuery } from '@pravyo/cas/lib/client/useCas';
import { PageHeader, Card, Field, Select, Alert, Spinner, EmptyState } from '@pravyo/cas/components/ui/Kit';
import AssessmentBook from '@pravyo/cas/components/AssessmentBook';
import StudentSupplementaryAssessment from '@pravyo/cas/components/StudentSupplementaryAssessment';
import { sectionsForGrade } from '@pravyo/cas/lib/casSections';

export default function AssessmentPage() {
  const { school, academicYear, t } = useCas();
  // Filters are remembered until the page is refreshed.
  const [activeTab, setActiveTab] = useRememberedState('cas-assessment:tab', 'academic');
  const [chosenGrade, setGrade] = useRememberedState('cas-assessment:grade', '');
  const [subjectId, setSubject] = useRememberedState('cas-assessment:subject', '');
  const [studentId, setStudent] = useRememberedState('cas-assessment:student', '');
  const [chosenSection, setSection] = useRememberedState('cas-assessment:section', '');
  const [chosenTheme, setTheme] = useRememberedState('cas-assessment:theme', '');
  const [examId, setExamId] = useRememberedState('cas-assessment:exam', '');
  // Shared by the attendance and extra-activities tabs so switching keeps the choice.
  const [recordExam, setRecordExam] = useRememberedState('cas-assessment:record-exam', '');
  const [recordSection, setRecordSection] = useRememberedState('cas-assessment:record-section', '');
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState({});
  const grades = school?.grades || [];
  const grade = grades.includes(chosenGrade) ? chosenGrade : '';
  const sections = sectionsForGrade(school?.gradeSections, grade);
  // Only live sections: one deleted on the dashboard stops filtering here.
  const section = sections.includes(chosenSection) ? chosenSection : '';
  const examQuery = useCasQuery(
    activeTab === 'academic' && grade && academicYear?.id
      ? `/api/cas/exams?${new URLSearchParams({ academicYear: academicYear.id, grade })}`
      : null,
  );
  const exams = examQuery.data?.exams || [];
  const selectedExam = exams.find((item) => item.id === examId) || exams[0];

  const curriculum = useCasQuery(
    activeTab === 'academic' && grade && academicYear?.id
      ? `/api/cas/curriculum?${new URLSearchParams({ grade, academicYear: academicYear.id })}`
      : null,
  );
  const subjects = curriculum.data || [];
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const academicStudents = useCasQuery(
    activeTab === 'academic' && grade && selectedSubject && academicYear?.id
      ? `/api/cas/students?grade=${encodeURIComponent(grade)}&academicYear=${academicYear.id}&subject=${encodeURIComponent(subjectId)}${section ? `&section=${encodeURIComponent(section)}` : ''}`
      : null,
  );
  const roster = academicStudents.data || [];
  const selectedStudent = roster.find((student) => student.id === studentId);
  const themeQuery = useCasQuery(
    activeTab === 'academic' && selectedSubject && selectedExam
      ? `/api/cas/themes?${new URLSearchParams({ grade, subject: subjectId, exam: selectedExam.id, academicYear: academicYear.id })}`
      : null,
  );
  const themes = themeQuery.data?.themes || [];
  const themeKey = themes.some((theme) => theme.key === chosenTheme)
    ? chosenTheme
    : themes[0]?.key;
  const sheetPath =
    academicYear?.id && selectedSubject && selectedStudent && selectedExam && themeKey !== undefined
      ? `/api/cas/sheet?${new URLSearchParams({
          academicYear: academicYear.id,
          grade,
          subject: subjectId,
          student: studentId,
          theme: themeKey,
          exam: selectedExam.id,
        })}`
      : null;
  const sheetQuery = useCasQuery(sheetPath);
  const sheet = sheetQuery.data;
  const loading =
    curriculum.loading ||
    academicStudents.loading ||
    themeQuery.loading ||
    examQuery.loading ||
    sheetQuery.loading;
  const error = curriculum.error || academicStudents.error || themeQuery.error || sheetQuery.error;
  const tabs = [
    { id: 'academic', label: t('Academic', 'Academic'), icon: FaBookOpen },
    { id: 'attendance', label: t('Attendance', 'Attendance'), icon: FaCalendarCheck },
    { id: 'activities', label: t('Extra Activities', 'Extra Activities'), icon: FaClipboardList },
  ];

  function resetAcademicForGrade(value) {
    setGrade(value);
    setSubject('');
    setStudent('');
    setSection('');
    setTheme('');
    setRecordExam('');
    setRecordSection('');
  }

  return (
    <>
      <PageHeader
        title={t('Assessment', 'Assessment')}
        description={t(
          'Record academic outcomes, attendance and extra activities for the report card.',
          'Record academic outcomes, attendance and extra activities for the report card.',
        )}
      />

      <div
        className="mb-3 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Assessment sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors ${
                active
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-brand hover:bg-brand-soft'
              }`}
            >
              <Icon className="text-xs" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'academic' && (
        <>
          {!examQuery.loading && exams.length === 0 && (
            <Alert tone="warning">Create an exam and assign themes in Curriculum before recording marks.</Alert>
          )}
          <Card>
            <fieldset
              disabled={saving}
            className="grid min-w-0 gap-x-4 sm:grid-cols-2 lg:grid-cols-6"
            >
              <Field label={t('Grade', 'Grade')}>
                <Select value={grade} onChange={(event) => resetAcademicForGrade(event.target.value)}>
                  <option value="">{t('Choose grade', 'Choose grade')}</option>
                  {grades.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
              {sections.length > 0 && <Field label={t('Section', 'सेक्सन')}>
                <Select value={section} onChange={(event) => { setSection(event.target.value); setStudent(''); }}>
                  <option value="">{t('All sections', 'सबै सेक्सन')}</option>
                  {sections.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </Field>}
              <Field label={t('Exam', 'Exam')}>
                <Select value={selectedExam?.id || ''} disabled={!exams.length} onChange={(event) => { setExamId(event.target.value); setTheme(''); setStudent(''); }}>
                  {!exams.length && <option value="">Create exam in Curriculum</option>}
                  {exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label={t('Subject', 'Subject')}>
                <Select
                  value={selectedSubject ? subjectId : ''}
                  disabled={!subjects.length || curriculum.loading}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    setStudent('');
                    setTheme('');
                  }}
                >
                  <option value="">{t('Choose subject', 'Choose subject')}</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {t(subject.titleEn, subject.titleNe)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Theme', 'Theme')}>
                <Select
                  value={themeKey ?? ''}
                  disabled={!themes.length || themeQuery.loading}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  {!themes.length && (
                    <option value="">
                      {selectedSubject && !themeQuery.loading
                        ? t('No theme assigned to this exam', 'No theme assigned to this exam')
                        : t('Choose subject first', 'Choose subject first')}
                    </option>
                  )}
                  {themes.map((theme, index) => (
                    <option key={theme.key} value={theme.key}>
                      {theme.sequence || index + 1}.{' '}
                      {t(theme.titleEn, theme.titleNe) ||
                        theme.titleNe ||
                        t('Learning outcomes', 'Learning outcomes')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Student', 'Student')}>
                <Select
                  value={selectedStudent ? studentId : ''}
                  disabled={!roster.length || academicStudents.loading}
                  onChange={(event) => setStudent(event.target.value)}
                >
                  <option value="">{t('Choose student', 'Choose student')}</option>
                  {roster.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.rollNumber ? `${student.rollNumber} - ` : ''}
                      {student.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </fieldset>
          </Card>

          {error && <Alert tone="danger">{error}</Alert>}
          {loading && <Spinner label={t('Loading assessment book...', 'Loading assessment book...')} />}
          {!loading && !error && !sheet && (
            <Card>
              <EmptyState
                icon={FaBookOpen}
                title={
                  grade && !subjects.length
                    ? t('No curriculum for this grade', 'No curriculum for this grade')
                    : selectedSubject && !themeQuery.loading && !themes.length
                      ? t(
                          'No themes are assigned to this exam in this subject',
                          'No themes are assigned to this exam in this subject',
                        )
                      : selectedSubject && !roster.length
                        ? t(
                            'No students enrolled in this grade and year',
                            'No students enrolled in this grade and year',
                          )
                        : t("Open a student's assessment book", "Open a student's assessment book")
                }
                description={
                  selectedSubject && !themeQuery.loading && !themes.length
                    ? t(
                        'In Curriculum, assign a saved theme to this exam.',
                        'In Curriculum, assign a saved theme to this exam.',
                      )
                    : t(
                        'Choose the grade, subject, theme and student above. Each student has a separate record.',
                        'Choose the grade, subject, theme and student above. Each student has a separate record.',
                      )
                }
              />
            </Card>
          )}
          {sheet && (
            <AssessmentBook
              key={sheetPath}
              sheet={sheet}
              t={t}
              cachedDraft={drafts[sheetPath]}
              onDraftChange={(draft) =>
                setDrafts((previous) => ({ ...previous, [sheetPath]: draft }))
              }
              onSavingChange={setSaving}
              onSaved={(saved) => {
                setDrafts((previous) => {
                  const next = { ...previous };
                  delete next[sheetPath];
                  return next;
                });
                sheetQuery.setData(saved);
              }}
            />
          )}
        </>
      )}

      {activeTab === 'attendance' && (
        <StudentSupplementaryAssessment
          mode="attendance"
          grade={grade}
          setGrade={resetAcademicForGrade}
          grades={grades}
          gradeSections={school?.gradeSections || []}
          academicYear={academicYear}
          exam={recordExam}
          setExam={setRecordExam}
          section={recordSection}
          setSection={setRecordSection}
          t={t}
        />
      )}

      {activeTab === 'activities' && (
        <StudentSupplementaryAssessment
          mode="activities"
          grade={grade}
          setGrade={resetAcademicForGrade}
          grades={grades}
          gradeSections={school?.gradeSections || []}
          academicYear={academicYear}
          exam={recordExam}
          setExam={setRecordExam}
          section={recordSection}
          setSection={setRecordSection}
          t={t}
        />
      )}
    </>
  );
}
