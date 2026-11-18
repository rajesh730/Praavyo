import mongoose from 'mongoose';
import { casOptions, dayField, levelField, reqRefId } from './casShared.js';

/**
 * One student's record for one learning outcome in one academic year.
 *
 * Two things are recorded: the INITIAL level, and a REASSESSMENT if the initial
 * level came out below 3. Both are kept — a reassessment never overwrites the
 * first result — and `acceptedLevel` is the highest level reached, so a weaker
 * second attempt can never cost a student the level they already demonstrated.
 *
 * Student name, grade and roll number are snapshotted here on purpose. A
 * student promoted to Grade 6 still has Grade 5 results, and those must keep
 * reporting as Grade 5 rather than following the live Student document.
 */
const attemptSchema = new mongoose.Schema(
  {
    _id: false,
    attemptType: { type: String, enum: ['INITIAL', 'REASSESSMENT'], required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    level: { ...levelField, required: true },
    assessmentDate: { ...dayField, required: true },
    remarksEn: { type: String, default: '', trim: true, maxlength: 1000 },
    remarksNe: { type: String, default: '', trim: true, maxlength: 1000 },
    // A school administrator is a User; a teacher is a Teacher record. Keep
    // the model alongside the id so audit history never points a teacher id at
    // the wrong collection.
    recordedByModel: { type: String, enum: ['User', 'Teacher'], default: 'User' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'recordedByModel' },
    recordedByName: { type: String, default: '', trim: true },
    recordedAt: { type: Date, default: Date.now },

    /**
     * Superseded values for THIS attempt, oldest first.
     *
     * A correction is not a reassessment. A reassessment is a second try; it
     * may raise the accepted level, while a weaker try leaves the accepted
     * result on the previous best score. A correction says the mark was
     * mistyped and was never earned, so it must be able to lower it. The mark
     * that was replaced is kept here rather than vanishing — a changed result
     * on a child's record has to stay auditable.
     *
     * Only writable while the report is still a draft.
     */
    revisions: {
      type: [
        {
          _id: false,
          level: { ...levelField, required: true },
          assessmentDate: { ...dayField },
          correctedAt: { type: Date, default: Date.now },
          correctedByModel: { type: String, enum: ['User', 'Teacher'], default: 'User' },
          correctedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'correctedByModel' },
          correctedByName: { type: String, default: '', trim: true },
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const casAssessmentSchema = new mongoose.Schema(
  {
    school: reqRefId('User'),
    academicYear: reqRefId('AcademicYear'),
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'CasExam', default: null },
    grade: { type: String, required: true, trim: true },

    student: reqRefId('Student'),
    studentName: { type: String, required: true, trim: true },
    rollNumber: { type: String, default: '', trim: true },

    subject: reqRefId('CasSubject'),
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    outcome: reqRefId('CasLearningOutcome'),
    outcomeCode: { type: String, required: true, trim: true, uppercase: true },

    attempts: { type: [attemptSchema], default: [] },

    // Attempts cleared before publishing (a mistaken score), kept for audit.
    // Never counted in results.
    removedAttempts: {
      type: [
        new mongoose.Schema(
          {
            ...attemptSchema.obj,
            removedAt: { type: Date, default: Date.now },
            removedByModel: { type: String, enum: ['User', 'Teacher'], default: 'User' },
            removedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'removedByModel' },
            removedByName: { type: String, default: '', trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    // Current book-page note; original attempt remarks remain historical.
    sheetRemarks: { type: String, trim: true, maxlength: 1000 },

    // Derived from attempts by the domain function; cached so the dashboard and
    // reports can query without replaying every attempt.
    // null = not assessed (every score cleared before publishing).
    acceptedLevel: {
      ...levelField,
      default: null,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: 'Achievement level must be a whole number from 1 to 4',
      },
    },

    // Optimistic concurrency: increases once for each saved record change.
    revision: { type: Number, default: 0 },
  },
  casOptions,
);

// One record per student per outcome per year.
casAssessmentSchema.index(
  { academicYear: 1, student: 1, outcome: 1, exam: 1 },
  { unique: true, partialFilterExpression: { exam: { $type: 'objectId' } } },
);
casAssessmentSchema.index({ school: 1, academicYear: 1, grade: 1, subjectCode: 1 });
casAssessmentSchema.index({ school: 1, academicYear: 1, acceptedLevel: 1 });
casAssessmentSchema.index({ student: 1, academicYear: 1 });

export default mongoose.models.CasAssessment ||
  mongoose.model('CasAssessment', casAssessmentSchema);
