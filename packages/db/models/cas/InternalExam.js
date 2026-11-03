import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * A school's own written exam (First Terminal, Final, …) for one grade.
 *
 * Separate from CasExam on purpose: CAS assesses learning outcomes by theme
 * for Grades 1–5, this records plain marks for Grades 1–10. Grades 1–5 get a
 * report card from each.
 *
 * `fullMarks` is the school's default for every subject (50, 100, …);
 * `subjectFullMarks` overrides it per subject. Results are graded on the
 * percentage of full marks, so any choice grades on the same scale.
 */
const internalExamSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  grade: { type: String, required: true, trim: true },
  term: { type: String, enum: ['FIRST', 'SECOND', 'THIRD', 'FINAL'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  fullMarks: { type: Number, required: true, min: 1, max: 1000, default: 100 },
  passPercent: { type: Number, required: true, min: 0, max: 100, default: 35 },
  subjectFullMarks: {
    type: [{
      _id: false,
      subject: reqRefId('CasSubject'),
      fullMarks: { type: Number, required: true, min: 1, max: 1000 },
    }],
    default: [],
  },
  // B.S. issue date as typed on the report card, e.g. "2083-01-15".
  issueDate: { type: String, trim: true, maxlength: 10, default: '' },
  // Set while results are published; marks are locked until unpublished.
  publishedAt: { type: Date, default: null },
  publishedBy: refId('User'),
  createdBy: refId('User'),
}, casOptions);

internalExamSchema.index(
  { school: 1, academicYear: 1, grade: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
internalExamSchema.index({ school: 1, academicYear: 1, grade: 1, term: 1 });

export default mongoose.models.InternalExam || mongoose.model('InternalExam', internalExamSchema);
