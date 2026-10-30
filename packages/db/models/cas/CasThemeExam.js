import mongoose from 'mongoose';
import { casOptions, reqRefId } from './casShared.js';

const casThemeExamSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  grade: { type: String, required: true, trim: true },
  subject: reqRefId('CasSubject'),
  themeKey: { type: String, required: true, trim: true, maxlength: 401 },
  exam: reqRefId('CasExam'),
}, casOptions);

casThemeExamSchema.index(
  { school: 1, academicYear: 1, grade: 1, subject: 1, themeKey: 1, exam: 1 },
  { unique: true },
);
casThemeExamSchema.index({ school: 1, academicYear: 1, grade: 1, exam: 1 });

export default mongoose.models.CasThemeExam || mongoose.model('CasThemeExam', casThemeExamSchema);
