import connectDB from '@pravyo/db';
import AcademicYear from '@pravyo/db/models/AcademicYear';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { EXAMINED_FILTER, studentTakesSubject } from '@pravyo/core/subjectScope';
import { assert, sameId } from './casAccess.js';
import { loadAcademicYear, loadSchool, loadStudents } from './casContext.js';
import { usesResultSheet } from './casResultSheet.js';

/**
 * Who may see a student's CAS progress, and what of it.
 *
 *   - School admin: every Grades 1–5 student and subject.
 *   - Teacher: only grades they teach. A CLASS_TEACHER sees every subject of
 *     that grade; a subject teacher (Teachers page SUBJECT_TEACHER, or a CAS
 *     exam assignment) sees only their own subjects.
 *   - Parent: only their own child, through `loadChildProgress` (the parent
 *     route checks the guardian link first).
 */

/** null for a school admin; otherwise Map grade → { all, subjects:Set }. */
export async function progressScope(actor, { academicYear } = {}) {
  if (actor.role === 'SCHOOL_ADMIN') return null;
  assert(actor.role === 'TEACHER', 'Only the school and its teachers can open student progress', 403);
  const [teaching, examRows] = await Promise.all([
    TeacherTeachingAssignment.find({ school: actor.school, teacher: actor.id }).select('assignmentType grade subject').lean(),
    academicYear
      ? CasExamTeacherAssignment.find({ school: actor.school, academicYear, teacher: actor.id }).select('grade subject').lean()
      : [],
  ]);
  const scope = new Map();
  const entry = (grade) => {
    if (!scope.has(grade)) scope.set(grade, { all: false, subjects: new Set() });
    return scope.get(grade);
  };
  for (const row of teaching) {
    if (row.assignmentType === 'CLASS_TEACHER') entry(row.grade).all = true;
    else if (row.subject) entry(row.grade).subjects.add(String(row.subject));
  }
  for (const row of examRows) entry(row.grade).subjects.add(String(row.subject));
  return scope;
}

function allowsSubject(scope, grade, subject) {
  if (scope === null) return true;
  const entry = scope.get(grade);
  return Boolean(entry && (entry.all || entry.subjects.has(String(subject))));
}

/** Throw unless the actor may see this grade + subject. */
export async function assertProgressAccess(actor, { academicYear, grade, subject }) {
  const scope = await progressScope(actor, { academicYear });
  assert(allowsSubject(scope, grade, subject), 'You can only see progress for the students and subjects you teach', 403);
}

/** Grades, subjects and students the Student Progress screen may offer. */
export async function loadProgressOptions(actor, { academicYear, grade = '', section = '' }) {
  await connectDB();
  const year = await loadAcademicYear(actor, academicYear);
  const [school, scope] = await Promise.all([loadSchool(actor), progressScope(actor, { academicYear: year.id })]);
  const grades = (school.grades || [])
    .filter(usesResultSheet)
    .filter((item) => scope === null || scope.has(item));
  const chosen = grades.includes(grade) ? grade : grades[0] || '';
  if (!chosen) return { grades, grade: '', subjects: [], students: [] };

  const [subjectRows, roster] = await Promise.all([
    CasSubject.find({ school: actor.school, grade: chosen, status: 'ACTIVE', ...EXAMINED_FILTER })
      .select('code titleEn titleNe sequence').sort({ sequence: 1, titleEn: 1 }).lean(),
    loadStudents(actor, { grade: chosen, yearStart: year.yearStart }),
  ]);
  return {
    grades,
    grade: chosen,
    subjects: subjectRows
      .filter((row) => allowsSubject(scope, chosen, row._id))
      .map((row) => ({ id: String(row._id), code: row.code, titleEn: row.titleEn, titleNe: row.titleNe || '' })),
    students: roster.filter((student) => !section || student.section === section),
  };
}

/**
 * A parent's view of their child's progress this year: every subject the
 * child takes, each theme's achievement and the level per learning outcome.
 * Read-only, and only for Grades 1–5 (CAS).
 *
 * `buildSubjectProgress` is casSheetService's builder, passed in to avoid a
 * circular import.
 */
export async function loadChildProgress(student, buildSubjectProgress) {
  await connectDB();
  const school = String(student.school || '');
  const enrollment = [...(student.enrollments || [])]
    .filter((entry) => sameId(entry.school, school))
    .sort((a, b) => (b.academicYearStart || 0) - (a.academicYearStart || 0))[0];
  if (!school || !enrollment) return { available: false, reason: 'NOT_ENROLLED' };
  if (!usesResultSheet(enrollment.grade)) return { available: false, reason: 'NOT_CAS_GRADE', grade: enrollment.grade };

  const year = await AcademicYear.findOne({ school, yearStart: enrollment.academicYearStart }).select('_id').lean();
  if (!year) return { available: false, reason: 'NO_YEAR', grade: enrollment.grade };

  const actor = { school, role: 'PARENT' };
  const subjectRows = await CasSubject.find({ school, grade: enrollment.grade, status: 'ACTIVE', ...EXAMINED_FILTER })
    .select('kind sections sequence titleEn').sort({ sequence: 1, titleEn: 1 }).lean();
  const taken = subjectRows.filter((row) => studentTakesSubject(row, {
    section: enrollment.section || student.section,
    subjectChoices: student.subjectChoices,
  }));

  const subjects = [];
  for (const row of taken) {
    try {
      const progress = await buildSubjectProgress(actor, {
        academicYear: String(year._id), grade: enrollment.grade, subject: String(row._id), student: String(student._id),
      });
      subjects.push({
        subject: progress.subject,
        totals: progress.totals,
        themes: progress.themes.map((theme) => ({
          key: theme.key,
          titleEn: theme.titleEn,
          titleNe: theme.titleNe,
          outcomeCount: theme.outcomeCount,
          assessedCount: theme.assessedCount,
          totals: theme.totals,
          // Only the outcome and the level reached; nothing internal.
          outcomes: theme.rows.map((outcome) => ({
            code: outcome.code, titleEn: outcome.titleEn, titleNe: outcome.titleNe, level: outcome.acceptedLevel,
          })),
        })),
      });
    } catch {
      // A subject the child cannot be shown (e.g. removed) is left out.
    }
  }
  return { available: true, grade: enrollment.grade, yearStart: enrollment.academicYearStart, subjects };
}
