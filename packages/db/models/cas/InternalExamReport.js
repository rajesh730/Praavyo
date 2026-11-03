import mongoose from 'mongoose';
import { casOptions, reqRefId, refId } from './casShared.js';

/**
 * A published internal-exam report card: a frozen `snapshot` of the marks as
 * they stood at publication, which parents and students read. Unpublishing
 * deletes these rows; the marks themselves stay in InternalExamMark.
 */
const internalExamReportSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  exam: reqRefId('InternalExam'),
  grade: { type: String, required: true, trim: true },
  student: reqRefId('Student'),
  examTerm: { type: String, enum: ['FIRST', 'SECOND', 'THIRD', 'FINAL'] },
  status: { type: String, enum: ['PUBLISHED'], default: 'PUBLISHED' },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  publishedBy: refId('User'),
  publishedAt: { type: Date, default: Date.now },
}, casOptions);

internalExamReportSchema.index({ exam: 1, student: 1 }, { unique: true });
// Parent and student dashboard read path, same shape as CasReport's.
internalExamReportSchema.index({ student: 1, status: 1, publishedAt: -1 });

export default mongoose.models.InternalExamReport || mongoose.model('InternalExamReport', internalExamReportSchema);
