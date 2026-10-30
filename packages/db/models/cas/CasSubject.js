import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * A subject a grade is assessed on — Computer, Mathematics, नेपाली.
 *
 * Owned by the school and edited only from the Curriculum screen. There is no
 * class or section here: assessment is scoped to a grade, which is the only
 * grouping Pravyo enrolment records actually carry.
 */
const casSubjectSchema = new mongoose.Schema(
  {
    school: reqRefId('User'),
    grade: { type: String, required: true, trim: true },

    // Stable identifier used by assessments and reports.
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    titleEn: { type: String, required: true, trim: true, maxlength: 120 },
    titleNe: { type: String, default: '', trim: true, maxlength: 120 },

    // Display order on the Curriculum and report screens.
    sequence: { type: Number, default: 1, min: 1 },

    /**
     * Editable chapter/theme list for the subject.
     *
     * Older rows only stored theme labels on each outcome. Keeping this list
     * inside the subject lets a school create an empty theme before adding
     * rows, rename a theme once, and archive a theme without inventing another
     * top-level collection for a small school-admin workflow.
     */
    themes: {
      type: [
        {
          _id: false,
          key: { type: String, required: true, trim: true, maxlength: 401 },
          titleEn: { type: String, default: '', trim: true, maxlength: 200 },
          titleNe: { type: String, default: '', trim: true, maxlength: 200 },
          workingHours: { type: Number, default: null, min: 0, max: 500 },
          sequence: { type: Number, default: 1, min: 1 },
          status: {
            type: String,
            enum: ['ACTIVE', 'ARCHIVED'],
            default: 'ACTIVE',
          },
          // Retained only to preserve legacy stored values; exam assignments
          // are now the sole assessment gate and these fields are never read.
          assessmentStatus: {
            type: String,
            enum: ['DRAFT', 'PUBLISHED'],
            default: undefined,
          },
          publishedAt: { type: Date, default: undefined },
          // Set when the theme was copied from the default theme library.
          // `sourceHash` is the library content at copy time: a different
          // library hash means "update available", a different hash of the
          // school's own copy means the school edited it. Themes a school
          // creates itself have no source and are never touched by updates.
          sourceThemeKey: { type: String, default: undefined, trim: true, maxlength: 401 },
          sourceHash: { type: String, default: undefined, trim: true, maxlength: 64 },
        },
      ],
      default: [],
    },

    /**
     * Credit hours, as printed on the school's grade sheet — Nepali 5,
     * English 4, Mathematics 4, Our Surrounding 8, Local Subject 5. One credit
     * hour is 32 working hours.
     *
     * The GPA is weighted by this, so a subject carrying twice the teaching
     * time counts twice. Null means the subject is excluded from the GPA
     * rather than silently weighted as zero.
     */
    creditHours: { type: Number, default: null, min: 0, max: 40 },

    /**
     * This collection is the school's single subject register, for daily
     * teaching and for CAS. A subject can be taught without being examined
     * (Moral Education, Music); only `examined` subjects appear in CAS.
     * Rows created before these fields existed read as taught + examined.
     */
    taught: { type: Boolean, default: true },
    examined: { type: Boolean, default: true },
    // OPTIONAL subjects share a group ("Optional I": Computer / Accounts) and
    // the school assigns each student one subject per group.
    kind: { type: String, enum: ['COMPULSORY', 'OPTIONAL'], default: 'COMPULSORY' },
    optionalGroup: { type: String, default: '', trim: true, maxlength: 60 },
    // Empty means every section of the grade takes it.
    sections: { type: [String], default: [] },

    // The default-library subject this school subject is linked to (e.g. the
    // school's "English" → library Grade 3 English), so its default themes
    // can be added and updated.
    librarySubject: { type: mongoose.Schema.Types.ObjectId, ref: 'CasSubject', default: null },

    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },

    createdBy: refId('User'),
  },
  casOptions,
);

casSubjectSchema.index({ school: 1, grade: 1, code: 1 }, { unique: true });
casSubjectSchema.index({ school: 1, grade: 1, status: 1, sequence: 1 });

export default mongoose.models.CasSubject ||
  mongoose.model('CasSubject', casSubjectSchema);
