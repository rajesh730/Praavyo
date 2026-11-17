import { HttpError, jsonBody } from '@pravyo/cas/lib/casRoute';
import { loadSchool, loadAcademicYears, loadStudents, loadAcademicYear, loadGradeSections } from '@pravyo/cas/lib/casContext';
import { syncDefaultCurriculum } from '@pravyo/cas/lib/casLibraryService';
import { listExams } from '@pravyo/cas/lib/casExamService';
import { loadCurriculum } from '@pravyo/cas/lib/casCurriculumService';
import { assertTeacherGradeAssignment, teacherGradeScope } from '@pravyo/cas/lib/casTeacherAssignmentService';
import { loadThemes, loadStudentSheet, saveSheet, loadStudentSubjectProgress } from '@pravyo/cas/lib/casSheetService';
import { loadProgressOptions } from '@pravyo/cas/lib/casProgressAccess';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import { studentTakesSubject } from '@pravyo/core/subjectScope';
import { publishRealtimeEvent } from '@/lib/realtimeBus';

/**
 * CAS endpoints shared by the two assessment APIs:
 *   - the school's  /api/cas/...               (casRoute `handler`, school admins)
 *   - the teacher's /api/teacher/exams/cas/... (casRoute `teacherHandler`)
 *
 * Each is defined ONCE here and served by both, so a teacher and the school
 * read and write exactly the same records through exactly the same rules. The
 * services decide what a given teacher may see or change.
 */

/** Everything the shell needs on first paint: school, grades, academic years. */
export async function context({ actor }) {
  // Library subjects added since the school was approved (a new grade) arrive here.
  if (!actor.library) await syncDefaultCurriculum(actor.school);
  const [school, years, teacherGrades] = await Promise.all([
    loadSchool(actor),
    loadAcademicYears(actor),
    teacherGradeScope(actor),
  ]);
  // Default to the year the school is actually working in.
  const selectedYear = years.find((y) => y.status === 'ACTIVE') || years[0] || null;
  return {
    actor: { id: actor.id, school: actor.school, role: actor.role, name: actor.name, calendar: actor.calendar },
    school,
    years,
    selectedYear,
    // A teacher's grades per workspace ({ cas, internal }); null for the school.
    teacherGrades,
  };
}

/** A grade's CAS exams for a year. */
export function exams({ actor, query }) {
  return listExams(actor, {
    academicYear: query.get('academicYear') || undefined,
    grade: query.get('grade') || undefined,
    includeArchived: query.get('includeArchived') === 'true',
  });
}

/** Subjects for a grade, each with its learning outcomes. */
export function curriculum({ actor, query }) {
  return loadCurriculum(actor, {
    grade: query.get('grade') || undefined,
    subject: query.get('subject') || undefined,
    academicYear: query.get('academicYear') || undefined,
  });
}

/**
 * The Pravyo roster for a grade and year. CAS never creates these records.
 * With `subject`, only the students who take that subject (its sections and,
 * for an optional subject, the students the school assigned to it).
 */
export async function students({ actor, query }) {
  const grade = query.get('grade');
  const academicYear = query.get('academicYear');
  const section = query.get('section') || '';
  if (!grade || !academicYear) throw new HttpError('Choose a grade and academic year');
  const year = await loadAcademicYear(actor, academicYear);
  await assertTeacherGradeAssignment(actor, { academicYear: year.id, grade });
  const sections = await loadGradeSections(actor, grade);
  if (section && !sections.includes(section)) {
    throw new HttpError('Choose a section configured for this grade');
  }
  const subjectId = query.get('subject') || '';
  const subject = /^[a-f\d]{24}$/i.test(subjectId)
    ? await CasSubject.findOne({ _id: subjectId, school: actor.school, grade }).select('kind sections').lean()
    : null;
  const rows = await loadStudents(actor, { grade, yearStart: year.yearStart });
  return rows.filter((student) =>
    (!section || student.section === section) &&
    (!subject || studentTakesSubject(subject, student)));
}

/** The themes inside one subject, with how many outcomes each holds. */
export function themes({ actor, query }) {
  const grade = query.get('grade');
  const subject = query.get('subject');
  if (!grade || !subject) throw new HttpError('Choose a grade and subject');
  return loadThemes(actor, {
    grade, subject,
    exam: query.get('exam') || undefined,
    academicYear: query.get('academicYear') || undefined,
  });
}

/** One student's page out of their evaluation record book. */
export function sheet({ actor, query }) {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const subject = query.get('subject');
  const themeKey = query.get('theme');
  const student = query.get('student');
  const exam = query.get('exam');
  if (!academicYear || !grade || !subject || themeKey === null || !student || !exam) {
    throw new HttpError('Choose a grade, subject, student and theme');
  }
  return loadStudentSheet(actor, { academicYear, grade, subject, themeKey, student, exam });
}

/** Commit the whole filled sheet in one transaction. */
export async function saveSheetEndpoint({ actor, request }) {
  const saved = await saveSheet(actor, await jsonBody(request));
  // Persist first, then notify every authenticated CAS screen at this school
  // (school and teacher alike). The event holds invalidation metadata only;
  // readers re-fetch through their normal server-side authorization checks.
  publishRealtimeEvent(`cas-assessment:${actor.school}`, {
    type: 'CAS_ASSESSMENT_CHANGED',
    exam: saved.sheet.exam.id,
    grade: saved.sheet.grade,
    subject: saved.sheet.subject.id,
    student: saved.sheet.student.id,
  });
  return saved;
}

/** The grades, subjects and students this actor may see on Student Progress. */
export function progressOptions({ actor, query }) {
  const academicYear = query.get('academicYear');
  if (!academicYear) throw new HttpError('Choose an academic year');
  return loadProgressOptions(actor, {
    academicYear,
    grade: query.get('grade') || '',
    section: query.get('section') || '',
  });
}

/** One Pravyo student's subject progress, grouped by CAS theme. */
export function progress({ actor, query }) {
  const academicYear = query.get('academicYear');
  const grade = query.get('grade');
  const subject = query.get('subject');
  const student = query.get('student');
  if (!academicYear || !grade || !subject || !student) {
    throw new HttpError('Choose a grade, student and subject');
  }
  return loadStudentSubjectProgress(actor, { academicYear, grade, subject, student });
}
