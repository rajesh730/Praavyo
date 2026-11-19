import mongoose from 'mongoose';
import connectDB from '@pravyo/db';
import Student from '@pravyo/db/models/Student';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasStudentRecord from '@pravyo/db/models/cas/CasStudentRecord';
import CasExam from '@pravyo/db/models/cas/CasExam';
import ensureCasIndexes from './casIndexes.js';
import { assert, requireSchoolAdmin, sameId } from './casAccess.js';
import {
  studentRecordInput,
  studentRecordQuery,
  studentRecordsInput,
  studentRecordsQuery,
} from './casValidation.js';
import { loadAcademicYear, loadGradeSections, loadStudents } from './casContext.js';
import {
  normalizeAttendance,
  normalizeExtraActivities,
} from '@pravyo/core/casSupplementary';

const reportScope = (actor, year, student) => ({
  school: actor.school,
  academicYear: year.id,
  student,
});

// A record belongs to one exam; `exam: null` is the whole-year record (and
// also matches records saved before attendance was kept per exam).
const recordScope = (actor, year, student, exam = null) => ({
  ...reportScope(actor, year, student),
  exam: exam || null,
});

async function loadRecordExam(actor, year, examId) {
  if (!examId) return null;
  const exam = await CasExam.findOne({
    _id: examId,
    school: actor.school,
    academicYear: year.id,
    mergedInto: { $exists: false },
  })
    .select('name')
    .lean();
  assert(exam, 'Exam unavailable for this academic year', 404);
  return { id: String(exam._id), name: exam.name };
}

async function studentAndEnrollment(actor, data, year, session = null) {
  const student = await Student.findOne({
    _id: data.student,
    school: actor.school,
    isDeleted: { $ne: true },
    status: 'ACTIVE',
  })
    .select('name rollNumber section enrollments')
    .session(session)
    .lean();
  assert(student, 'Student unavailable', 404);

  const enrollment = (student.enrollments || []).find(
    (entry) =>
      sameId(entry.school, actor.school) &&
      entry.grade === data.grade &&
      entry.academicYearStart === year.yearStart,
  );
  assert(enrollment, `${student.name} is not enrolled in ${data.grade} for ${year.label}`, 409);
  // A section counts only when the school has configured it for this grade.
  const raw = String(enrollment.section || student.section || '').trim();
  const section = raw && (await loadGradeSections(actor, data.grade)).includes(raw) ? raw : '';
  return { student: { ...student, section }, enrollment: { ...enrollment, section } };
}

function serializeRecord({ actor, data, year, student, enrollment, record, locked }) {
  return {
    year,
    grade: data.grade,
    student: {
      id: String(student._id),
      name: student.name,
      rollNumber: enrollment.rollNumber || student.rollNumber || '',
      section: enrollment.section || student.section || '',
    },
    attendance: normalizeAttendance(record?.attendance),
    extraActivities: normalizeExtraActivities(record?.extraActivities),
    revision: record?.revision ?? 0,
    locked,
    canRecord: actor.role === 'SCHOOL_ADMIN',
  };
}

function serializeRosterRecord({ actor, data, year, student, record, locked }) {
  return {
    year,
    grade: data.grade,
    student: {
      id: student.id,
      name: student.name,
      rollNumber: student.rollNumber || '',
      section: student.section || '',
    },
    attendance: normalizeAttendance(record?.attendance),
    extraActivities: normalizeExtraActivities(record?.extraActivities),
    revision: record?.revision ?? 0,
    locked,
    canRecord: actor.role === 'SCHOOL_ADMIN',
  };
}

function recordIsEmpty(attendance, extraActivities) {
  return (
    attendance.workingDays == null &&
    attendance.presentDays == null &&
    attendance.absentDays == null &&
    Object.values(extraActivities).every((value) => !String(value || '').trim())
  );
}

// Extra activities are entered once per exam: after a student's are saved,
// they are shown read-only and a save may not change them.
function assertActivitiesUnchanged(record, extraActivities, name) {
  const saved = normalizeExtraActivities(record?.extraActivities);
  if (Object.values(saved).every((value) => !String(value || '').trim())) return;
  assert(
    JSON.stringify(saved) === JSON.stringify(extraActivities),
    `${name}'s extra activities are already saved for this exam and cannot be changed.`,
    409,
  );
}

function recordChanged(record, attendance, extraActivities) {
  if (!record) return !recordIsEmpty(attendance, extraActivities);
  return (
    JSON.stringify(attendance) !== JSON.stringify(normalizeAttendance(record.attendance)) ||
    JSON.stringify(extraActivities) !==
      JSON.stringify(normalizeExtraActivities(record.extraActivities))
  );
}

export async function loadStudentRecord(actor, input) {
  requireSchoolAdmin(actor);
  const data = studentRecordQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const { student, enrollment } = await studentAndEnrollment(actor, data, year);
  const record = await CasStudentRecord.findOne(recordScope(actor, year, student._id)).lean();

  return serializeRecord({
    actor,
    data,
    year,
    student,
    enrollment,
    record,
    locked: false,
  });
}

export async function loadStudentRecords(actor, input) {
  requireSchoolAdmin(actor);
  const data = studentRecordsQuery.parse(input);
  await connectDB();
  const [year, sections] = await Promise.all([
    loadAcademicYear(actor, data.academicYear),
    loadGradeSections(actor, data.grade),
  ]);
  const exam = await loadRecordExam(actor, year, data.exam);
  const roster = await loadStudents(actor, {
    grade: data.grade,
    yearStart: year.yearStart,
  });
  const visibleRoster = data.section
    ? roster.filter((student) => student.section === data.section)
    : roster;
  const studentIds = visibleRoster.map((student) => student.id);
  const records = studentIds.length
    ? await CasStudentRecord.find({
        school: actor.school,
        academicYear: year.id,
        grade: data.grade,
        student: { $in: studentIds },
        exam: exam?.id || null,
      }).lean()
    : [];
  const recordByStudent = new Map(records.map((record) => [String(record.student), record]));

  return {
    year,
    grade: data.grade,
    section: data.section || '',
    sections,
    exam,
    canRecord: actor.role === 'SCHOOL_ADMIN',
    students: visibleRoster.map((student) =>
      serializeRosterRecord({
        actor,
        data,
        year,
        student,
        record: recordByStudent.get(student.id),
        locked: false,
      }),
    ),
  };
}

export async function saveStudentRecord(actor, input) {
  requireSchoolAdmin(actor);
  const data = studentRecordInput.parse(input);
  await connectDB();
  await ensureCasIndexes();
  const year = await loadAcademicYear(actor, data.academicYear);

  return mongoose.connection.transaction(async (session) => {
    const { student, enrollment } = await studentAndEnrollment(actor, data, year, session);
    const scope = reportScope(actor, year, student._id);
    // One after the other: operations in a transaction share its session and
    // must not run concurrently, or a replica set rejects the transaction.
    const record = await CasStudentRecord.findOne(recordScope(actor, year, student._id)).session(session).lean();
    const draftReports = await CasReport.find({ ...scope, status: 'DRAFT' }).session(session).lean();

    const revision = record?.revision ?? 0;
    assert(
      revision === data.revision,
      'Someone else updated this student record while you were working. Reload before saving.',
      409,
    );

    const attendance = normalizeAttendance(data.attendance);
    const extraActivities = normalizeExtraActivities(data.extraActivities);
    assertActivitiesUnchanged(record, extraActivities, student.name);
    const changed = recordChanged(record, attendance, extraActivities);

    if (!changed) {
      return {
        saved: 0,
        record: serializeRecord({
          actor,
          data,
          year,
          student,
          enrollment,
          record,
          locked: false,
        }),
      };
    }

    if (draftReports.length) {
      const lock = await CasReport.updateMany(
        {
          ...scope,
          _id: { $in: draftReports.map((report) => report._id) },
          status: 'DRAFT',
        },
        { $inc: { assessmentRevision: 1 } },
        { session },
      );
      assert(lock.matchedCount === draftReports.length, 'A report changed while saving. Reload before saving.', 409);
    }

    const payload = {
      grade: data.grade,
      studentName: student.name,
      rollNumber: enrollment.rollNumber || student.rollNumber || '',
      section: enrollment.section || student.section || '',
      attendance,
      extraActivities,
      recordedBy: actor.id,
      recordedByName: actor.name,
    };

    let saved;
    if (record) {
      saved = await CasStudentRecord.findOneAndUpdate(
        { ...scope, _id: record._id, ...recordRevisionFilter(record) },
        { $set: payload, $inc: { revision: 1 } },
        { returnDocument: 'after', runValidators: true, session },
      ).lean();
      assert(saved, 'This student record changed while saving. Reload before saving.', 409);
    } else {
      const [created] = await CasStudentRecord.create(
        [
          {
            ...recordScope(actor, year, student._id),
            ...payload,
            revision: 1,
          },
        ],
        { session },
      );
      saved = created.toObject();
    }

    return {
      saved: 1,
      record: serializeRecord({
        actor,
        data,
        year,
        student,
        enrollment,
        record: saved,
        locked: false,
      }),
    };
  });
}

export async function saveStudentRecords(actor, input) {
  requireSchoolAdmin(actor);
  const data = studentRecordsInput.parse(input);
  await connectDB();
  await ensureCasIndexes();
  const [year, sections] = await Promise.all([
    loadAcademicYear(actor, data.academicYear),
    loadGradeSections(actor, data.grade),
  ]);
  assert(!data.section || sections.includes(data.section), 'Choose a section configured for this grade', 400);
  const exam = await loadRecordExam(actor, year, data.exam);

  return mongoose.connection.transaction(async (session) => {
    const roster = await loadStudents(actor, {
      grade: data.grade,
      yearStart: year.yearStart,
    });
    const rosterById = new Map(roster.map((student) => [student.id, student]));
    const studentIds = data.rows.map((row) => row.student);
    // Sequential for the same reason as saveStudentRecord: a transaction's
    // operations must not run concurrently on its session.
    const records = await CasStudentRecord.find({
      school: actor.school,
      academicYear: year.id,
      grade: data.grade,
      student: { $in: studentIds },
      exam: exam?.id || null,
    }).session(session).lean();
    const draftReports = await CasReport.find({
      school: actor.school,
      academicYear: year.id,
      student: { $in: studentIds },
      status: 'DRAFT',
    }).session(session).lean();
    const recordsByStudent = new Map(records.map((record) => [String(record.student), record]));
    const reportsByStudent = new Map();
    for (const report of draftReports) {
      const key = String(report.student);
      if (!reportsByStudent.has(key)) reportsByStudent.set(key, []);
      reportsByStudent.get(key).push(report);
    }
    const savedRows = new Map();
    let saved = 0;

    for (const row of data.rows) {
      const student = rosterById.get(row.student);
      assert(student, 'Every student must belong to the selected grade and academic year', 409);
      assert(
        !data.section || student.section === data.section,
        `${student.name} is not in the selected section`,
        409,
      );

      const scope = reportScope(actor, year, student.id);
      const record = recordsByStudent.get(student.id);
      const revision = record?.revision ?? 0;
      const attendance = normalizeAttendance(row.attendance);
      const extraActivities = normalizeExtraActivities(row.extraActivities);
      assertActivitiesUnchanged(record, extraActivities, student.name);
      const changed = recordChanged(record, attendance, extraActivities);

      if (!changed) {
        savedRows.set(
          student.id,
          serializeRosterRecord({
            actor,
            data,
            year,
            student,
            record,
            locked: false,
          }),
        );
        continue;
      }

      assert(
        revision === row.revision,
        `${student.name}'s record changed while you were working. Reload before saving.`,
        409,
      );

      const reports = reportsByStudent.get(student.id) || [];
      if (reports.length) {
        const lock = await CasReport.updateMany(
          { ...scope, _id: { $in: reports.map((report) => report._id) }, status: 'DRAFT' },
          { $inc: { assessmentRevision: 1 } },
          { session },
        );
        assert(lock.matchedCount === reports.length, 'A report changed while saving. Reload before saving.', 409);
      }

      const payload = {
        grade: data.grade,
        studentName: student.name,
        rollNumber: student.rollNumber || '',
        section: student.section || '',
        attendance,
        extraActivities,
        recordedBy: actor.id,
        recordedByName: actor.name,
      };

      let savedRecord;
      if (record) {
        savedRecord = await CasStudentRecord.findOneAndUpdate(
          { ...scope, _id: record._id, ...recordRevisionFilter(record) },
          { $set: payload, $inc: { revision: 1 } },
          { returnDocument: 'after', runValidators: true, session },
        ).lean();
        assert(savedRecord, `${student.name}'s record changed while saving. Reload before saving.`, 409);
      } else {
        const [created] = await CasStudentRecord.create(
          [
            {
              ...recordScope(actor, year, student.id, exam?.id),
              ...payload,
              revision: 1,
            },
          ],
          { session },
        );
        savedRecord = created.toObject();
      }

      saved += 1;
      recordsByStudent.set(student.id, savedRecord);
      savedRows.set(
        student.id,
        serializeRosterRecord({
          actor,
          data,
          year,
          student,
          record: savedRecord,
          locked: false,
        }),
      );
    }

    const visibleRoster = data.section
      ? roster.filter((student) => student.section === data.section)
      : roster;

    return {
      saved,
      table: {
        year,
        grade: data.grade,
        section: data.section || '',
        sections,
        exam,
        canRecord: actor.role === 'SCHOOL_ADMIN',
        students: visibleRoster.map((student) =>
          savedRows.get(student.id) ||
          serializeRosterRecord({
            actor,
            data,
            year,
            student,
            record: recordsByStudent.get(student.id),
            locked: false,
          }),
        ),
      },
    };
  });
}

function recordRevisionFilter(row) {
  return row.revision == null ? { revision: { $exists: false } } : { revision: row.revision };
}
