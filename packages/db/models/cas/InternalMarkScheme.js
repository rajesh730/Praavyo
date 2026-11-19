import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * A grade's internal-exam marks structure, set by the school in Manage Exams
 * and used by EVERY internal exam of that grade (First, Second, Third
 * Terminal, Final, board…): the theory/internal split and the school's own
 * internal assessment fields. Rules: @pravyo/core/internalMarkScheme.
 *
 * `default` covers every subject; `subjects` holds per-subject overrides
 * (e.g. Computer with a Practical field). An exam copies the structure it
 * used onto itself when published (InternalExam.markScheme), so later edits
 * here never change a published result.
 */
const fieldSchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-z0-9]{4,24}$/ },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  fullMarks: { type: Number, required: true, min: 0.01, max: 1000 },
}, { _id: false });

export const markStructureSchema = new mongoose.Schema({
  theoryFullMarks: { type: Number, required: true, min: 0, max: 1000 },
  internalFullMarks: { type: Number, required: true, min: 0, max: 1000 },
  fields: { type: [fieldSchema], default: [] },
}, { _id: false });

const internalMarkSchemeSchema = new mongoose.Schema({
  school: reqRefId('User'),
  grade: { type: String, required: true, trim: true },
  default: { type: markStructureSchema, required: true },
  subjects: {
    type: [{
      _id: false,
      subject: reqRefId('CasSubject'),
      structure: { type: markStructureSchema, required: true },
    }],
    default: [],
  },
  // Theory and internal must each reach the pass percentage (failing either = NG).
  passEachPart: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
  updatedBy: refId('User'),
  // The previous versions, newest last (kept short): who changed what, when.
  history: {
    type: [{
      _id: false,
      revision: Number,
      savedAt: Date,
      savedBy: refId('User'),
      default: mongoose.Schema.Types.Mixed,
      subjects: mongoose.Schema.Types.Mixed,
      passEachPart: Boolean,
    }],
    default: [],
  },
}, casOptions);

internalMarkSchemeSchema.index({ school: 1, grade: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.models.InternalMarkScheme || mongoose.model('InternalMarkScheme', internalMarkSchemeSchema);
