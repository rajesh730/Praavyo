import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * One learning outcome a student is assessed against, in English and Nepali.
 *
 * A row is what the Curriculum screen lists and what the Assessment screen
 * assesses — "Digital Basics · Identifies common computer parts and their
 * functions". `theme` groups outcomes inside a subject; it is a label, not a
 * separate collection, because nothing in the product needs a theme on its own.
 *
 * Only a school administrator writes these. Teachers read them.
 */
const casLearningOutcomeSchema = new mongoose.Schema(
  {
    school: reqRefId('User'),
    grade: { type: String, required: true, trim: true },
    subject: reqRefId('CasSubject'),
    // Denormalised so an assessment row can be read without a join.
    subjectCode: { type: String, required: true, trim: true, uppercase: true },

    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },

    themeKey: { type: String, default: '', trim: true, maxlength: 401 },
    themeEn: { type: String, default: '', trim: true, maxlength: 200 },
    themeNe: { type: String, default: '', trim: true, maxlength: 200 },

    titleEn: { type: String, default: '', trim: true, maxlength: 1000 },
    titleNe: { type: String, default: '', trim: true, maxlength: 1000 },

    /**
     * What each level 1-4 looks like for this outcome — the book's "Indicator"
     * column. Index 0 is level 1, index 3 is level 4.
     *
     * Optional: subjects that simply rate 1-4 leave it empty. Where the book
     * spells the levels out (Mathematics does, for every outcome) storing them
     * means the teacher is judging against the published wording rather than
     * their own memory of it.
     */
    descriptors: {
      type: [
        {
          _id: false,
          level: { type: Number, required: true, min: 1, max: 4 },
          textEn: { type: String, default: '', trim: true, maxlength: 1000 },
          textNe: { type: String, default: '', trim: true, maxlength: 1000 },
        },
      ],
      default: [],
    },

    /**
     * The sub-points a teacher checks off before judging the outcome as a
     * whole — the book's "सिकाइ उपलब्धि विस्तृतीकरण र उपलब्धि सूचक" column, and
     * the numbered indicators under each Areas/Skills row in English.
     *
     * Recorded as reference material, not as separate results: the level is
     * still awarded once, against the outcome. Storing them means the teacher
     * sees what the book actually asks for.
     */
    indicators: {
      type: [
        {
          _id: false,
          textEn: { type: String, default: '', trim: true, maxlength: 1000 },
          textNe: { type: String, default: '', trim: true, maxlength: 1000 },
          // "मूल्याङ्कनका सम्भाव्य साधन" — observation, project work, rating scale…
          tool: { type: String, default: '', trim: true, maxlength: 300 },
        },
      ],
      default: [],
    },

    /**
     * "परीक्षण गर्ने पक्ष" — the aspect being tested — and "साधन", the tool the
     * book suggests, each in English and Nepali. Rows seeded before the Nepali
     * fields existed may hold Nepali text in the English field; the app reads
     * that as Nepali (see packages/cas/lib/casBilingual.js).
     *
     * An outcome may have several of each: one per line, line N of the English
     * field pairing with line N of the Nepali one. Not trimmed here, since a
     * leading blank line is what keeps that pairing.
     */
    assessmentAspect: { type: String, default: '', maxlength: 2100 },
    assessmentAspectNe: { type: String, default: '', maxlength: 2100 },
    assessmentTool: { type: String, default: '', maxlength: 2100 },
    assessmentToolNe: { type: String, default: '', maxlength: 2100 },

    sequence: { type: Number, default: 1, min: 1 },

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

casLearningOutcomeSchema.index({ school: 1, subject: 1, code: 1 }, { unique: true });
casLearningOutcomeSchema.index({ school: 1, grade: 1, subjectCode: 1, status: 1, sequence: 1 });
casLearningOutcomeSchema.index({ school: 1, subject: 1, themeKey: 1, status: 1, sequence: 1 });

export default mongoose.models.CasLearningOutcome ||
  mongoose.model('CasLearningOutcome', casLearningOutcomeSchema);
