import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

const dayCount = { type: Number, default: null, min: 0, max: 400 };

const extraActivitySchema = {
  discipline: { type: String, default: '', trim: true, maxlength: 20 },
  personalHygiene: { type: String, default: '', trim: true, maxlength: 20 },
  classWork: { type: String, default: '', trim: true, maxlength: 20 },
  homeWork: { type: String, default: '', trim: true, maxlength: 20 },
  eca: { type: String, default: '', trim: true, maxlength: 20 },
  artCraft: { type: String, default: '', trim: true, maxlength: 20 },
  handwriting: { type: String, default: '', trim: true, maxlength: 20 },
  projectPresentation: { type: String, default: '', trim: true, maxlength: 20 },
};

/**
 * Attendance and extra-activity values for one student's CAS report.
 *
 * One record per exam: each terminal exam has its own working days and the
 * student's own present days, printed on that exam's report card. A record
 * with no exam belongs to the whole-year (merged) result.
 *
 * Academic evidence stays in CasAssessment. This record holds the small
 * report-card fields that are not tied to a subject outcome, then report
 * generation snapshots them into CasReport alongside the academic result.
 */
const casStudentRecordSchema = new mongoose.Schema(
  {
    school: reqRefId('User'),
    academicYear: reqRefId('AcademicYear'),
    grade: { type: String, required: true, trim: true },

    student: reqRefId('Student'),
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'CasExam', default: null },
    studentName: { type: String, required: true, trim: true },
    rollNumber: { type: String, default: '', trim: true },
    section: { type: String, default: '', trim: true, maxlength: 60 },

    attendance: {
      workingDays: dayCount,
      presentDays: dayCount,
      absentDays: dayCount,
    },

    extraActivities: extraActivitySchema,

    recordedBy: refId('User'),
    recordedByName: { type: String, default: '', trim: true },

    // Optimistic concurrency for the attendance/ECA form.
    revision: { type: Number, default: 0 },
  },
  casOptions,
);

casStudentRecordSchema.index({ academicYear: 1, student: 1, exam: 1 }, { unique: true });
casStudentRecordSchema.index({ school: 1, academicYear: 1, grade: 1 });

export default mongoose.models.CasStudentRecord ||
  mongoose.model('CasStudentRecord', casStudentRecordSchema);
