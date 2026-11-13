import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

const casExamSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  grade: { type: String, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // These belong to the exam, so every class publishes with one approved
  // title and issue date rather than choosing them separately per result run.
  reportTitle: { type: String, trim: true, maxlength: 120, default: '' },
  issueDate: { type: String, trim: true, maxlength: 10, default: '' },
  status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' },
  // The exam running now or coming next, chosen in Manage Exams. At most one
  // per school and academic year; every exam picker opens on it.
  isCurrent: { type: Boolean, default: false },
  // What "Publish anyway" does with work never assessed, chosen by the school
  // in Manage Exams. ABSENT: a subject with nothing assessed is printed as
  // "Not attended exam" and left out of the GPA. DEFAULT_LEVEL: every missing
  // learning outcome is scored `missingWorkLevel` (0 = no marks, 1–4 = level).
  missingWork: { type: String, enum: ['ABSENT', 'DEFAULT_LEVEL'], default: 'ABSENT' },
  missingWorkLevel: { type: Number, min: 0, max: 4, default: 0 },
  isAlias: { type: Boolean, default: false },
  mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'CasExam' },
  createdBy: refId('User'),
}, casOptions);

casExamSchema.index(
  { school: 1, academicYear: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 }, partialFilterExpression: { isAlias: false } },
);
casExamSchema.index({ school: 1, academicYear: 1, status: 1 });

export default mongoose.models.CasExam || mongoose.model('CasExam', casExamSchema);
