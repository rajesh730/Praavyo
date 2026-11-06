import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

const dayCount = { type: Number, default: null, min: 0, max: 400 };
const grade = { type: String, default: '', trim: true, maxlength: 20 };

/**
 * Attendance and extra activities for one student in one internal exam,
 * printed on that exam's report card (the Modern format).
 *
 * These belong to the internal exam only. CAS (Grades 1–5, theme assessment)
 * does not collect them; its older per-CasExam values stay in
 * CasStudentRecord, untouched and unused by the CAS card.
 *
 * Publishing snapshots these into InternalExamReport; while the exam is
 * published they are locked, like the marks.
 */
const internalExamRecordSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  exam: reqRefId('InternalExam'),
  grade: { type: String, required: true, trim: true },
  student: reqRefId('Student'),
  studentName: { type: String, required: true, trim: true },

  attendance: {
    workingDays: dayCount,
    presentDays: dayCount,
    absentDays: dayCount,
  },

  extraActivities: {
    discipline: grade,
    personalHygiene: grade,
    classWork: grade,
    homeWork: grade,
    eca: grade,
    artCraft: grade,
    handwriting: grade,
    projectPresentation: grade,
  },

  recordedBy: refId('User'),
  recordedByName: { type: String, default: '', trim: true },
  // Optimistic concurrency for the attendance/activities form.
  revision: { type: Number, default: 0 },
}, casOptions);

internalExamRecordSchema.index({ exam: 1, student: 1 }, { unique: true });
internalExamRecordSchema.index({ school: 1, exam: 1 });

export default mongoose.models.InternalExamRecord || mongoose.model('InternalExamRecord', internalExamRecordSchema);
