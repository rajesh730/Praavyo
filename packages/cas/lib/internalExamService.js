import { z } from 'zod';
import connectDB from '@pravyo/db';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import InternalExam from '@pravyo/db/models/cas/InternalExam';
import InternalExamMark from '@pravyo/db/models/cas/InternalExamMark';
import InternalExamReport from '@pravyo/db/models/cas/InternalExamReport';
import InternalExamRecord from '@pravyo/db/models/cas/InternalExamRecord';
import InternalMarkScheme from '@pravyo/db/models/cas/InternalMarkScheme';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { CAS_EXAM_TERM_VALUES, examTermOf } from '@pravyo/core/casExamTerms';
import { EXAMINED_FILTER, studentTakesSubject } from '@pravyo/core/subjectScope';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';
import { ECA_FIELDS, normalizeAttendance, normalizeExtraActivities } from '@pravyo/core/casSupplementary';
import {
  DEFAULT_FULL_MARKS,
  DEFAULT_PASS_PERCENT,
  internalExamResult,
  subjectFullMarks,
  subjectLine,
} from '@pravyo/core/internalExamResult';
import {
  DIRECT_INTERNAL_KEY,
  FIELD_ID_PATTERN,
  MAX_FIELDS,
  cleanStructure,
  entryColumns,
  entryConflicts,
  entryFromRow,
  legacyStructure,
  structureForSubject,
  structureProblems,
  totalFullMarks,
} from '@pravyo/core/internalMarkScheme';
import { assert, requireSchoolAdmin } from './casAccess.js';
import { loadAcademicYear, loadGradeSections, loadSchool, loadStudents } from './casContext.js';

/**
 * Internal (school) exams: the school's own written papers for Grades 1–10.
 *
 *   - The school creates an exam per grade and sets full marks.
 *   - The school, or a subject teacher assigned on the Teachers page, enters
 *     marks; a class teacher may read the whole grade.
 *   - The school records each student's attendance and extra activities per
 *     exam (InternalExamRecord). CAS does not collect these.
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

// Only the keys sent change; everything else on the row is kept, so two
// people typing different cells of the same student never overwrite each
// other. null clears a value back to "not entered" (never 0).
const optionalMark = z.union([marksValue, z.null()]).optional();
const internalKey = z.string().refine((key) => key === DIRECT_INTERNAL_KEY || FIELD_ID_PATTERN.test(key), 'Unknown internal field');
const marksInput = z.object({
  exam: objectId,
  entries: z.array(z.object({
    student: objectId,
    subject: objectId,
    // `marks` is the one-number cell of a subject with no internal part (= theory).
    marks: optionalMark,
    theory: optionalMark,
    internal: z.record(internalKey, z.union([marksValue, z.null()])).optional(),
    absent: z.boolean().optional(),
  }).strict()).min(1).max(5000),
}).strict();

const structureMarks = z.number().min(0).max(1000);
const structureInput = z.object({
  totalFullMarks: z.number().min(0).max(1000).optional(),
  theoryFullMarks: structureMarks,
  internalFullMarks: structureMarks,
  fields: z.array(z.object({
    id: z.string().regex(FIELD_ID_PATTERN, 'Invalid field id'),
    name: z.string().trim().min(1, 'Every internal field needs a name').max(60),
    fullMarks: z.number().min(0).max(1000),
  }).strict()).max(MAX_FIELDS).default([]),
}).strict();
const schemeInput = z.object({
  grade,
  revision: z.number().int().min(0),
  passEachPart: z.boolean().default(true),
  default: structureInput,
  subjects: z.array(z.object({ subject: objectId, structure: structureInput }).strict()).max(60).default([]),
}).strict();

const dayCountInput = z.union([z.number().int().min(0).max(400), z.null()]);
const recordsInput = z.object({
  exam: objectId,
  section: z.string().trim().max(60).optional(),
  rows: z.array(z.object({
    student: objectId,
    revision: z.number().int().min(0),
    attendance: z.object({
      workingDays: dayCountInput.optional(),
      presentDays: dayCountInput.optional(),
      absentDays: dayCountInput.optional(),
    }).strict(),
    extraActivities: z.object(Object.fromEntries(
      ECA_FIELDS.map((field) => [field.key, z.string().trim().max(20).optional()]),
    )).strict(),
  }).strict()).min(1).max(1000),
}).strict();

let indexes = null;
function ensureIndexes() {
  indexes ||= Promise.all([InternalExam, InternalExamMark, InternalExamReport, InternalExamRecord, InternalMarkScheme].map((model) => model.createIndexes()))
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
    // Keeps the marks structure it was published with (see InternalExam.markScheme).
    pinned: Boolean(row.markScheme),
  };
}

/** A grade's marks structure (the same for every exam of the grade), or null. */
async function loadScheme(actor, gradeName) {
  return InternalMarkScheme.findOne({ school: actor.school, grade: gradeName })
    .collation({ locale: 'en', strength: 2 })
    .lean();
}

/**
 * How one exam reads its subjects' marks structures:
 *   - pinned (published once): the structure saved on the exam;
 *   - published before structures existed: one theory mark, as it was;
 *   - otherwise: the grade's current structure.
 */
function examStructures(exam, scheme) {
  if (exam.markScheme) {
    const pinned = new Map((exam.markScheme.subjects || []).map((row) => [String(row.subject), row.structure]));
    return {
      passEachPart: exam.markScheme.passEachPart !== false,
      structureOf: (subjectId) => pinned.get(String(subjectId)) || legacyStructure(subjectFullMarks(exam, subjectId)),
    };
  }
  if (exam.publishedAt || !scheme) {
    return { passEachPart: scheme?.passEachPart !== false, structureOf: (subjectId) => legacyStructure(subjectFullMarks(exam, subjectId)) };
  }
  return {
    passEachPart: scheme.passEachPart !== false,
    structureOf: (subjectId) => structureForSubject(scheme, subjectId, subjectFullMarks(exam, subjectId)),
  };
}

function serializeStructure(structure) {
  const clean = cleanStructure(structure);
  return { ...clean, totalFullMarks: totalFullMarks(clean) };
}

function serializeScheme(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    grade: row.grade,
    revision: row.revision || 0,
    passEachPart: row.passEachPart !== false,
    default: serializeStructure(row.default),
    subjects: (row.subjects || []).map((item) => ({ subject: String(item.subject), structure: serializeStructure(item.structure) })),
    updatedAt: row.updatedAt || null,
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
    InternalExam.find({
      school: actor.school, academicYear: year.id, grade: gradeName,
      // A teacher works only on exams still open: published results are
      // locked and leave their list (the school unpublishes to reopen one).
      ...(actor.role === 'TEACHER' ? { publishedAt: null } : {}),
    }).sort({ createdAt: 1 }).lean(),
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
  await InternalExamRecord.deleteMany({ school: actor.school, exam: exam._id });
  await InternalExam.deleteOne({ _id: exam._id, school: actor.school });
  return { id: String(exam._id) };
}

/**
 * Everything the mark-entry grid and the results screen need: subjects with
 * their marks structure, students with the subjects each takes, the marks,
 * and each student's computed result.
 */
async function buildSheet(actor, exam, { section = '' } = {}) {
  const year = await loadAcademicYear(actor, String(exam.academicYear));
  const [subjectRows, roster, markRows, scheme] = await Promise.all([
    gradeSubjects(actor, exam.grade),
    loadStudents(actor, { grade: exam.grade, yearStart: year.yearStart, history: Boolean(exam.publishedAt) }),
    InternalExamMark.find({ school: actor.school, exam: exam._id }).select('student subject marks theory internal absent').lean(),
    loadScheme(actor, exam.grade),
  ]);
  const structures = examStructures(exam, scheme);

  const subjects = subjectRows.map((row) => {
    const structure = cleanStructure(structures.structureOf(row._id));
    return {
      id: String(row._id),
      code: row.code,
      titleEn: row.titleEn,
      titleNe: row.titleNe || '',
      creditHours: Number.isFinite(row.creditHours) ? row.creditHours : null,
      fullMarks: totalFullMarks(structure),
      structure,
      columns: entryColumns(structure),
      raw: row,
    };
  });

  const marks = {};
  for (const row of markRows) {
    const student = String(row.student);
    marks[student] ||= {};
    marks[student][String(row.subject)] = entryFromRow(row);
  }

  const students = roster
    .filter((student) => !section || student.section === section)
    .map((student) => {
      const takes = subjects.filter((subject) => studentTakesSubject(subject.raw, student));
      return {
        ...student,
        takes: takes.map((subject) => subject.id),
        result: internalExamResult({
          subjects: takes, marks: marks[student.id] || {}, passPercent: exam.passPercent, passEachPart: structures.passEachPart,
        }),
      };
    });

  return { year, subjects: subjects.map(({ raw, ...subject }) => subject), students, marks, passEachPart: structures.passEachPart };
}

export async function loadSheet(actor, { exam: examId, section = '' }) {
  await ready();
  const exam = await loadExam(actor, examId);
  const access = await gradeAccess(actor, exam.grade);
  assert(access.canRead, 'Your school has not assigned you to this grade', 403);
  const sections = await loadGradeSections(actor, exam.grade);
  assert(!section || sections.includes(section), 'Choose a section configured for this grade');
  const sheet = await buildSheet(actor, exam, { section });

  const subjects = sheet.subjects.map((subject) => {
    const lines = sheet.students
      .filter((student) => student.takes.includes(subject.id))
      .map((student) => student.result.subjects.find((line) => line.id === subject.id));
    return {
      ...subject,
      canEdit: !exam.publishedAt && (access.editSubjects === null || access.editSubjects.has(subject.id)),
      // Students taking this subject whose marks are complete (or absent).
      entered: lines.filter((line) => line?.entered).length,
      partial: lines.filter((line) => line?.partial).length,
      expected: lines.length,
    };
  });

  return {
    exam: serializeExam(exam),
    sections,
    subjects,
    passEachPart: sheet.passEachPart,
    students: sheet.students,
    marks: Object.fromEntries(sheet.students.map((student) => [student.id, sheet.marks[student.id] || {}])),
    canPublish: actor.role === 'SCHOOL_ADMIN',
  };
}

const MAX_REVISIONS = 20;
const sameEntry = (a, b) => (a?.theory ?? null) === (b?.theory ?? null)
  && Boolean(a?.absent) === Boolean(b?.absent)
  && JSON.stringify(Object.entries(a?.internal || {}).sort()) === JSON.stringify(Object.entries(b?.internal || {}).sort());
const hasTwoDecimals = (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/**
 * Save typed marks. Each entry changes only the parts it sends (theory, an
 * internal field, absent); the server checks every value against the
 * subject's structure and works out the totals itself.
 */
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
  const existingRows = await InternalExamMark.find({
    school: actor.school,
    exam: exam._id,
    student: { $in: [...new Set(data.entries.map((entry) => entry.student))] },
    subject: { $in: [...new Set(data.entries.map((entry) => entry.subject))] },
  }).select('student subject marks theory internal absent').lean();
  const existing = new Map(existingRows.map((row) => [`${row.student}:${row.subject}`, row]));

  const operations = [];
  const merged = new Map();
  for (const entry of data.entries) {
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

    const key = `${entry.student}:${entry.subject}`;
    const before = merged.get(key) || entryFromRow(existing.get(key)) || { theory: null, internal: {}, absent: false };
    const next = { theory: before.theory, internal: { ...before.internal }, absent: before.absent };
    const columns = new Map(subject.columns.map((column) => [column.key, column]));
    const check = (column, value) => {
      if (value === null) return;
      assert(column, `${subject.titleEn} has no such mark column. Reload the page.`);
      assert(value <= column.fullMarks, `${student.name}: ${subject.titleEn} ${column.label} cannot be more than ${column.fullMarks}`);
      assert(hasTwoDecimals(value), `${student.name}: ${subject.titleEn} ${column.label} can have at most two decimal places`);
    };

    for (const theory of [entry.marks, entry.theory]) {
      if (theory === undefined) continue;
      check(columns.get('TH'), theory);
      next.theory = theory;
    }
    for (const [field, value] of Object.entries(entry.internal || {})) {
      check(columns.get(field), value);
      if (value === null) delete next.internal[field];
      else next.internal[field] = value;
    }
    if (entry.absent !== undefined) next.absent = entry.absent;
    merged.set(key, next);
  }

  for (const [key, next] of merged) {
    const [studentId, subjectId] = key.split(':');
    const row = existing.get(key);
    const before = entryFromRow(row);
    if (sameEntry(before, next) && !(row && row.marks !== undefined && row.marks !== null)) continue;
    const filter = { exam: exam._id, student: studentId, subject: subjectId };
    if (next.theory === null && !Object.keys(next.internal).length && !next.absent) {
      if (row) operations.push({ deleteOne: { filter } });
      continue;
    }
    const line = subjectLine(subjects.get(subjectId), next, exam.passPercent, { passEachPart: sheet.passEachPart });
    operations.push({
      updateOne: {
        filter,
        update: {
          $set: {
            school: actor.school,
            theory: next.theory,
            internal: next.internal,
            total: line.entered && !line.absent ? line.obtained : null,
            absent: next.absent,
            enteredBy: actor.id,
            enteredByRole: actor.role,
          },
          // Old single-number rows move into `theory`.
          $unset: { marks: '' },
          ...(row ? {
            $push: {
              revisions: {
                $each: [{ at: new Date(), by: row.enteredBy || null, byRole: row.enteredByRole || '', theory: before.theory, internal: before.internal, absent: before.absent }],
                $slice: -MAX_REVISIONS,
              },
            },
          } : {}),
        },
        upsert: true,
      },
    });
  }

  if (operations.length) await InternalExamMark.bulkWrite(operations, { ordered: true });
  return { saved: operations.length };
}

/** Marks in unpinned, unpublished exams of a grade that a new structure would no longer fit. */
async function schemeConflicts(actor, gradeName, nextScheme, { examIds } = {}) {
  const exams = await InternalExam.find({
    school: actor.school, grade: gradeName, publishedAt: null,
    ...(examIds ? { _id: { $in: examIds } } : { markScheme: null }),
  }).select('name fullMarks subjectFullMarks').lean();
  if (!exams.length) return [];
  const [rows, subjectRows] = await Promise.all([
    InternalExamMark.find({ school: actor.school, exam: { $in: exams.map((exam) => exam._id) } })
      .select('exam subject marks theory internal absent').lean(),
    CasSubject.find({ school: actor.school, grade: gradeName }).select('titleEn').lean(),
  ]);
  const examById = new Map(exams.map((exam) => [String(exam._id), exam]));
  const subjectTitle = new Map(subjectRows.map((row) => [String(row._id), row.titleEn]));
  const problems = new Map();
  for (const row of rows) {
    const exam = examById.get(String(row.exam));
    const structure = structureForSubject(nextScheme, row.subject, subjectFullMarks(exam, row.subject));
    for (const reason of entryConflicts(structure, entryFromRow(row))) {
      const key = `${exam.name} · ${subjectTitle.get(String(row.subject)) || 'a subject'}: ${reason}`;
      problems.set(key, (problems.get(key) || 0) + 1);
    }
  }
  return [...problems].map(([text, count]) => `${text} (${count} student${count === 1 ? '' : 's'})`);
}

/** The grade's marks structure for Manage Exams, with its subjects. School admin only. */
export async function getScheme(actor, { grade: gradeName }) {
  requireSchoolAdmin(actor);
  await ready();
  assert(gradeName, 'Choose a grade');
  const [scheme, subjects] = await Promise.all([loadScheme(actor, gradeName), gradeSubjects(actor, gradeName)]);
  return {
    grade: gradeName,
    scheme: serializeScheme(scheme),
    subjects: subjects.map((row) => ({ id: String(row._id), code: row.code, titleEn: row.titleEn, titleNe: row.titleNe || '' })),
  };
}

/**
 * Save the grade's marks structure. It applies at once to every exam of the
 * grade that has not been published; published exams keep theirs. Refused
 * while marks already entered would no longer fit (a removed field, or full
 * marks lowered below a typed mark).
 */
export async function saveScheme(actor, input) {
  requireSchoolAdmin(actor);
  await ready();
  const data = schemeInput.parse(input);

  const problems = [];
  const label = (name, list) => list.map((text) => `${name}: ${text}`);
  problems.push(...label('Default', structureProblems(data.default, { totalFullMarks: data.default.totalFullMarks })));
  const subjectIds = data.subjects.map((row) => row.subject);
  assert(new Set(subjectIds).size === subjectIds.length, 'A subject is listed twice');
  const subjectRows = subjectIds.length
    ? await CasSubject.find({ _id: { $in: subjectIds }, school: actor.school, grade: data.grade }).select('titleEn').lean()
    : [];
  assert(subjectRows.length === subjectIds.length, 'A subject in this structure is not in this grade');
  const titles = new Map(subjectRows.map((row) => [String(row._id), row.titleEn]));
  for (const row of data.subjects) {
    problems.push(...label(titles.get(row.subject), structureProblems(row.structure, { totalFullMarks: row.structure.totalFullMarks })));
  }
  assert(!problems.length, problems.join(' '));

  const next = {
    passEachPart: data.passEachPart,
    default: cleanStructure(data.default),
    subjects: data.subjects.map((row) => ({ subject: row.subject, structure: cleanStructure(row.structure) })),
  };
  const conflicts = await schemeConflicts(actor, data.grade, next);
  assert(
    !conflicts.length,
    `Marks already entered would not fit this structure. Correct or clear them first, or keep the old full marks: ${conflicts.slice(0, 6).join('; ')}${conflicts.length > 6 ? '; …' : ''}`,
    409,
  );

  const current = await loadScheme(actor, data.grade);
  assert((current?.revision || 0) === data.revision, 'Someone else changed this marks structure. Reload before saving.', 409);
  if (current) {
    const saved = await InternalMarkScheme.findOneAndUpdate(
      { _id: current._id, school: actor.school, revision: current.revision || 0 },
      {
        $set: { ...next, updatedBy: actor.id },
        $inc: { revision: 1 },
        $push: {
          history: {
            $each: [{ revision: current.revision || 0, savedAt: current.updatedAt, savedBy: current.updatedBy || null, default: current.default, subjects: current.subjects, passEachPart: current.passEachPart !== false }],
            $slice: -MAX_REVISIONS,
          },
        },
      },
      { new: true, runValidators: true },
    ).lean();
    assert(saved, 'Someone else changed this marks structure. Reload before saving.', 409);
  } else {
    try {
      await InternalMarkScheme.create({ ...next, school: actor.school, grade: data.grade, revision: 1, updatedBy: actor.id });
    } catch (error) {
      assert(error?.code !== 11000, 'Someone else just saved this marks structure. Reload before saving.', 409);
      throw error;
    }
  }
  return getScheme(actor, { grade: data.grade });
}

/**
 * A once-published exam keeps the structure it was published with. This
 * switches an unpublished one back to the grade's current structure, after
 * checking its marks fit.
 */
export async function useCurrentScheme(actor, { exam: examId }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  assert(!exam.publishedAt, 'Unpublish the results before changing the marks structure', 409);
  if (!exam.markScheme) return serializeExam(exam);
  const scheme = await loadScheme(actor, exam.grade);
  const conflicts = await schemeConflicts(actor, exam.grade, scheme, { examIds: [exam._id] });
  assert(!conflicts.length, `Marks already entered would not fit the current structure: ${conflicts.slice(0, 6).join('; ')}`, 409);
  const row = await InternalExam.findOneAndUpdate({ _id: exam._id, school: actor.school, publishedAt: null }, { $set: { markScheme: null } }, { new: true }).lean();
  assert(row, 'The exam changed while saving. Reload and try again.', 409);
  return serializeExam(row);
}

/** Each student's attendance and extra activities for an exam, by student id. */
async function recordsFor(actor, exam) {
  const rows = await InternalExamRecord.find({ school: actor.school, exam: exam._id })
    .select('student attendance extraActivities revision')
    .lean();
  return new Map(rows.map((row) => [String(row.student), row]));
}

/** The card a parent reads, frozen at publication. */
function snapshotFor({ school, exam, year, student, record }) {
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
    // Each line carries TH and INT (marks, grade, grade point, field marks).
    subjects: result.subjects,
    split: result.split,
    passEachPart: result.passEachPart,
    fullMarks: result.fullMarks,
    obtained: result.obtained,
    percent: result.percent,
    gpa: result.gpa,
    overallGrade: result.overallGrade,
    passed: result.passed,
    attendance: normalizeAttendance(record?.attendance),
    extraActivities: normalizeExtraActivities(record?.extraActivities),
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
  const [school, sheet, records] = await Promise.all([
    loadSchool(actor),
    buildSheet(actor, exam, { section }),
    recordsFor(actor, exam),
  ]);
  return sheet.students.map((student) => ({
    _id: student.id,
    kind: 'INTERNAL',
    school: actor.school,
    preview: true,
    snapshot: snapshotFor({ school, exam, year: sheet.year, student, record: records.get(student.id) }),
  }));
}

export async function publishExam(actor, { exam: examId }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  assert(!exam.publishedAt, 'These results are already published', 409);
  const [school, sheet, records] = await Promise.all([loadSchool(actor), buildSheet(actor, exam), recordsFor(actor, exam)]);
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
    snapshot: snapshotFor({ school, exam, year: sheet.year, student, record: records.get(student.id) }),
    publishedBy: actor.id,
    publishedAt: now,
  })));
  await InternalExam.updateOne({ _id: exam._id, school: actor.school }, {
    $set: {
      publishedAt: now,
      publishedBy: actor.id,
      // Freeze the structure these results used: later edits to the grade's
      // structure must not change them, even after an unpublish.
      markScheme: { passEachPart: sheet.passEachPart, subjects: sheet.subjects.map((subject) => ({ subject: subject.id, structure: subject.structure })) },
    },
  });
  return { published: sheet.students.length };
}

export async function unpublishExam(actor, { exam: examId }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  const { deletedCount } = await InternalExamReport.deleteMany({ school: actor.school, exam: exam._id });
  // Published before structures existed: keep reading it as one theory mark.
  const pin = exam.markScheme || !exam.publishedAt ? {} : {
    markScheme: {
      passEachPart: true,
      subjects: (await gradeSubjects(actor, exam.grade)).map((row) => ({ subject: row._id, structure: legacyStructure(subjectFullMarks(exam, row._id)) })),
    },
  };
  await InternalExam.updateOne({ _id: exam._id, school: actor.school }, { $set: { publishedAt: null, publishedBy: null, ...pin } });
  return { unpublished: deletedCount };
}

/**
 * Attendance and extra activities for an internal exam: one row per student
 * on the grade's roster, in the shape the Attendance & Activities screen
 * edits. School admin only, like publishing. Locked while published.
 */
async function buildRecordTable(actor, exam, { section = '' } = {}) {
  const year = await loadAcademicYear(actor, String(exam.academicYear));
  const [roster, records] = await Promise.all([
    loadStudents(actor, { grade: exam.grade, yearStart: year.yearStart, history: Boolean(exam.publishedAt) }),
    recordsFor(actor, exam),
  ]);
  const locked = Boolean(exam.publishedAt);
  return {
    year,
    roster,
    records,
    table: {
      exam: { id: String(exam._id), name: exam.name, published: locked },
      grade: exam.grade,
      section,
      canRecord: actor.role === 'SCHOOL_ADMIN',
      students: roster
        .filter((student) => !section || student.section === section)
        .map((student) => serializeRecordRow(student, records.get(student.id), locked)),
    },
  };
}

function serializeRecordRow(student, record, locked) {
  return {
    student: { id: student.id, name: student.name, rollNumber: student.rollNumber || '', section: student.section || '' },
    attendance: normalizeAttendance(record?.attendance),
    extraActivities: normalizeExtraActivities(record?.extraActivities),
    revision: record?.revision ?? 0,
    locked,
  };
}

const hasAnyActivity = (values) => Object.values(values).some((value) => String(value || '').trim());

export async function loadRecords(actor, { exam: examId, section = '' }) {
  requireSchoolAdmin(actor);
  await ready();
  const exam = await loadExam(actor, examId);
  const sections = await loadGradeSections(actor, exam.grade);
  assert(!section || sections.includes(section), 'Choose a section configured for this grade');
  const { table } = await buildRecordTable(actor, exam, { section });
  return table;
}

export async function saveRecords(actor, input) {
  requireSchoolAdmin(actor);
  await ready();
  const data = recordsInput.parse(input);
  const exam = await loadExam(actor, data.exam);
  assert(!exam.publishedAt, 'Results are published. Unpublish them to change attendance or extra activities.', 409);
  const section = data.section || '';
  if (section) {
    const sections = await loadGradeSections(actor, exam.grade);
    assert(sections.includes(section), 'Choose a section configured for this grade');
  }
  const { year, roster, records } = await buildRecordTable(actor, exam);
  const rosterById = new Map(roster.map((student) => [student.id, student]));

  // Check every row before writing any, so a stale row saves nothing.
  const changes = [];
  for (const row of data.rows) {
    const student = rosterById.get(row.student);
    assert(student, 'Every student must be enrolled in this grade for the exam\'s academic year', 409);
    assert(!section || student.section === section, `${student.name} is not in the selected section`, 409);
    const record = records.get(student.id);
    const attendance = normalizeAttendance(row.attendance);
    assert(
      attendance.workingDays == null || attendance.presentDays == null || attendance.presentDays <= attendance.workingDays,
      `${student.name}'s present days cannot be more than the working days`,
    );
    const extraActivities = normalizeExtraActivities(row.extraActivities);
    const savedActivities = normalizeExtraActivities(record?.extraActivities);
    // Extra activities are entered once per exam; a saved set is read-only.
    assert(
      !hasAnyActivity(savedActivities) || JSON.stringify(savedActivities) === JSON.stringify(extraActivities),
      `${student.name}'s extra activities are already saved for this exam and cannot be changed.`,
      409,
    );
    const changed = JSON.stringify(attendance) !== JSON.stringify(normalizeAttendance(record?.attendance)) ||
      JSON.stringify(extraActivities) !== JSON.stringify(savedActivities);
    if (!changed) continue;
    assert(
      (record?.revision ?? 0) === row.revision,
      `${student.name}'s record changed while you were working. Reload before saving.`,
      409,
    );
    changes.push({ student, record, attendance, extraActivities });
  }

  for (const { student, record, attendance, extraActivities } of changes) {
    const payload = {
      grade: exam.grade,
      studentName: student.name,
      attendance,
      extraActivities,
      recordedBy: actor.id,
      recordedByName: actor.name || '',
    };
    if (record) {
      const saved = await InternalExamRecord.findOneAndUpdate(
        { _id: record._id, school: actor.school, revision: record.revision ?? 0 },
        { $set: payload, $inc: { revision: 1 } },
        { new: true, runValidators: true },
      ).lean();
      assert(saved, `${student.name}'s record changed while saving. Reload before saving.`, 409);
    } else {
      try {
        await InternalExamRecord.create({
          ...payload,
          school: actor.school,
          academicYear: year.id,
          exam: exam._id,
          student: student.id,
          revision: 1,
        });
      } catch (error) {
        // Two people saving the same new student at once: the unique index wins.
        assert(error?.code !== 11000, `${student.name}'s record was just saved by someone else. Reload before saving.`, 409);
        throw error;
      }
    }
  }

  const { table } = await buildRecordTable(actor, exam, { section });
  return { saved: changes.length, table };
}
