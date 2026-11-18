import mongoose from 'mongoose';
import { EXAMINED_FILTER, studentTakesSubject } from '@pravyo/core/subjectScope';
import connectDB from '@pravyo/db';
import Student from '@pravyo/db/models/Student';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import ensureCasIndexes from './casIndexes.js';
import { assert, sameId } from './casAccess.js';
import { assertProgressAccess } from './casProgressAccess.js';
import { assertTeacherExamAssignment } from './casTeacherAssignmentService.js';
import { sheetInput, sheetQuery, studentProgressQuery, themesQuery } from './casValidation.js';
import {
  canReassess, getAcceptedLevel, needsReassessment,
} from '@pravyo/core/casResults';
import { validateAssessmentDate, kathmanduToday } from '@pravyo/core/casDates';
import { loadAcademicYear } from './casContext.js';
import { summariseRows } from './client/sheetTotals.js';
import { bookThemeMetadata } from './casBookThemes.js';
import { assessmentColumns } from './casBilingual.js';
import { usesResultSheet } from './casResultSheet.js';

/**
 * Page totals for a grade. Grades 6-10 keep the counts and obtained marks but
 * carry no percentage or grade: their result rules are not agreed yet, and a
 * primary-school figure must not be shown for them as if it were real.
 */
function gradeTotals(grade, rows) {
  const totals = summariseRows(rows);
  if (usesResultSheet(grade)) return totals;
  return { ...totals, percent: null, grade: null, gradePoint: null, remarkEn: '', remarkNe: '' };
}

const legacyThemeKey = (outcome) => `${outcome.themeNe || ''}|${outcome.themeEn || ''}`;
export const themeIdentity = (outcome) => outcome.themeKey || legacyThemeKey(outcome);
const reportScope = (actor, year, student) => ({
  school: actor.school, academicYear: year.id, student,
});

export const PUBLISHED_LOCK_MESSAGE =
  'This result is published, so its marks are locked. The school can unpublish the exam in Manage Exams to make changes.';

/**
 * True when this student's report card for this exam is published. A
 * published card is what the parent reads, so its marks stay fixed until the
 * school unpublishes the whole exam for the grade (Manage Exams), edits, and
 * publishes again. Legacy whole-year cards (no exam) predate exams and do not
 * lock exam marks.
 */
async function isPublishedForExam(actor, year, student, exam, session = null) {
  return Boolean(await CasReport.exists({
    ...reportScope(actor, year, student), exam, status: 'PUBLISHED',
  }).session(session));
}

async function subjectAndOutcomes(actor, { grade, subject }, session = null) {
  const subjectRow = await CasSubject.findOne({
    _id: subject, school: actor.school, grade, status: 'ACTIVE', ...EXAMINED_FILTER,
  }).session(session).lean();
  assert(subjectRow, 'Subject unavailable', 404);
  const outcomes = await CasLearningOutcome.find({
    school: actor.school, grade, subject: subjectRow._id, status: 'ACTIVE',
  }).sort({ sequence: 1, _id: 1 }).session(session).lean();
  return { subjectRow, outcomes };
}

function serializeSubject(subject) {
  return {
    id: String(subject._id), code: subject.code,
    titleEn: subject.titleEn, titleNe: subject.titleNe || '',
    creditHours: subject.creditHours ?? null,
  };
}

export function groupThemes(outcomes, subject) {
  const themes = new Map();
  for (const theme of [...(subject.themes || [])]
    .filter((item) => (item.status || 'ACTIVE') === 'ACTIVE')
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1))) {
    themes.set(theme.key, {
      key: theme.key,
      titleNe: theme.titleNe || '',
      titleEn: theme.titleEn || '',
      sequence: theme.sequence || themes.size + 1,
      workingHours: theme.workingHours ?? null,
      assessmentProjectHours: null,
      outcomeCount: 0,
    });
  }

  for (const outcome of outcomes) {
    const key = themeIdentity(outcome);
    if (!themes.has(key)) {
      themes.set(key, {
        key, titleNe: outcome.themeNe || '', titleEn: outcome.themeEn || '',
        sequence: themes.size + 1, workingHours: null,
        outcomeCount: 0,
      });
    }
    const theme = themes.get(key);
    theme.outcomeCount += 1;
    if (!theme.titleEn && outcome.themeEn) theme.titleEn = outcome.themeEn;
    if (!theme.titleNe && outcome.themeNe) theme.titleNe = outcome.themeNe;
  }
  return [...themes.values()].map((theme) => {
    const metadata = bookThemeMetadata({
      grade: subject.grade, subjectCode: subject.code,
      outcomes: outcomes.filter((outcome) => themeIdentity(outcome) === theme.key),
    }) || {};
    return {
      ...theme,
      ...metadata,
      workingHours: theme.workingHours ?? metadata.workingHours ?? null,
    };
  }).sort(
    (a, b) =>
      (a.sequence || 1) - (b.sequence || 1) ||
      (a.titleEn || a.titleNe).localeCompare(b.titleEn || b.titleNe),
  );
}

/** Themes belong to the selected school's active subject and grade. */
export async function loadThemes(actor, input) {
  const data = themesQuery.extend({ exam: themesQuery.shape.subject.optional(), academicYear: themesQuery.shape.subject.optional() }).parse(input);
  await connectDB();
  const { subjectRow, outcomes } = await subjectAndOutcomes(actor, data);
  if (data.exam) {
    const exam = await CasExam.findOne({ _id: data.exam, school: actor.school, academicYear: data.academicYear, status: 'ACTIVE' }).lean();
    assert(exam, 'Exam unavailable for this academic year', 404);
    await assertTeacherExamAssignment(actor, {
      academicYear: data.academicYear, exam: exam._id, grade: data.grade, subject: subjectRow._id,
    });
    const assignments = await CasThemeExam.find({ school: actor.school, academicYear: data.academicYear, grade: data.grade, subject: subjectRow._id, exam: exam._id }).select('themeKey').lean();
    const assigned = new Set(assignments.map((row) => row.themeKey));
    return { subject: serializeSubject(subjectRow), exam: { id: String(exam._id), name: exam.name }, themes: groupThemes(outcomes, subjectRow).filter((theme) => theme.outcomeCount > 0 && assigned.has(theme.key)) };
  }
  return { subject: serializeSubject(subjectRow), themes: [] };
}

async function studentAndEnrollment(actor, data, year, session = null, subjectRow = null) {
  const student = await Student.findOne({
    _id: data.student, school: actor.school,
    isDeleted: { $ne: true }, status: 'ACTIVE',
  }).select('name rollNumber section subjectChoices enrollments').session(session).lean();
  assert(student, 'Student unavailable', 404);
  const enrollment = (student.enrollments || []).find((entry) =>
    sameId(entry.school, actor.school) && entry.grade === data.grade &&
    entry.academicYearStart === year.yearStart,
  );
  assert(enrollment, `${student.name} is not enrolled in ${data.grade} for ${year.label}`, 409);
  if (subjectRow) {
    // Section-specific and optional subjects are only marked for the students
    // who take them.
    assert(studentTakesSubject(subjectRow, {
      section: enrollment.section || student.section,
      subjectChoices: student.subjectChoices,
    }), `${student.name} does not take ${subjectRow.titleEn}`, 409);
  }
  return { student, enrollment };
}

function serializeAssessmentRow(outcome, index, record) {
  const attempts = record?.attempts || [];
  const initial = attempts.find((attempt) => attempt.attemptType === 'INITIAL');
  const reassessments = attempts.filter((attempt) => attempt.attemptType === 'REASSESSMENT');
  const latest = reassessments.at(-1);
  return {
    serial: index + 1, outcome: String(outcome._id), code: outcome.code,
    titleEn: outcome.titleEn || '', titleNe: outcome.titleNe || '',
    ...assessmentColumns(outcome),
    descriptors: outcome.descriptors || [], indicators: outcome.indicators || [],
    regularDate: initial?.assessmentDate || '', regularLevel: initial?.level ?? null,
    remedialDate: latest?.assessmentDate || '', remedialLevel: latest?.level ?? null,
    remarks: record?.sheetRemarks ?? (initial?.remarksNe || initial?.remarksEn || ''),
    acceptedLevel: getAcceptedLevel(attempts), needsReassessment: needsReassessment(attempts),
    canReassess: canReassess(attempts),
    reassessmentCount: reassessments.length,
    revision: record?.revision ?? attempts.length,
  };
}

function serializeSheet({ actor, data, year, subjectRow, allOutcomes, student, enrollment, records, locked }) {
  const outcomes = allOutcomes.filter((outcome) => themeIdentity(outcome) === data.themeKey);
  const byOutcome = new Map(records.map((record) => [String(record.outcome), record]));
  const rows = outcomes.map((outcome, index) =>
    serializeAssessmentRow(outcome, index, byOutcome.get(String(outcome._id))));
  return {
    year, exam: { id: data.exam }, grade: data.grade, subject: serializeSubject(subjectRow),
    theme: groupThemes(allOutcomes, subjectRow).find((theme) => theme.key === data.themeKey),
    student: {
      id: String(student._id), name: student.name,
      rollNumber: enrollment.rollNumber || student.rollNumber || '',
    },
    rows, totals: gradeTotals(data.grade, rows), locked, today: kathmanduToday(),
    resultAvailable: usesResultSheet(data.grade),
    canRecord: actor.role === 'SCHOOL_ADMIN' || actor.role === 'TEACHER',
  };
}

/** Load exactly one student's book page; never read the class's other records. */
export async function loadStudentSheet(actor, input) {
  const data = sheetQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const exam = await CasExam.findOne({ _id: data.exam, school: actor.school, academicYear: year.id, status: 'ACTIVE' }).lean();
  assert(exam, 'Exam unavailable for this academic year', 404);
  const { subjectRow, outcomes: allOutcomes } = await subjectAndOutcomes(actor, data);
  await assertTeacherExamAssignment(actor, {
    academicYear: year.id, exam: exam._id, grade: data.grade, subject: subjectRow._id,
  });
  const outcomes = allOutcomes.filter((outcome) => themeIdentity(outcome) === data.themeKey);
  assert(outcomes.length, 'That theme has no learning outcomes', 404);
  assert(await CasThemeExam.exists({ school: actor.school, academicYear: year.id, grade: data.grade, subject: subjectRow._id, themeKey: data.themeKey, exam: exam._id }), 'This theme is not assigned to the selected exam', 409);
  const { student, enrollment } = await studentAndEnrollment(actor, data, year, null, subjectRow);
  const [records, locked] = await Promise.all([
    CasAssessment.find({
      ...reportScope(actor, year, student._id),
      grade: data.grade, subject: subjectRow._id,
      exam: exam._id,
      outcome: { $in: outcomes.map((outcome) => outcome._id) },
    }).lean(),
    isPublishedForExam(actor, year, student._id, exam._id),
  ]);
  return serializeSheet({ actor, data, year, subjectRow, allOutcomes, student, enrollment, records, locked });
}

/**
 * How far each student's marks are entered for one exam in one subject: the
 * learning outcomes of every theme assigned to that exam, and how many of them
 * carry a score. Drives the green / yellow / red marks in the Assessment
 * student list. Returns null when the exam has no outcomes in this subject.
 */
export async function examMarkProgress(actor, { academicYear, grade, subject, exam }) {
  await connectDB();
  const year = await loadAcademicYear(actor, academicYear);
  const examRow = await CasExam.findOne({ _id: exam, school: actor.school, academicYear: year.id, status: 'ACTIVE' }).select('_id').lean();
  assert(examRow, 'Exam unavailable for this academic year', 404);
  const { subjectRow, outcomes } = await subjectAndOutcomes(actor, { grade, subject });
  await assertTeacherExamAssignment(actor, {
    academicYear: year.id, exam: examRow._id, grade, subject: subjectRow._id,
  });
  const assigned = await CasThemeExam.find({
    school: actor.school, academicYear: year.id, grade, subject: subjectRow._id, exam: examRow._id,
  }).select('themeKey').lean();
  const themeKeys = new Set(assigned.map((row) => row.themeKey));
  const examOutcomes = outcomes.filter((outcome) => themeKeys.has(themeIdentity(outcome)));
  if (!examOutcomes.length) return null;

  const records = await CasAssessment.find({
    school: actor.school, academicYear: year.id, exam: examRow._id, grade, subject: subjectRow._id,
    outcome: { $in: examOutcomes.map((outcome) => outcome._id) },
    'attempts.0': { $exists: true },
  }).select('student outcome').lean();
  const assessed = new Map();
  for (const record of records) {
    const key = String(record.student);
    if (!assessed.has(key)) assessed.set(key, new Set());
    assessed.get(key).add(String(record.outcome));
  }
  return {
    total: examOutcomes.length,
    assessedFor: (studentId) => assessed.get(String(studentId))?.size || 0,
  };
}

/** Summarize one student's progress across every assessable theme in a subject. */
/**
 * Student Progress for one student and subject. The school sees everyone; a
 * teacher only the grades and subjects they teach (casProgressAccess).
 */
export async function loadStudentSubjectProgress(actor, input) {
  const data = studentProgressQuery.parse(input);
  await connectDB();
  await assertProgressAccess(actor, data);
  return buildStudentSubjectProgress(actor, data);
}

/**
 * One record per outcome for Student Progress.
 *
 * An outcome can hold more than one record for a student: one per exam it was
 * assessed in, plus, for schools that used CAS before exams existed, an older
 * record with no exam. Picking whichever the database returned last showed
 * the wrong exam's levels, so the choice is explicit:
 *   1. the record for the exam the outcome's theme is assigned to;
 *   2. otherwise the most recently updated record that belongs to an exam;
 *   3. otherwise the pre-exam record.
 */
export function pickProgressRecords(records, assignedExamsFor) {
  const rank = (record) => {
    if (!record.exam) return 0;
    return assignedExamsFor(record)?.has(String(record.exam)) ? 2 : 1;
  };
  const updated = (record) => new Date(record.updatedAt || 0).getTime();
  const chosen = new Map();
  for (const record of records) {
    const key = String(record.outcome);
    const current = chosen.get(key);
    if (!current
      || rank(record) > rank(current)
      || (rank(record) === rank(current) && updated(record) > updated(current))) {
      chosen.set(key, record);
    }
  }
  return chosen;
}

/** The progress itself, with no access check — callers authorise first. */
export async function buildStudentSubjectProgress(actor, input) {
  const data = studentProgressQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const { subjectRow, outcomes: allOutcomes } = await subjectAndOutcomes(actor, data);
  const { student, enrollment } = await studentAndEnrollment(actor, data, year);

  // Only the school sees marks as they are entered. Teachers, parents and the
  // student see progress from PUBLISHED results only: the exams whose report
  // card is published for this student (a published whole-year card counts
  // for every exam).
  const publishedOnly = actor.role !== 'SCHOOL_ADMIN';
  let publishedExams = null;
  if (publishedOnly) {
    const published = await CasReport.find({ ...reportScope(actor, year, student._id), status: 'PUBLISHED' })
      .select('exam').lean();
    if (!published.some((report) => !report.exam)) {
      publishedExams = published.map((report) => report.exam).filter(Boolean);
    }
  }
  const examFilter = publishedExams ? { exam: { $in: publishedExams } } : {};

  const records = await CasAssessment.find({
    ...reportScope(actor, year, student._id),
    grade: data.grade, subject: subjectRow._id,
    outcome: { $in: allOutcomes.map((outcome) => outcome._id) },
    ...examFilter,
  }).lean();
  const assignments = await CasThemeExam.find({
    school: actor.school, academicYear: year.id, grade: data.grade, subject: subjectRow._id,
    ...examFilter,
  }).select('themeKey exam').lean();
  const assignedThemes = new Set(assignments.map((row) => row.themeKey));
  const examsOfTheme = new Map();
  for (const row of assignments) {
    if (!examsOfTheme.has(row.themeKey)) examsOfTheme.set(row.themeKey, new Set());
    examsOfTheme.get(row.themeKey).add(String(row.exam));
  }
  // Keep existing marks visible even if an assignment is later adjusted.
  const themeOfOutcome = new Map(allOutcomes.map((o) => [String(o._id), themeIdentity(o)]));
  const recordsByOutcome = pickProgressRecords(records, (record) =>
    examsOfTheme.get(themeOfOutcome.get(String(record.outcome))));
  const assessedThemes = new Set(records
    .filter((record) => record.attempts?.length && themeOfOutcome.has(String(record.outcome)))
    .map((record) => themeOfOutcome.get(String(record.outcome))));
  const themes = groupThemes(allOutcomes, subjectRow).filter(
    (theme) => theme.outcomeCount > 0 &&
      (assignedThemes.has(theme.key) || assessedThemes.has(theme.key)),
  );

  const progressThemes = themes.map((theme) => {
    const rows = allOutcomes
      .filter((outcome) => themeIdentity(outcome) === theme.key)
      .map((outcome, index) =>
        serializeAssessmentRow(outcome, index, recordsByOutcome.get(String(outcome._id))));
    return {
      key: theme.key,
      titleNe: theme.titleNe || '',
      titleEn: theme.titleEn || '',
      sequence: theme.sequence || 1,
      workingHours: theme.workingHours ?? null,
      outcomeCount: rows.length,
      assessedCount: rows.filter((row) => row.acceptedLevel !== null).length,
      pendingReassessment: rows.filter((row) => row.needsReassessment).length,
      rows,
      totals: gradeTotals(data.grade, rows),
    };
  });

  return {
    year,
    grade: data.grade,
    subject: serializeSubject(subjectRow),
    student: {
      id: String(student._id), name: student.name,
      rollNumber: enrollment.rollNumber || student.rollNumber || '',
    },
    themes: progressThemes,
    totals: gradeTotals(data.grade, progressThemes.flatMap((theme) => theme.rows)),
    resultAvailable: usesResultSheet(data.grade),
    // true when only published results are counted (everyone but the school)
    publishedOnly,
    locked: false,
    canRecord: actor.role === 'SCHOOL_ADMIN',
  };
}

/**
 * A book page commits atomically. Until the exam's result is published, every
 * score on the page can be corrected or cleared (a teacher's typing mistake);
 * superseded values stay on the attempt (`revisions`) and cleared attempts in
 * `removedAttempts`. Once published, the page is locked.
 */
export async function saveSheet(actor, input) {
  const data = sheetInput.parse(input);
  await connectDB();
  await ensureCasIndexes();
  const year = await loadAcademicYear(actor, data.academicYear);
  const exam = await CasExam.findOne({ _id: data.exam, school: actor.school, academicYear: year.id, status: 'ACTIVE' }).lean();
  assert(exam, 'Exam unavailable for this academic year', 404);

  return mongoose.connection.transaction(async (session) => {
    const { subjectRow, outcomes: allOutcomes } = await subjectAndOutcomes(actor, data, session);
    await assertTeacherExamAssignment(actor, {
      academicYear: year.id, exam: exam._id, grade: data.grade, subject: subjectRow._id,
    }, session);
    const outcomes = allOutcomes.filter((outcome) => themeIdentity(outcome) === data.themeKey);
    assert(outcomes.length, 'That theme has no learning outcomes', 404);
    assert(await CasThemeExam.exists({ school: actor.school, academicYear: year.id, grade: data.grade, subject: subjectRow._id, themeKey: data.themeKey, exam: exam._id }).session(session), 'This theme is not assigned to the selected exam', 409);
    const byOutcome = new Map(outcomes.map((outcome) => [String(outcome._id), outcome]));
    assert(data.rows.every((row) => byOutcome.has(row.outcome.toLowerCase())),
      'Every learning outcome must belong to the selected grade, subject and theme', 409);
    const { student, enrollment } = await studentAndEnrollment(actor, data, year, session, subjectRow);
    const scope = reportScope(actor, year, student._id);
    assert(!await isPublishedForExam(actor, year, student._id, exam._id, session), PUBLISHED_LOCK_MESSAGE, 409);
    const draftReports = await CasReport.find({ ...scope, status: 'DRAFT' }).session(session).lean();

    const recordScope = { ...scope, exam: exam._id, grade: data.grade, subject: subjectRow._id };
    const records = await CasAssessment.find({
      ...recordScope, outcome: { $in: outcomes.map((outcome) => outcome._id) },
    }).session(session).lean();
    const recordsByOutcome = new Map(records.map((record) => [String(record.outcome), record]));
    const changes = [];
    for (const row of data.rows) {
      const outcome = byOutcome.get(row.outcome.toLowerCase());
      const existing = recordsByOutcome.get(String(outcome._id));
      const attempts = existing?.attempts || [];
      const revision = existing?.revision ?? attempts.length;
      assert(revision === row.revision,
        'Someone else updated this page while you were working. Reload before saving.', 409);

      const nextAttempts = attempts.map((attempt) => ({
        ...attempt,
        revisions: [...(attempt.revisions || [])],
      }));
      const initialIndex = nextAttempts.findIndex((attempt) => attempt.attemptType === 'INITIAL');
      const reassessmentIndexes = nextAttempts
        .map((attempt, index) => (attempt.attemptType === 'REASSESSMENT' ? index : null))
        .filter((index) => index !== null);
      const latestIndex = reassessmentIndexes.at(-1);
      const initial = initialIndex >= 0 ? nextAttempts[initialIndex] : null;
      const latest = latestIndex != null ? nextAttempts[latestIndex] : null;
      let attemptsChanged = false;
      const removed = [];

      // Until the result is published (checked above), a mistaken score can be
      // corrected or removed. A correction keeps the replaced value in the
      // attempt's `revisions`; a removal keeps the whole attempt in
      // `removedAttempts`, so the record stays auditable.
      if (initial && row.regularLevel === null) {
        // Clearing the regular score clears the outcome: extra support cannot
        // stand without a regular assessment.
        removed.push(...nextAttempts.map((attempt) => removedAttempt(attempt, actor)));
        nextAttempts.length = 0;
        attemptsChanged = true;
      } else if (initial) {
        const patch = {};
        if (initial.level !== row.regularLevel) patch.level = row.regularLevel;
        if (initial.assessmentDate !== row.regularDate) {
          const date = validateAssessmentDate({ value: row.regularDate, academicYear: year });
          const nextAfterInitial = nextAttempts.find((attempt, index) => index > initialIndex);
          assert(!nextAfterInitial || date <= nextAfterInitial.assessmentDate,
            `The regular assessment date for ${outcome.code} must be on or before the first reassessment.`, 409);
          patch.assessmentDate = date;
        }
        if (Object.keys(patch).length) {
          nextAttempts[initialIndex] = correctAttempt(initial, patch, actor);
          attemptsChanged = true;
        }
      }
      if (latest && row.remedialLevel === null && nextAttempts.length) {
        // Removing the extra-support score removes every reassessment: the
        // page shows only the latest, and an older one must not reappear.
        removed.push(...nextAttempts
          .filter((attempt) => attempt.attemptType === 'REASSESSMENT')
          .map((attempt) => removedAttempt(attempt, actor)));
        nextAttempts.splice(0, nextAttempts.length, ...nextAttempts.filter((attempt) => attempt.attemptType !== 'REASSESSMENT'));
        attemptsChanged = true;
      }
      if (nextAttempts.length && row.remedialLevel !== null) {
        // A corrected regular score of 4 cannot carry extra support.
        const regularOnly = nextAttempts.filter((attempt) => attempt.attemptType === 'INITIAL');
        assert(canReassess(regularOnly),
          `${outcome.code} scored 4, so it has no extra-support assessment. Clear that score first.`, 409);
      }

      if (!initial && row.regularLevel !== null) {
        const date = validateAssessmentDate({ value: row.regularDate, academicYear: year });
        nextAttempts.push(makeAttempt(actor, 'INITIAL', nextAttempts.length + 1, row.regularLevel, date, row.remarks));
        attemptsChanged = true;
      }

      if (row.remedialLevel !== null) {
        const currentLatestIndex = nextAttempts
          .map((attempt, index) => (attempt.attemptType === 'REASSESSMENT' ? index : null))
          .filter((index) => index !== null)
          .at(-1);
        const currentLatest = currentLatestIndex != null ? nextAttempts[currentLatestIndex] : null;
        if (currentLatest) {
          const levelChanged = currentLatest.level !== row.remedialLevel;
          const dateChanged = currentLatest.assessmentDate !== row.remedialDate;
          const shouldAppend =
            levelChanged &&
            dateChanged &&
            row.remedialDate > currentLatest.assessmentDate &&
            canReassess(nextAttempts);

          if (shouldAppend) {
            const date = validateAssessmentDate({
              value: row.remedialDate, academicYear: year, previousAttempt: currentLatest,
            });
            nextAttempts.push(
              makeAttempt(actor, 'REASSESSMENT', nextAttempts.length + 1, row.remedialLevel, date, row.remarks),
            );
            attemptsChanged = true;
          } else if (levelChanged || dateChanged) {
            const historyBeforeLatest = nextAttempts.slice(0, currentLatestIndex);
            assert(historyBeforeLatest.length > 0, 'Record the regular assessment before extra support');
            const date = validateAssessmentDate({
              value: row.remedialDate, academicYear: year, previousAttempt: historyBeforeLatest.at(-1),
            });
            nextAttempts[currentLatestIndex] = correctAttempt(
              currentLatest,
              { level: row.remedialLevel, assessmentDate: date },
              actor,
            );
            attemptsChanged = true;
          }
        } else {
          assert(nextAttempts.length > 0, 'Record the regular assessment before extra support');
          assert(canReassess(nextAttempts),
            `${outcome.code} scored 4 and cannot be reassessed.`, 409);
          const date = validateAssessmentDate({
            value: row.remedialDate, academicYear: year, previousAttempt: nextAttempts.at(-1),
          });
          nextAttempts.push(
            makeAttempt(actor, 'REASSESSMENT', nextAttempts.length + 1, row.remedialLevel, date, row.remarks),
          );
          attemptsChanged = true;
        }
      }
      assert(nextAttempts.length <= 20, 'Maximum attempts reached for this outcome', 409);
      const currentRemarks = existing?.sheetRemarks ?? (initial?.remarksNe || initial?.remarksEn || '');
      if (!attemptsChanged && row.remarks === currentRemarks) continue;
      // An empty, untouched row does not create an assessment record.
      if (!existing && !attemptsChanged) continue;
      changes.push({ outcome, existing, revision, attempts: nextAttempts, attemptsChanged, remarks: row.remarks, removed });
    }

    // A write to the same draft document serializes with publication. A plain
    // read of status would permit a publisher and a sheet save to pass together.
    if (changes.length && draftReports.length) {
      const lock = await CasReport.updateMany(
        { ...scope, _id: { $in: draftReports.map((report) => report._id) }, status: 'DRAFT' },
        { $inc: { assessmentRevision: 1 } },
        { session },
      );
      assert(lock.matchedCount === draftReports.length, 'A report changed while saving. Reload before saving.', 409);
    }

    for (const change of changes) {
      const { outcome, existing, revision, attempts, attemptsChanged, remarks, removed } = change;
      const acceptedLevel = getAcceptedLevel(attempts);
      let saved;
      if (existing) {
        const revisionScope = existing.revision == null
          ? { revision: { $exists: false } } : { revision };
        saved = await CasAssessment.findOneAndUpdate(
          { ...recordScope, _id: existing._id, ...revisionScope },
          {
            $set: {
              ...(attemptsChanged ? { attempts } : {}),
              acceptedLevel,
              sheetRemarks: remarks,
              revision: revision + 1,
            },
            ...(removed.length ? { $push: { removedAttempts: { $each: removed } } } : {}),
          },
          { returnDocument: 'after', session, runValidators: true },
        ).lean();
        assert(saved, 'This result changed while saving. Reload before saving.', 409);
      } else {
        const [created] = await CasAssessment.create([{
          ...recordScope, studentName: student.name,
          rollNumber: enrollment.rollNumber || student.rollNumber || '',
          subjectCode: outcome.subjectCode, outcome: outcome._id, outcomeCode: outcome.code,
          attempts, acceptedLevel, sheetRemarks: remarks, revision: 1,
        }], { session });
        saved = created.toObject();
      }
      recordsByOutcome.set(String(outcome._id), saved);
    }

    return {
      saved: changes.length,
      sheet: serializeSheet({
        actor, data, year, subjectRow, allOutcomes, student, enrollment,
        records: [...recordsByOutcome.values()], locked: false,
      }),
    };
  });
}

function makeAttempt(actor, attemptType, attemptNumber, level, assessmentDate, remarks) {
  return {
    attemptType, attemptNumber, level, assessmentDate,
    remarksEn: '', remarksNe: remarks,
    recordedByModel: actor.role === 'TEACHER' ? 'Teacher' : 'User',
    recordedBy: actor.id, recordedByName: actor.name, recordedAt: new Date(),
  };
}

function attemptRevision(attempt, actor) {
  return {
    level: attempt.level,
    assessmentDate: attempt.assessmentDate,
    correctedAt: new Date(),
    correctedByModel: actor.role === 'TEACHER' ? 'Teacher' : 'User',
    correctedBy: actor.id,
    correctedByName: actor.name,
  };
}

/** A cleared attempt, kept for the audit trail with who cleared it and when. */
function removedAttempt(attempt, actor) {
  return {
    ...attempt,
    removedAt: new Date(),
    removedByModel: actor.role === 'TEACHER' ? 'Teacher' : 'User',
    removedBy: actor.id,
    removedByName: actor.name,
  };
}

function correctAttempt(attempt, patch, actor) {
  return {
    ...attempt,
    ...patch,
    revisions: [...(attempt.revisions || []), attemptRevision(attempt, actor)],
  };
}
