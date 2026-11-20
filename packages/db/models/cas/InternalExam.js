import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';
import { markStructureSchema } from './InternalMarkScheme.js';

/**
 * One grade's copy of a school's own written exam (First Terminal, Final, …).
 * The school creates an exam once and every grade gets a copy with the same
 * academic year + name (see internalExamService); each copy holds that
 * grade's publishing, lock and pinned structure.
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
  // The school types its own exam name (owner, 2026-11-20): internal exams
  // have no fixed term list and share nothing with CAS's exam terms. `term`
  // is kept only on exams created before that; nothing reads it.
  term: { type: String, enum: ['FIRST', 'SECOND', 'THIRD', 'FINAL'] },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // The heading printed at the top of the report card ("First Terminal
  // Examination 2083"). Empty = the exam name. Internal only, like CAS's own.
  reportTitle: { type: String, trim: true, maxlength: 120, default: '' },
  fullMarks: { type: Number, required: true, min: 1, max: 1000, default: 100 },
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
  // The marks structure this exam's results were published with, per subject
  // (see InternalMarkScheme). Set on first publish and kept after an
  // unpublish, so corrections and republishing use the same structure.
  // null = follow the grade's current structure. The school can switch a
  // pinned, unpublished exam back to the current structure in Manage Exams.
  markScheme: {
    type: new mongoose.Schema({
      subjects: {
        type: [{ _id: false, subject: reqRefId('CasSubject'), structure: { type: markStructureSchema, required: true } }],
        default: [],
      },
    }, { _id: false }),
    default: null,
  },
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

// A dev server that loaded the model before `reportTitle` (or with `term`
// still required) keeps that stale copy across hot reloads and refuses the
// new field; drop it so the current schema is registered.
const cached = mongoose.models.InternalExam;
if (cached && (!cached.schema.path('reportTitle') || cached.schema.path('term')?.isRequired)) {
  delete mongoose.models.InternalExam;
}

export default mongoose.models.InternalExam || mongoose.model('InternalExam', internalExamSchema);
