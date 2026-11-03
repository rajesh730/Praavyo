import { z } from 'zod';
import connectDB from '@pravyo/db';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import InternalExam from '@pravyo/db/models/cas/InternalExam';
import InternalExamMark from '@pravyo/db/models/cas/InternalExamMark';
import InternalExamReport from '@pravyo/db/models/cas/InternalExamReport';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { CAS_EXAM_TERM_VALUES, examTermOf } from '@pravyo/core/casExamTerms';
import { EXAMINED_FILTER, studentTakesSubject } from '@pravyo/core/subjectScope';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';
import {
  DEFAULT_FULL_MARKS,
  DEFAULT_PASS_PERCENT,
  internalExamResult,
  subjectFullMarks,
} from '@pravyo/core/internalExamResult';
import { assert, requireSchoolAdmin } from './casAccess.js';
import { loadAcademicYear, loadGradeSections, loadSchool, loadStudents } from './casContext.js';

/**
 * Internal (school) exams: the school's own written papers for Grades 1–10.
 *
 *   - The school creates an exam per grade and sets full marks.
 *   - The school, or a subject teacher assigned on the Teachers page, enters
 *     marks; a class teacher may read the whole grade.
 *   - The school publishes: every student gets a frozen report card that
 *     parents and students read next to their CAS card.
 *
 * Nothing here reads or writes a CAS collection other than the subject
 * register (CasSubject), which is the school's one list of subjects.
 */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record identifier');
const grade = z.string().trim().min(1).max(60);
const marksValue = z.number().min(0).max(1000);
const issueDate = z.string().trim().max(10)
  .refine((value) => !value || Boolean(parseBsNumeric(value)), 'Write the issue date in B.S. as YYYY/MM/DD, e.g. 2083/06/08');
const subjectFullMarksInput = z.array(z.object({ subject: objectId, fullMarks: z.number().int().min(1).max(1000) }).strict()).max(40);

const examCreateInput = z.object({
  academicYear: objectId,
  grade,
  term: z.enum(CAS_EXAM_TERM_VALUES),
  name: z.string().trim().min(2).max(120),
  fullMarks: z.number().int().min(1).max(1000).default(DEFAULT_FULL_MARKS),
  passPercent: z.number().min(0).max(100).default(DEFAULT_PASS_PERCENT),
  subjectFullMarks: subjectFullMarksInput.default([]),
  issueDate: issueDate.default(''),
}).strict();

// Spelled out rather than derived with .partial(): Zod 4 would fill the
// create schema's defaults back in and silently reset unsent fields.
const examUpdateInput = z.object({
  id: objectId,
  term: z.enum(CAS_EXAM_TERM_VALUES).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  fullMarks: z.number().int().min(1).max(1000).optional(),
  passPercent: z.number().min(0).max(100).optional(),
  subjectFullMarks: subjectFullMarksInput.optional(),
  issueDate: issueDate.optional(),
}).strict();

const marksInput = z.object({
  exam: objectId,
  entries: z.array(z.object({
    student: objectId,
    subject: objectId,
    // null clears the mark back to "not entered".
    marks: z.union([marksValue, z.null()]),
    absent: z.boolean().default(false),
  }).strict()).min(1).max(5000),
}).strict();

let indexes = null;
function ensureIndexes() {
  indexes ||= Promise.all([InternalExam, InternalExamMark, InternalExamReport].map((model) => model.createIndexes()))
    .catch((error) => { indexes = null; throw error; });
  return indexes;
}

async function ready() {
  await connectDB();
  await ensureIndexes();
}

function serializeExam(row) {
  return {
    id: String(row._id),
    academicYear: String(row.academicYear),
    grade: row.grade,
    term: row.term,
    termTitle: examTermOf(row.term).title,
    name: row.name,
    fullMarks: row.fullMarks,
    passPercent: row.passPercent,
    subjectFullMarks: (row.subjectFullMarks || []).map((item) => ({ subject: String(item.subject), fullMarks: item.fullMarks })),
    issueDate: row.issueDate || '',
    published: Boolean(row.publishedAt),
    publishedAt: row.publishedAt || null,
  };
}

/**
 * What the actor may do in a grade. School admin: everything. Teacher: read
 * the grade if they teach in it, edit only their assigned subjects.
 */
async function gradeAccess(actor, gradeName) {
  if (actor.role === 'SCHOOL_ADMIN') return { canRead: true, editSubjects: null };
  assert(actor.role === 'TEACHER', 'Only the school and its teachers can open internal exams', 403);
  const rows = await TeacherTeachingAssignment.find({ school: actor.school, teacher: actor.id, grade: gradeName })
    .select('assignmentType subject').lean();
  return {
    canRead: rows.length > 0,
    editSubjects: new Set(rows.filter((row) => row.assignmentType === 'SUBJECT_TEACHER' && row.subject).map((row) => String(row.subject))),
  };
}

async function loadExam(actor, id) {
  assert(/^[a-f\d]{24}$/i.test(String(id || '')), 'Choose an exam');
  const exam = await InternalExam.findOne({ _id: id, school: actor.school }).lean();
  assert(exam, 'Exam not found', 404);
  return exam;
}

/** The grade's examined, active subjects, in register order. */
async function gradeSubjects(actor, gradeName) {
  return CasSubject.find({ school: actor.school, grade: gradeName, status: 'ACTIVE', ...EXAMINED_FILTER })
    .select('code titleEn titleNe sequence creditHours kind sections')
    .sort({ sequence: 1, titleEn: 1 })
    .lean();
}

/** Grades the actor can see: all of the school's for the admin, taught grades for a teacher. */
export async function listExamGrades(actor) {
  await ready();
  if (actor.role === 'SCHOOL_ADMIN') return null;
  const rows = await TeacherTeachingAssignment.find({ school: actor.school, teacher: actor.id }).select('grade').lean();
  return [...new Set(rows.map((row) => row.grade))];
}

/** A grade's exams for a year, plus its examined subjects for the full-marks editor. */
export async function listExams(actor, { academicYear, grade: gradeName }) {
  await ready();
  assert(academicYear && gradeName, 'Choose an academic year and grade');
  const year = await loadAcademicYear(actor, academicYear);
  const access = await gradeAccess(actor, gradeName);
  if (!access.canRead) return { exams: [], subjects: [] };
  const [rows, subjects] = await Promise.all([
    InternalExam.find({ school: actor.school, academicYear: year.id, grade: gradeName }).sort({ createdAt: 1 }).lean(),
    gradeSubjects(actor, gradeName),
  ]);
  return {
    exams: rows.map(serializeExam),
    subjects: subjects.map((row) => ({ id: String(row._id), code: row.code, titleEn: row.titleEn, titleNe: row.titleNe || '' })),
  };
}

async function assertSubjectsInGrade(actor, gradeName, overrides) {
  if (!overrides.length) return;
  const ids = overrides.map((row) => row.subject);
  const count = await CasSubject.countDocuments({ _id: { $in: ids }, school: actor.school, grade: gradeName });
  assert(count === new Set(ids).size, 'A subject in the full-marks list is not in this grade');
}

export async function createExam(actor, input) {
  requireSchoolAdmin(actor);
  await ready();
  const data = examCreateInput.parse(input);
  const year = await loadAcademicYear(actor, data.academicYear);
  await assertSubjectsInGrade(actor, data.grade, data.subjectFullMarks);
  const row = await InternalExam.create({ ...data, academicYear: year.id, school: actor.school, createdBy: actor.id });
  return serializeExam(row.toObject());
}

export async function updateExam(actor, input) {
  requireSchoolAdmin(actor);
  await ready();
  const { id, ...data } = examUpdateInput.parse(input);
  const exam = await loadExam(actor, id);
  assert(!exam.publishedAt, 'Unpublish the results before changing this exam', 409);
  if (data.subjectFullMarks) await assertSubjectsInGrade(actor, exam.grade, data.subjectFullMarks);
  const row = await InternalExam.findOneAndUpdate({ _id: exam._id, school: actor.school }, { $set: data }, { new: true, runValidators: true }).lean();
  return serializeExam(row);
}

export async function deleteExam(actor, { id }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, id);
  assert(!exam.publishedAt, 'Unpublish the results before deleting this exam', 409);
  await InternalExamMark.deleteMany({ school: actor.school, exam: exam._id });
  await InternalExam.deleteOne({ _id: exam._id, school: actor.school });
  return { id: String(exam._id) };
}

/**
 * Everything the mark-entry grid and the results screen need: subjects with
 * their full marks, students with the subjects each takes, the marks, and
 * each student's computed result.
 */
async function buildSheet(actor, exam, { section = '' } = {}) {
  const year = await loadAcademicYear(actor, String(exam.academicYear));
  const [subjectRows, roster, markRows] = await Promise.all([
    gradeSubjects(actor, exam.grade),
    loadStudents(actor, { grade: exam.grade, yearStart: year.yearStart, history: Boolean(exam.publishedAt) }),
    InternalExamMark.find({ school: actor.school, exam: exam._id }).select('student subject marks absent').lean(),
  ]);

  const subjects = subjectRows.map((row) => ({
    id: String(row._id),
    code: row.code,
    titleEn: row.titleEn,
    titleNe: row.titleNe || '',
    creditHours: Number.isFinite(row.creditHours) ? row.creditHours : null,
    fullMarks: subjectFullMarks(exam, row._id),
    raw: row,
  }));

  const marks = {};
  for (const row of markRows) {
    const student = String(row.student);
    marks[student] ||= {};
    marks[student][String(row.subject)] = { marks: row.marks, absent: Boolean(row.absent) };
  }

  const students = roster
    .filter((student) => !section || student.section === section)
    .map((student) => {
      const takes = subjects.filter((subject) => studentTakesSubject(subject.raw, student));
      return {
        ...student,
        takes: takes.map((subject) => subject.id),
        result: internalExamResult({ subjects: takes, marks: marks[student.id] || {}, passPercent: exam.passPercent }),
      };
    });

  return { year, subjects: subjects.map(({ raw, ...subject }) => subject), students, marks };
}

export async function loadSheet(actor, { exam: examId, section = '' }) {
  await ready();
  const exam = await loadExam(actor, examId);
  const access = await gradeAccess(actor, exam.grade);
  assert(access.canRead, 'Your school has not assigned you to this grade', 403);
  const sections = await loadGradeSections(actor, exam.grade);
  assert(!section || sections.includes(section), 'Choose a section configured for this grade');
  const sheet = await buildSheet(actor, exam, { section });

  const subjects = sheet.subjects.map((subject) => ({
    ...subject,
    canEdit: !exam.publishedAt && (access.editSubjects === null || access.editSubjects.has(subject.id)),
    // How many of the students taking this subject have a mark or absence.
    entered: sheet.students.filter((student) => student.takes.includes(subject.id) && sheet.marks[student.id]?.[subject.id]).length,
    expected: sheet.students.filter((student) => student.takes.includes(subject.id)).length,
  }));

  return {
    exam: serializeExam(exam),
    sections,
    subjects,
    students: sheet.students,
    marks: Object.fromEntries(sheet.students.map((student) => [student.id, sheet.marks[student.id] || {}])),
    canPublish: actor.role === 'SCHOOL_ADMIN',
  };
}

export async function saveMarks(actor, input) {
  await ready();
  const data = marksInput.parse(input);
  const exam = await loadExam(actor, data.exam);
  assert(!exam.publishedAt, 'Results are published. Unpublish them to change marks.', 409);
  const access = await gradeAccess(actor, exam.grade);
  assert(access.canRead, 'Your school has not assigned you to this grade', 403);

  const sheet = await buildSheet(actor, exam);
  const students = new Map(sheet.students.map((student) => [student.id, student]));
  const subjects = new Map(sheet.subjects.map((subject) => [subject.id, subject]));

  const operations = data.entries.map((entry) => {
    const student = students.get(entry.student);
    const subject = subjects.get(entry.subject);
    assert(student, 'A student in this list is not enrolled in this grade');
    assert(subject, 'A subject in this list is not examined in this grade');
    assert(student.takes.includes(subject.id), `${student.name} does not take ${subject.titleEn}`);
    assert(
      access.editSubjects === null || access.editSubjects.has(subject.id),
      `You are not assigned to enter ${subject.titleEn} marks`,
      403,
    );
    if (entry.marks !== null) {
      assert(entry.marks <= subject.fullMarks, `${subject.titleEn} marks cannot be more than ${subject.fullMarks}`);
      assert(Math.abs(Math.round(entry.marks * 100) - entry.marks * 100) < 1e-6, 'Marks can have at most two decimal places');
    }

    const filter = { exam: exam._id, student: entry.student, subject: entry.subject };
    if (entry.marks === null && !entry.absent) return { deleteOne: { filter } };
    return {
      updateOne: {
        filter,
        update: {
          $set: {
            school: actor.school,
            marks: entry.absent ? null : entry.marks,
            absent: entry.absent,
            enteredBy: actor.id,
            enteredByRole: actor.role,
          },
        },
        upsert: true,
      },
    };
  });

  await InternalExamMark.bulkWrite(operations, { ordered: true });
  return { saved: operations.length };
}

/** The card a parent reads, frozen at publication. */
function snapshotFor({ school, exam, year, student }) {
  const { result } = student;
  return {
    kind: 'INTERNAL',
    school: {
      name: school.name,
      address: school.address,
      schoolCode: school.schoolCode,
      iemisNumber: school.iemisNumber,
    },
    academicYear: { id: year.id, label: year.label, yearStart: year.yearStart },
    examTitle: exam.name,
    examTerm: exam.term,
    issueDate: exam.issueDate || '',
    passPercent: exam.passPercent,
    student: {
      id: student.id,
      name: student.name,
      grade: exam.grade,
      section: student.section,
      rollNumber: student.rollNumber,
      registrationNumber: student.registrationNumber,
      iemisNumber: student.iemisNumber || '',
    },
    subjects: result.subjects,
    fullMarks: result.fullMarks,
    obtained: result.obtained,
    percent: result.percent,
    gpa: result.gpa,
    overallGrade: result.overallGrade,
    passed: result.passed,
  };
}

/**
 * Report cards for an exam: the published ones when published, otherwise a
 * live preview built the same way publishing would build them.
 */
export async function loadCards(actor, { exam: examId, section = '' }) {
  await ready();
  requireSchoolAdmin(actor);
  const exam = await loadExam(actor, examId);
  if (exam.publishedAt) {
    const rows = await InternalExamReport.find({ school: actor.school, exam: exam._id }).lean();
    return rows
      .filter((row) => !section || row.snapshot?.student?.section === section)
      .map((row) => ({ _id: String(row._id), kind: 'INTERNAL', school: String(row.school), snapshot: row.snapshot, publishedAt: row.publishedAt }));
  }
  const [school, sheet] = await Promise.all([loadSchool(actor), buildSheet(actor, exam, { section })]);
  return sheet.students.map((student) => ({
    _id: student.id,
    kind: 'INTERNAL',
    school: actor.school,
    preview: true,
    snapshot: snapshotFor({ school, exam, year: sheet.year, student }),
  }));
}

export async function publishExam(actor, { exam: examId }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  assert(!exam.publishedAt, 'These results are already published', 409);
  const [school, sheet] = await Promise.all([loadSchool(actor), buildSheet(actor, exam)]);
  assert(sheet.students.length, 'No students are enrolled in this grade');
  const missing = sheet.students.reduce((sum, student) => sum + student.result.subjects.filter((line) => !line.entered).length, 0);
  assert(!missing, `${missing} mark${missing === 1 ? ' is' : 's are'} still missing. Enter them, or mark the student absent, before publishing.`, 409);

  const now = new Date();
  await InternalExamReport.deleteMany({ school: actor.school, exam: exam._id });
  await InternalExamReport.insertMany(sheet.students.map((student) => ({
    school: actor.school,
    academicYear: sheet.year.id,
    exam: exam._id,
    grade: exam.grade,
    student: student.id,
    examTerm: exam.term,
    snapshot: snapshotFor({ school, exam, year: sheet.year, student }),
    publishedBy: actor.id,
    publishedAt: now,
  })));
  await InternalExam.updateOne({ _id: exam._id, school: actor.school }, { $set: { publishedAt: now, publishedBy: actor.id } });
  return { published: sheet.students.length };
}

export async function unpublishExam(actor, { exam: examId }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  const { deletedCount } = await InternalExamReport.deleteMany({ school: actor.school, exam: exam._id });
  await InternalExam.updateOne({ _id: exam._id, school: actor.school }, { $set: { publishedAt: null, publishedBy: null } });
  return { unpublished: deletedCount };
}
