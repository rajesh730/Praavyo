'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { BookOpen as FaBookOpen, ChevronLeft as FaChevronLeft, ChevronRight as FaChevronRight } from 'lucide-react';
import { useCas } from './CasLayout.js';
import { useCasQuery } from '../lib/client/useCas.js';
import { PageHeader, Card, Field, Select, Alert, Spinner, EmptyState } from './ui/Kit.js';
import AssessmentBook from './AssessmentBook.js';
import { sectionsForGrade } from '../lib/casSections.js';

/**
 * CAS assessment: learning outcomes only. Attendance and extra activities are
 * not part of CAS; they are recorded per internal exam under
 * Internal Exam → Attendance & Activities.
 */
export default function AssessmentPage() {
  // `api` is the school's or the teacher's API, whichever area this is shown in.
  const { school, academicYear, t, api } = useCas();
  // Filters are remembered until the page is refreshed.
  const [chosenGrade, setGrade] = useRememberedState('cas-assessment:grade', '');
  const [subjectId, setSubject] = useRememberedState('cas-assessment:subject', '');
  const [studentId, setStudent] = useRememberedState('cas-assessment:student', '');
  const [chosenSection, setSection] = useRememberedState('cas-assessment:section', '');
  const [chosenTheme, setTheme] = useRememberedState('cas-assessment:theme', '');
  const [examId, setExamId] = useRememberedState('cas-assessment:exam', '');
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState({});
  const isTeacher = api.audience === 'teacher';
  const grades = school?.grades || [];
  // A teacher with a single grade starts in it; anyone else chooses.
  const grade = grades.includes(chosenGrade) ? chosenGrade : (isTeacher && grades.length === 1 ? grades[0] : '');
  const sections = sectionsForGrade(school?.gradeSections, grade);
  // Only live sections: one deleted on the dashboard stops filtering here.
  const section = sections.includes(chosenSection) ? chosenSection : '';
  const examQuery = useCasQuery(
    grade && academicYear?.id
      ? `${api.cas('/exams')}?${new URLSearchParams({ academicYear: academicYear.id, grade })}`
      : null,
  );
  const exams = examQuery.data?.exams || [];
  // Opens on the exam the school marked current in Manage Exams.
  const selectedExam = exams.find((item) => item.id === examId) || exams.find((item) => item.isCurrent) || exams[0];

  const curriculum = useCasQuery(
    grade && academicYear?.id
      ? `${api.cas('/curriculum')}?${new URLSearchParams({ grade, academicYear: academicYear.id })}`
      : null,
  );
  // A teacher is opened to subjects exam by exam, so list only the subjects
  // the school opened to them in the chosen exam (the server already limits
  // the exams and the assignments to theirs).
  const examSubjects = isTeacher && selectedExam
    ? new Set((examQuery.data?.assignments || []).filter((row) => row.exam === selectedExam.id).map((row) => row.subject))
    : null;
  const subjects = (curriculum.data || []).filter((subject) => !examSubjects || examSubjects.has(subject.id));
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const academicStudents = useCasQuery(
    grade && selectedSubject && academicYear?.id
      ? `${api.cas('/students')}?grade=${encodeURIComponent(grade)}&academicYear=${academicYear.id}&subject=${encodeURIComponent(subjectId)}${section ? `&section=${encodeURIComponent(section)}` : ''}`
      : null,
  );
  const roster = academicStudents.data || [];
  // Opens on the first student, so arriving from the dashboard (grade, exam
  // and subject already chosen) shows marks straight away; Previous / Next
  // then walk the class.
  const selectedStudent = roster.find((student) => student.id === studentId) || roster[0];
  const studentIndex = selectedStudent ? roster.indexOf(selectedStudent) : -1;
  const themeQuery = useCasQuery(
    selectedSubject && selectedExam
      ? `${api.cas('/themes')}?${new URLSearchParams({ grade, subject: subjectId, exam: selectedExam.id, academicYear: academicYear.id })}`
      : null,
  );
  const themes = themeQuery.data?.themes || [];
  const themeKey = themes.some((theme) => theme.key === chosenTheme)
    ? chosenTheme
    : themes[0]?.key;
  const sheetPath =
    academicYear?.id && selectedSubject && selectedStudent && selectedExam && themeKey !== undefined
      ? `${api.cas('/sheet')}?${new URLSearchParams({
          academicYear: academicYear.id,
          grade,
          subject: subjectId,
          student: selectedStudent.id,
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
  function resetAcademicForGrade(value) {
    setGrade(value);
    setSubject('');
    setStudent('');
    setSection('');
    setTheme('');
  }

  return (
    <>
      <PageHeader
        title={t('Assessment', 'Assessment')}
        description={t(
          'Record each student’s learning outcomes, theme by theme, for the CAS report card.',
          'CAS नतिजा पत्रका लागि प्रत्येक विद्यार्थीको सिकाइ उपलब्धि, विषयवस्तु अनुसार राख्नुहोस्।',
        )}
      />

          {!examQuery.loading && exams.length === 0 && (
            <Alert tone="warning">
              {isTeacher
                ? t('No exam is open for your marks in this grade. An exam appears here when your school opens it for you, and leaves once its results are published.', 'यस कक्षामा तपाईंका लागि अङ्क प्रविष्टि खुला परीक्षा छैन। विद्यालयले खोलेपछि यहाँ देखिन्छ, नतिजा प्रकाशित भएपछि हट्छ।')
                : 'Create an exam and assign themes in Curriculum before recording marks.'}
            </Alert>
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
              {/* Always shown, so the filter row looks the same for every grade;
                  a grade without sections gets a disabled "No sections". */}
              <Field label={t('Section', 'सेक्सन')}>
                <Select value={section} disabled={!sections.length} onChange={(event) => { setSection(event.target.value); setStudent(''); }}>
                  <option value="">{sections.length ? t('All sections', 'सबै सेक्सन') : t('No sections', 'सेक्सन छैन')}</option>
                  {sections.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </Field>
              <Field label={t('Exam', 'Exam')}>
                <Select value={selectedExam?.id || ''} disabled={!exams.length} onChange={(event) => { setExamId(event.target.value); setTheme(''); setStudent(''); }}>
                  {!exams.length && <option value="">{isTeacher ? t('No open exam', 'खुला परीक्षा छैन') : 'Create exam in Curriculum'}</option>}
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
                  value={selectedStudent?.id || ''}
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
            {roster.length > 1 && selectedStudent && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                  disabled={saving || studentIndex <= 0}
                  onClick={() => setStudent(roster[studentIndex - 1].id)}
                >
                  <FaChevronLeft aria-hidden size={14} />{t('Previous', 'अघिल्लो')}
                </button>
                <p className="min-w-0 truncate text-center text-sm text-muted" aria-live="polite">
                  <span className="font-semibold text-ink">{selectedStudent.name}</span>
                  {' · '}
                  {t(`${studentIndex + 1} of ${roster.length}`, `${roster.length} मध्ये ${studentIndex + 1}`)}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                  disabled={saving || studentIndex >= roster.length - 1}
                  onClick={() => setStudent(roster[studentIndex + 1].id)}
                >
                  {t('Next', 'अर्को')}<FaChevronRight aria-hidden size={14} />
                </button>
              </div>
            )}
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
  );
}
