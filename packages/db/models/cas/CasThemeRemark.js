import mongoose from 'mongoose';
import { casOptions, reqRefId } from './casShared.js';

/**
 * One remark per student, theme and exam on the CAS book page. Replaced the
 * per-outcome remarks (CasAssessment.sheetRemarks), which were too slow for
 * teachers to fill in; those old values stay on the assessment records.
 */
const casThemeRemarkSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  exam: reqRefId('CasExam'),
  grade: { type: String, required: true, trim: true },
  subject: reqRefId('CasSubject'),
  themeKey: { type: String, required: true, trim: true, maxlength: 401 },
  student: reqRefId('Student'),
  remarks: { type: String, default: '', trim: true, maxlength: 1000 },
  revision: { type: Number, default: 1, min: 0 },
  updatedByModel: { type: String, enum: ['User', 'Teacher'] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'updatedByModel' },
  updatedByName: { type: String, default: '', trim: true },
}, casOptions);

casThemeRemarkSchema.index(
  { school: 1, academicYear: 1, exam: 1, grade: 1, subject: 1, themeKey: 1, student: 1 },
  { unique: true },
);

export default mongoose.models.CasThemeRemark || mongoose.model('CasThemeRemark', casThemeRemarkSchema);
