import mongoose from 'mongoose';
import connectDB from '@pravyo/db';
import Student from '@pravyo/db/models/Student';
import { studentTakesSubject } from '@pravyo/core/subjectScope';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';
import ensureCasIndexes from './casIndexes.js';
import { assert, requireSchoolAdmin, sameId } from './casAccess.js';
import { attemptInput } from './casValidation.js';
import {
  getAcceptedLevel,
  needsReassessment,
  REASSESSMENT_THRESHOLD,
} from '@pravyo/core/casResults';
import { validateAssessmentDate, kathmanduToday, CasDateError } from '@pravyo/core/casDates';
import { loadAcademicYear, loadStudents } from './casContext.js';

/**
 * Recording assessments.
 *
 * Three invariants hold here and are covered by tests:
 *  - attempts are append-only; a reassessment never overwrites the initial
 *    result, and neither is ever edited;
 *  - the accepted level is recomputed from the full history by the domain
 *    function, never patched incrementally;
 *  - a save carrying a stale revision is rejected, so two people working the
 *    same student cannot silently erase one another.
 */

export function serializeAssessment(row) {
  const attempts = row.attempts || [];
  const initial = attempts.find((a) => a.attemptType === 'INITIAL') || null;
  const reassessments = attempts.filter((a) => a.attemptType === 'REASSESSMENT');
  const latest = reassessments[reassessments.length - 1] || null;

  return {
    id: String(row._id),
    student: String(row.student),
    outcome: String(row.outcome),
    outcomeCode: row.outcomeCode,
    subjectCode: row.subjectCode,
    initialLevel: initial?.level ?? null,
    initialDate: initial?.assessmentDate || '',
    reassessmentLevel: latest?.level ?? null,
    reassessmentDate: latest?.assessmentDate || '',
    reassessmentCount: reassessments.length,
    acceptedLevel: row.acceptedLevel ?? getAcceptedLevel(attempts),
    needsReassessment: needsReassessment(attempts),
    revision: row.revision ?? attempts.length,
    attempts: attempts.map((a) => ({
      attemptType: a.attemptType,
      attemptNumber: a.attemptNumber,
      level: a.level,
      assessmentDate: a.assessmentDate,
      remarksEn: a.remarksEn || '',
      remarksNe: a.remarksNe || '',
      recordedByName: a.recordedByName || '',
    })),
  };
}

/**
 * The assessment sheet: one learning outcome, every student in the grade.
 *
 * Returns the roster and whatever has been recorded, keyed by student, so the
 * screen renders from a single request.
 */
export async function loadAssessmentSheet(actor, { academicYear, grade, outcome }) {
  // This legacy whole-grade/outcome endpoint has no exam dimension, so it
  // cannot prove a teacher's per-exam assignment. Teacher work uses the
  // exam-scoped book endpoint instead.
  requireSchoolAdmin(actor);
  await connectDB();
  await ensureCasIndexes();

  const year = await loadAcademicYear(actor, academicYear);

  const outcomeRow = await CasLearningOutcome.findOne({
    _id: outcome,
    school: actor.school,
  }).lean();
  assert(outcomeRow, 'Learning outcome unavailable', 404);
  assert(
    outcomeRow.grade === grade,
    'That learning outcome belongs to a different grade',
  );

  const subject = await CasSubject.findOne({
    _id: outcomeRow.subject,
    school: actor.school,
  }).lean();
  assert(subject, 'Subject unavailable', 404);

  const [students, records] = await Promise.all([
    loadStudents(actor, { grade, yearStart: year.yearStart }),
    CasAssessment.find({
      school: actor.school,
      academicYear: year.id,
      outcome: outcomeRow._id,
    }).lean(),
  ]);

  const byStudent = Object.fromEntries(
    records.map((r) => [String(r.student), serializeAssessment(r)]),
  );

  return {
    academicYear: year,
    grade,
    subject: {
      id: String(subject._id),
      code: subject.code,
      titleEn: subject.titleEn,
      titleNe: subject.titleNe || '',
    },
    outcome: {
      id: String(outcomeRow._id),
      code: outcomeRow.code,
      themeEn: outcomeRow.themeEn || '',
      themeNe: outcomeRow.themeNe || '',
      titleEn: outcomeRow.titleEn || '',
      titleNe: outcomeRow.titleNe || '',
    },
    // Only students who take this subject (section / optional assignment).
    students: students.filter((student) => studentTakesSubject(subject, student)),
    records: byStudent,
    today: kathmanduToday(),
    canRecord: actor.role === 'SCHOOL_ADMIN',
  };
}

/**
 * Record one level — the initial assessment, or a reassessment if one already
 * exists. Runs in a transaction so the appended attempt and the recomputed
 * accepted level land together.
 */
export async function recordLevel(actor, input) {
  requireSchoolAdmin(actor);
  const data = attemptInput.parse(input);
  await connectDB();
  await ensureCasIndexes();

  const year = await loadAcademicYear(actor, data.academicYear);

  const outcome = await CasLearningOutcome.findOne({
    _id: data.outcome,
    school: actor.school,
    status: 'ACTIVE',
  }).lean();
  assert(outcome, 'Learning outcome unavailable', 404);

  // The student must genuinely be enrolled in this grade for this year — a
  // crafted request cannot assess a student from another school or grade.
  const student = await Student.findOne({
    _id: data.student,
    school: actor.school,
    isDeleted: { $ne: true },
    status: 'ACTIVE',
  })
    .select('name rollNumber enrollments')
    .lean();
  assert(student, 'Student unavailable', 404);

  const enrollment = (student.enrollments || []).find(
    (e) =>
      sameId(e.school, actor.school) &&
      e.grade === outcome.grade &&
      e.academicYearStart === year.yearStart,
  );
  assert(
    enrollment,
    `${student.name} is not enrolled in ${outcome.grade} for ${year.label}`,
    409,
  );

  return mongoose.connection.transaction(async (session) => {
    const scope = { school: actor.school, academicYear: year.id, student: student._id };
    const draftReports = await CasReport.find({ ...scope, status: 'DRAFT' }).session(session).lean();
    const existing = await CasAssessment.findOne({
      school: actor.school,
      academicYear: year.id,
      student: student._id,
      outcome: outcome._id,
    })
      .session(session)
      .lean();

    const attempts = existing?.attempts || [];
    assert(
      (existing?.revision ?? 0) === data.revision,
      'Someone else updated this result while you were working. Reload before saving.',
      409,
    );
    assert(attempts.length < 20, 'Maximum attempts reached for this outcome', 409);

    const isReassessment = attempts.length > 0;
    let assessmentDate;
    try {
      assessmentDate = validateAssessmentDate({
        value: data.assessmentDate || kathmanduToday(),
        academicYear: year,
        previousAttempt: attempts[attempts.length - 1],
      });
    } catch (error) {
      if (error instanceof CasDateError) {
        throw Object.assign(new Error(error.message), { status: 400 });
      }
      throw error;
    }

    const attempt = {
      attemptType: isReassessment ? 'REASSESSMENT' : 'INITIAL',
      attemptNumber: attempts.length + 1,
      level: data.level,
      assessmentDate,
      remarksEn: data.remarksEn,
      remarksNe: data.remarksNe,
      recordedBy: actor.id,
      recordedByName: actor.name,
      recordedAt: new Date(),
    };

    const acceptedLevel = getAcceptedLevel([...attempts, attempt]);

    if (draftReports.length) {
      const lock = await CasReport.updateMany(
        { ...scope, _id: { $in: draftReports.map((report) => report._id) }, status: 'DRAFT' },
        { $inc: { assessmentRevision: 1 } },
        { session },
      );
      assert(lock.matchedCount === draftReports.length, 'A report changed while saving. Reload and try again.', 409);
    }

    if (existing) {
      const saved = await CasAssessment.findOneAndUpdate(
        { ...scope, _id: existing._id, revision: data.revision },
        {
          $push: { attempts: attempt },
          $set: { acceptedLevel },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after', session, runValidators: true },
      ).lean();
      assert(saved, 'This result changed while saving. Reload and try again.', 409);
      return serializeAssessment(saved);
    }

    const [created] = await CasAssessment.create(
      [
        {
          school: actor.school,
          academicYear: year.id,
          grade: outcome.grade,
          student: student._id,
          // Snapshotted so a promoted student's old results still read as the
          // grade and roll number they held at the time.
          studentName: student.name,
          rollNumber: enrollment.rollNumber || student.rollNumber || '',
          subject: outcome.subject,
          subjectCode: outcome.subjectCode,
          outcome: outcome._id,
          outcomeCode: outcome.code,
          attempts: [attempt],
          acceptedLevel,
          revision: 1,
        },
      ],
      { session },
    );
    return serializeAssessment(created.toObject());
  });
}


export { REASSESSMENT_THRESHOLD };
