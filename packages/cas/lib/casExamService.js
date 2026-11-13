import connectDB from '@pravyo/db';
import { EXAMINED_FILTER } from '@pravyo/core/subjectScope';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';
import { assert, requireSchoolAdmin } from './casAccess.js';
import { loadAcademicYear } from './casContext.js';
import { themeIdentity } from './casSheetService.js';
import ensureCasIndexes from './casIndexes.js';
import { examCreateInput, examUpdateInput } from './casValidation.js';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';

function namePattern(value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

function serializeExam(exam) {
  return {
    id: String(exam._id),
    name: exam.name,
    reportTitle: exam.reportTitle || exam.name,
    issueDate: exam.issueDate || '',
    status: exam.status,
    isCurrent: Boolean(exam.isCurrent) && exam.status === 'ACTIVE',
    academicYear: String(exam.academicYear),
  };
}

/**
 * Mark one exam as the current (live or upcoming) exam for its academic year,
 * or clear the mark. Only one exam per year is current, so screens can open
 * on it instead of making everyone switch exams by hand.
 */
export async function setCurrentExam(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  const id = String(input?.exam || '');
  assert(/^[a-f\d]{24}$/i.test(id), 'Choose a valid exam');
  const exam = await CasExam.findOne({ _id: id, school: actor.school, mergedInto: { $exists: false } }).lean();
  assert(exam, 'Exam unavailable', 404);
  const current = input?.current !== false;
  assert(!current || exam.status === 'ACTIVE', 'Restore this exam before making it the current exam', 409);
  if (current) {
    await CasExam.updateMany(
      { school: actor.school, academicYear: exam.academicYear, _id: { $ne: exam._id }, isCurrent: true },
      { $set: { isCurrent: false } },
    );
  }
  await CasExam.updateOne({ _id: exam._id, school: actor.school }, { $set: { isCurrent: current } });
  return { id: String(exam._id), isCurrent: current };
}

async function examUsage(actor, exam) {
  const [assignment, assessment, report] = await Promise.all([
    CasThemeExam.exists({ school: actor.school, exam }),
    CasAssessment.exists({ school: actor.school, exam }),
    CasReport.exists({ school: actor.school, exam }),
  ]);
  return {
    assignment: Boolean(assignment),
    assessment: Boolean(assessment),
    report: Boolean(report),
    any: Boolean(assignment || assessment || report),
  };
}

export async function listExams(actor, { academicYear, grade, includeArchived = false } = {}) {
  await connectDB();
  const year = await loadAcademicYear(actor, academicYear);
  const exams = await CasExam.find({
    school: actor.school, academicYear: year.id, mergedInto: { $exists: false },
    ...(includeArchived ? {} : { status: 'ACTIVE' }),
  })
    .sort({ createdAt: 1, _id: 1 }).lean();
  const assignmentScope = { school: actor.school, academicYear: year.id, ...(grade ? { grade } : {}) };
  const teacherScope = actor.role === 'TEACHER'
    ? await CasExamTeacherAssignment.find({ ...assignmentScope, teacher: actor.id }).select('exam grade subject').lean()
    : null;
  const permittedExamIds = teacherScope ? new Set(teacherScope.map((row) => String(row.exam))) : null;
  const permittedSubjects = teacherScope
    ? new Set(teacherScope.map((row) => `${row.grade}:${String(row.exam)}:${String(row.subject)}`))
    : null;
  const assignments = await CasThemeExam.find(assignmentScope).lean();
  const assignedExamIds = new Set(assignments.map((row) => String(row.exam)));
  if (includeArchived) {
    const [assessedExamIds, reportedExamIds] = await Promise.all([
      CasAssessment.distinct('exam', { ...assignmentScope, exam: { $ne: null } }),
      CasReport.distinct('exam', { ...assignmentScope, exam: { $ne: null } }),
    ]);
    for (const id of [...assessedExamIds, ...reportedExamIds]) assignedExamIds.add(String(id));
  }
  const visibleExams = exams.filter((exam) =>
    (!permittedExamIds || permittedExamIds.has(String(exam._id))) &&
    (exam.status !== 'ARCHIVED' || assignedExamIds.has(String(exam._id))));
  // When each exam's result was last published for this grade, so screens can
  // open on the result the school actually issued.
  const publishedAt = new Map();
  if (grade) {
    const published = await CasReport.find({
      school: actor.school, academicYear: year.id, grade, status: 'PUBLISHED', exam: { $ne: null },
    }).select('exam publishedAt').lean();
    for (const report of published) {
      const id = String(report.exam);
      const at = report.publishedAt ? new Date(report.publishedAt).toISOString() : '';
      if (!publishedAt.has(id) || at > publishedAt.get(id)) publishedAt.set(id, at);
    }
  }
  return {
    exams: visibleExams.map((exam) => ({
      ...serializeExam(exam),
      ...(publishedAt.has(String(exam._id)) ? { publishedAt: publishedAt.get(String(exam._id)) } : {}),
    })),
    assignments: assignments
      .filter((row) => !permittedSubjects || permittedSubjects.has(`${row.grade}:${String(row.exam)}:${String(row.subject)}`))
      .map((row) => ({ id: String(row._id), subject: String(row.subject), themeKey: row.themeKey, exam: String(row.exam), grade: row.grade })),
  };
}

export async function createExam(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  await ensureCasIndexes();
  const data = examCreateInput.parse(input);
  const name = data.name;
  const year = await loadAcademicYear(actor, data.academicYear);
  const duplicate = await CasExam.findOne({ school: actor.school, academicYear: year.id, mergedInto: { $exists: false }, name: namePattern(name) }).lean();
  if (duplicate) {
    const duplicateUsage = await examUsage(actor, duplicate._id);
    assert(duplicate.status === 'ARCHIVED' && !duplicateUsage.any, 'An exam with this name already exists for this academic year', 409);
    await CasExam.updateOne(
      { _id: duplicate._id, school: actor.school, status: 'ARCHIVED', mergedInto: { $exists: false } },
      { $set: { isAlias: true, mergedInto: duplicate._id } },
    );
  }
  const exam = await CasExam.create({
    school: actor.school,
    academicYear: year.id,
    name,
    reportTitle: data.reportTitle || name,
    issueDate: data.issueDate,
    createdBy: actor.id,
  });
  return serializeExam(exam);
}

export async function updateExam(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  const data = examUpdateInput.parse(input);
  const { exam: id, name } = data;
  const exam = await CasExam.findOne({ _id: id, school: actor.school, mergedInto: { $exists: false } });
  assert(exam, 'Exam unavailable', 404);
  const year = await loadAcademicYear(actor, input.academicYear);
  const scopeChanged = String(year.id) !== String(exam.academicYear);
  if (scopeChanged) {
    const [assignment, assessment, report] = await Promise.all([
      CasThemeExam.exists({ school: actor.school, exam: exam._id }),
      CasAssessment.exists({ school: actor.school, exam: exam._id }),
      CasReport.exists({ school: actor.school, exam: exam._id }),
    ]);
    assert(!assignment && !assessment && !report, 'Academic year cannot be changed after themes, marks, or reports use this exam.', 409);
  }
  const duplicate = await CasExam.findOne({
    _id: { $ne: exam._id }, school: actor.school, mergedInto: { $exists: false },
    academicYear: year.id, name: namePattern(name),
  }).select('_id status').lean();
  if (duplicate) {
    const duplicateUsage = await examUsage(actor, duplicate._id);
    assert(duplicate.status === 'ARCHIVED' && !duplicateUsage.any, 'An exam with this name already exists for this academic year', 409);
    await CasExam.updateOne(
      { _id: duplicate._id, school: actor.school, status: 'ARCHIVED', mergedInto: { $exists: false } },
      { $set: { isAlias: true, mergedInto: duplicate._id } },
    );
  }
  exam.name = name;
  exam.academicYear = year.id;
  if (Object.hasOwn(data, 'reportTitle')) exam.reportTitle = data.reportTitle || name;
  const issueDateChanged = Object.hasOwn(data, 'issueDate') && data.issueDate !== exam.issueDate;
  if (Object.hasOwn(data, 'issueDate')) exam.issueDate = data.issueDate;
  await exam.save();
  // The issue date is managed here, not per card: carry a change onto every
  // report card already made for this exam, published ones included, in the
  // same normalised form generation stores (casReportService checkedIssueDate).
  if (issueDateChanged) {
    await CasReport.updateMany(
      { school: actor.school, exam: exam._id },
      { $set: { 'snapshot.issueDate': parseBsNumeric(exam.issueDate)?.bs || null } },
    );
  }
  return serializeExam(exam);
}

export async function assignThemeExams(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  await ensureCasIndexes();
  const { academicYear, grade, subject, themeKey } = input || {};
  assert(typeof themeKey === 'string' && themeKey.length > 0 && themeKey.length <= 401, 'Choose a valid theme');
  const year = await loadAcademicYear(actor, academicYear);
  const subjectRow = await CasSubject.findOne({ _id: subject, school: actor.school, grade, status: 'ACTIVE', ...EXAMINED_FILTER }).lean();
  assert(subjectRow, 'Subject unavailable', 404);
  const outcomes = await CasLearningOutcome.find({ school: actor.school, subject, status: 'ACTIVE' }).select('themeKey themeEn themeNe').lean();
  assert(outcomes.some((row) => themeIdentity(row) === themeKey), 'Add at least one outcome to this theme first', 409);
  const ids = [...new Set((Array.isArray(input.examIds) ? input.examIds : []).map(String))];
  const current = await CasThemeExam.find({ school: actor.school, academicYear: year.id, grade, subject, themeKey }).select('exam').lean();
  const existingIds = new Set(current.map((row) => String(row.exam)));
  const exams = ids.length ? await CasExam.find({ _id: { $in: ids }, school: actor.school, academicYear: year.id, mergedInto: { $exists: false } }).select('_id status').lean() : [];
  assert(exams.length === ids.length && exams.every((exam) => exam.status === 'ACTIVE' || existingIds.has(String(exam._id))), 'Only active exams can be newly assigned', 409);
  // A published result is fixed: adding a theme would change what a
  // republished card contains, so the school unpublishes first.
  const addedExamIds = ids.filter((examId) => !existingIds.has(examId));
  assert(!addedExamIds.length || !await CasReport.exists({
    school: actor.school, academicYear: year.id, grade, exam: { $in: addedExamIds }, status: 'PUBLISHED',
  }), 'This exam’s results are published for this grade. Unpublish them in Manage Exams before changing its themes.', 409);
  const removedExamIds = current.map((row) => String(row.exam)).filter((id) => !ids.includes(id));
  if (removedExamIds.length) {
    const outcomeIds = outcomes.map((row) => row._id);
    assert(!await CasAssessment.exists({ school: actor.school, academicYear: year.id, grade, subject, exam: { $in: removedExamIds }, outcome: { $in: outcomeIds } }), 'An exam assignment cannot be removed after marks have been recorded', 409);
    assert(!await CasReport.exists({ school: actor.school, academicYear: year.id, grade, exam: { $in: removedExamIds } }), 'An exam assignment cannot be removed after a report has been generated', 409);
    const orderedExams = await CasExam.find({ school: actor.school, academicYear: year.id, status: 'ACTIVE' })
      .sort({ createdAt: 1, _id: 1 }).select('_id').lean();
    const positions = removedExamIds.map((id) => orderedExams.findIndex((exam) => String(exam._id) === id)).filter((index) => index >= 0);
    const firstRemovedPosition = positions.length ? Math.min(...positions) : -1;
    const laterCumulativeKeys = firstRemovedPosition >= 0
      ? orderedExams.slice(firstRemovedPosition + 1).map((exam) => `CUMULATIVE:${exam._id}`)
      : [];
    assert(!laterCumulativeKeys.length || !await CasReport.exists({
      school: actor.school, academicYear: year.id, grade, resultKey: { $in: laterCumulativeKeys },
    }), 'This theme is included in a cumulative result. Unpublish and remove that result before changing exam assignments', 409);
  }
  await CasThemeExam.deleteMany({ school: actor.school, academicYear: year.id, grade, subject, themeKey });
  if (ids.length) await CasThemeExam.insertMany(ids.map((exam) => ({ school: actor.school, academicYear: year.id, grade, subject, themeKey, exam })));
  return { examIds: ids };
}

export async function deleteExam(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  await ensureCasIndexes();
  const id = String(input?.exam || '');
  assert(/^[a-f\d]{24}$/i.test(id), 'Choose a valid exam');
  const exam = await CasExam.findOne({ _id: id, school: actor.school, mergedInto: { $exists: false } });
  assert(exam, 'Exam unavailable', 404);
  const [assessment, report] = await Promise.all([
    CasAssessment.exists({ school: actor.school, exam: exam._id }),
    CasReport.exists({
      school: actor.school,
      $or: [
        { exam: exam._id },
        { resultKey: String(exam._id) },
        { resultKey: `CUMULATIVE:${exam._id}` },
        { 'snapshot.examId': String(exam._id) },
      ],
    }),
  ]);
  // An exam with marks or results is history: archive it so every published
  // report card stays readable. Only an unused exam is removed for good.
  if (assessment || report) {
    exam.status = 'ARCHIVED';
    exam.isCurrent = false;
    await exam.save();
    return { id: String(exam._id), archived: true };
  }
  await CasThemeExam.deleteMany({ school: actor.school, exam: exam._id });
  await CasExamTeacherAssignment.deleteMany({ school: actor.school, exam: exam._id });
  await CasExam.deleteOne({ _id: exam._id, school: actor.school });
  return { id: String(exam._id), deleted: true };
}

/** Bring an archived exam back into use, unless an active one now has its name. */
export async function restoreExam(actor, input) {
  requireSchoolAdmin(actor);
  await connectDB();
  const id = String(input?.exam || '');
  assert(/^[a-f\d]{24}$/i.test(id), 'Choose a valid exam');
  const exam = await CasExam.findOne({ _id: id, school: actor.school, mergedInto: { $exists: false } });
  assert(exam, 'Exam unavailable', 404);
  const duplicate = await CasExam.exists({
    _id: { $ne: exam._id }, school: actor.school, academicYear: exam.academicYear,
    status: 'ACTIVE', mergedInto: { $exists: false }, name: namePattern(exam.name),
  });
  assert(!duplicate, 'An active exam with this name already exists for this academic year', 409);
  exam.status = 'ACTIVE';
  await exam.save();
  return serializeExam(exam);
}
