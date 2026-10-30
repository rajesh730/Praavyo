import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * A student's report for one academic year.
 *
 * Holds a `snapshot` — school identity, student identity and subject results as
 * they stood at publication. Parents are shown that snapshot rather than a live
 * recomputation, so a report a guardian has already read does not silently
 * change when a teacher records the next outcome.
 *
 * This is the one collection the Pravyo parent and student dashboards read.
 * Results are never copied into a second database.
 */
const casReportSchema = new mongoose.Schema(
  {
    school: reqRefId('User'),
    academicYear: reqRefId('AcademicYear'),
    grade: { type: String, required: true, trim: true },
    student: reqRefId('Student'),
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'CasExam', default: null },
    resultKey: { type: String, default: '', trim: true },
    resultMode: { type: String, enum: ['EXAM', 'MERGED'], default: 'EXAM' },
    includePrevious: { type: Boolean, default: false },
    // The exact CasThemeExam rows selected for this report. Optional so all
    // historical reports retain their original scope unchanged.
    themeAssignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CasThemeExam' }],
    examTerm: {
      type: String,
      enum: ['FIRST', 'SECOND', 'THIRD', 'FINAL'],
      index: true,
    },

    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED'],
      default: 'DRAFT',
      index: true,
    },

    format: {
      type: String,
      enum: ['CLASSIC', 'MODERN'],
      default: 'CLASSIC',
      index: true,
    },

    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },

    // Changes after report generation require a fresh snapshot before publish.
    assessmentRevision: { type: Number, default: 0 },
    generatedAssessmentRevision: { type: Number, default: 0 },

    generatedBy: refId('User'),
    generatedAt: { type: Date, default: Date.now },
    publishedBy: refId('User'),
    publishedAt: { type: Date, default: null },
    // Set once guardians have been told, so a republish cannot spam them.
    notifiedAt: { type: Date, default: null },
  },
  casOptions,
);

casReportSchema.index({ school: 1, academicYear: 1, student: 1, resultKey: 1 }, { unique: true, sparse: true });
// Parent and student dashboard read path.
casReportSchema.index({ student: 1, status: 1, publishedAt: -1 });
casReportSchema.index({ school: 1, academicYear: 1, grade: 1, examTerm: 1, status: 1 });

export default mongoose.models.CasReport ||
  mongoose.model('CasReport', casReportSchema);
