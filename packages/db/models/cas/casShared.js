import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Shared schema conventions for every CAS collection.
 *
 * `autoIndex: false` matters: CAS connects to the SAME database as Pravyo, and
 * letting Mongoose build indexes on connect would have it touch collections it
 * does not own. CAS indexes are created explicitly by lib/casIndexes.js.
 *
 * `strict: 'throw'` turns a typo'd field into a loud error rather than a
 * silently dropped assessment.
 */
export const casOptions = {
  timestamps: true,
  autoIndex: false,
  strict: 'throw',
  minimize: false,
};

export function refId(ref) {
  return { type: Schema.Types.ObjectId, ref };
}

export function reqRefId(ref) {
  return { type: Schema.Types.ObjectId, ref, required: true };
}

/**
 * Below this, the learning outcome must go back for reassessment.
 * Re-exported from the domain module so there is one definition, and the
 * persistence layer depends on the domain rather than the other way round.
 */
export { REASSESSMENT_THRESHOLD } from '@pravyo/core/casResults';

export const levelField = {
  type: Number,
  min: 1,
  max: 4,
  validate: {
    validator: Number.isInteger,
    message: 'Achievement level must be a whole number from 1 to 4',
  },
};

/**
 * Canonical date storage. Every CAS date is an ISO `YYYY-MM-DD` calendar day in
 * the school's local (Asia/Kathmandu) frame — not a timestamp. Storing a Date
 * would make "10 Chaitra" drift across a timezone boundary; storing the day
 * string keeps an assessment dated the day the teacher actually assessed.
 */
export const dayField = {
  type: String,
  match: [/^\d{4}-\d{2}-\d{2}$/, 'Dates must be stored as YYYY-MM-DD'],
};
