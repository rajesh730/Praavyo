import mongoose from 'mongoose';
import { casOptions, refId, reqRefId } from './casShared.js';

/**
 * A school's Internal Exam extra-activity list (Manage Exams → Extra
 * Activities): each activity's name and full marks. One per school, used by
 * every grade and every internal exam. Until a school saves one, the default
 * eight apply (@pravyo/core/internalActivities).
 *
 * Published report cards copy the list into their snapshot, so later edits
 * here never change a published card.
 */
const activitySchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[a-zA-Z][a-zA-Z0-9]{2,31}$/ },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  fullMarks: { type: Number, required: true, min: 0.01, max: 100 },
}, { _id: false });

const internalActivitySetSchema = new mongoose.Schema({
  school: reqRefId('User'),
  fields: { type: [activitySchema], default: [] },
  revision: { type: Number, default: 0 },
  updatedBy: refId('User'),
}, casOptions);

internalActivitySetSchema.index({ school: 1 }, { unique: true });

export default mongoose.models.InternalActivitySet || mongoose.model('InternalActivitySet', internalActivitySetSchema);
