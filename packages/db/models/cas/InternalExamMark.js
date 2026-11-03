import mongoose from 'mongoose';
import { casOptions, reqRefId } from './casShared.js';

/**
 * One student's mark in one subject of an internal exam. A missing row means
 * "not entered yet"; `absent` means the student sat out and scores 0.
 *
 * `enteredBy` is a User (school admin) or a Teacher id, so it carries no ref.
 */
const internalExamMarkSchema = new mongoose.Schema({
  school: reqRefId('User'),
  exam: reqRefId('InternalExam'),
  student: reqRefId('Student'),
  subject: reqRefId('CasSubject'),
  marks: { type: Number, min: 0, max: 1000, default: null },
  absent: { type: Boolean, default: false },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  enteredByRole: { type: String, enum: ['SCHOOL_ADMIN', 'TEACHER'], required: true },
}, casOptions);

internalExamMarkSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });
internalExamMarkSchema.index({ school: 1, exam: 1 });

export default mongoose.models.InternalExamMark || mongoose.model('InternalExamMark', internalExamMarkSchema);
