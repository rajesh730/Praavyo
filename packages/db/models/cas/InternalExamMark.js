import mongoose from 'mongoose';
import { casOptions, reqRefId } from './casShared.js';

/**
 * One student's marks in one subject of an internal exam. A missing row means
 * "not entered yet"; `absent` means the student sat out and scores 0.
 *
 * `theory` is the TH mark; `internal` holds each internal assessment field's
 * mark by the field's stable id (or `INT` when the subject has no fields).
 * A blank stays absent from the row — it is never stored as 0. `total` is
 * worked out by the server when every part is in, else null; nobody types it.
 * Rows saved before the TH/INT split carry only `marks` (a theory mark).
 *
 * `enteredBy` is a User (school admin) or a Teacher id, so it carries no ref.
 */
const internalExamMarkSchema = new mongoose.Schema({
  school: reqRefId('User'),
  exam: reqRefId('InternalExam'),
  student: reqRefId('Student'),
  subject: reqRefId('CasSubject'),
  marks: { type: Number, min: 0, max: 1000, default: undefined },
  theory: { type: Number, min: 0, max: 1000, default: null },
  internal: { type: Map, of: { type: Number, min: 0, max: 1000 }, default: () => new Map() },
  total: { type: Number, min: 0, max: 1000, default: null },
  absent: { type: Boolean, default: false },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  enteredByRole: { type: String, enum: ['SCHOOL_ADMIN', 'TEACHER'], required: true },
  // The values before each change, newest last (kept short).
  revisions: {
    type: [{
      _id: false,
      at: Date,
      by: mongoose.Schema.Types.ObjectId,
      byRole: String,
      theory: Number,
      internal: mongoose.Schema.Types.Mixed,
      absent: Boolean,
    }],
    default: [],
  },
}, casOptions);

internalExamMarkSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });
internalExamMarkSchema.index({ school: 1, exam: 1 });

export default mongoose.models.InternalExamMark || mongoose.model('InternalExamMark', internalExamMarkSchema);
