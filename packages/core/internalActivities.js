/**
 * Internal Exam extra activities: the school's own list, each marked out of
 * its own full marks ("Discipline 9/10").
 *
 * Every school starts with the eight activities below, each out of 10, until
 * it saves its own list in Manage Exams → Extra Activities, where it can
 * rename, remove or add activities (e.g. Meditation) and set full marks. The
 * list is school-wide: every grade and every internal exam uses it.
 *
 * A record stores marks by activity id, so renaming an activity keeps its
 * marks. The default ids are the old fixed keys, so values saved before the
 * list became editable (text such as "9") still read back.
 *
 * Internal Exam only; CAS keeps casSupplementary.js untouched.
 * Dependency-free: the server, the entry table and the report card use it.
 */

export const MAX_ACTIVITIES = 20;
export const MAX_ACTIVITY_MARKS = 100;
export const DEFAULT_ACTIVITY_MARKS = 10;
export const ACTIVITY_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{2,31}$/;

export const DEFAULT_ACTIVITIES = [
  { id: 'discipline', name: 'Discipline' },
  { id: 'personalHygiene', name: 'Personal Hygiene' },
  { id: 'classWork', name: 'Class Work' },
  { id: 'homeWork', name: 'Home Work' },
  { id: 'eca', name: 'ECA' },
  { id: 'artCraft', name: 'Art & Craft' },
  { id: 'handwriting', name: 'Handwriting' },
  { id: 'projectPresentation', name: 'Project / Presentation' },
].map((activity) => ({ ...activity, fullMarks: DEFAULT_ACTIVITY_MARKS }));

const isMarks = (value) => typeof value === 'number' && Number.isFinite(value);
const twoDecimals = (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/** A short random id for a new activity (stable once saved). */
export function newActivityId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `a${random.slice(0, 11).toLowerCase()}`;
}

/** The school's list, or the default eight until it saves one. */
export function activitiesOf(saved) {
  return saved ? (saved.fields || []) : DEFAULT_ACTIVITIES;
}

/** Problems with a list, as plain sentences; empty when it can be saved. */
export function activityProblems(fields) {
  const problems = [];
  const list = Array.isArray(fields) ? fields : [];
  if (list.length > MAX_ACTIVITIES) problems.push(`Use at most ${MAX_ACTIVITIES} activities.`);
  const names = new Set();
  const ids = new Set();
  for (const field of list) {
    const name = String(field?.name || '').trim();
    if (!name) problems.push('Every activity needs a name.');
    else if (names.has(name.toLowerCase())) problems.push(`"${name}" is listed twice.`);
    names.add(name.toLowerCase());
    if (!ACTIVITY_ID_PATTERN.test(String(field?.id || '')) || ids.has(field.id)) problems.push(`"${name || 'An activity'}" has an invalid id. Reload and try again.`);
    ids.add(field?.id);
    const marks = Number(field?.fullMarks);
    if (!isMarks(marks) || marks <= 0 || marks > MAX_ACTIVITY_MARKS || !twoDecimals(marks)) {
      problems.push(`"${name || 'An activity'}" needs full marks between 1 and ${MAX_ACTIVITY_MARKS}.`);
    }
  }
  return [...new Set(problems)];
}

export function cleanActivities(fields) {
  return (fields || []).map((field) => ({ id: String(field.id), name: String(field.name).trim(), fullMarks: Number(field.fullMarks) }));
}

/**
 * One activity's value on a record: the mark (a number), or text saved
 * before marks existed ("A"), or null when nothing is recorded.
 */
export function activityValue(record, id) {
  const marks = record?.activityMarks instanceof Map ? Object.fromEntries(record.activityMarks) : record?.activityMarks;
  if (marks && isMarks(marks[id])) return marks[id];
  const legacy = String(record?.extraActivities?.[id] ?? '').trim();
  if (!legacy) return null;
  const number = Number(legacy);
  return /^\d+(\.\d{1,2})?$/.test(legacy) && isMarks(number) ? number : legacy;
}

/** The activity values of a record, by id, for the entry table. */
export function activityValues(fields, record) {
  return Object.fromEntries(fields.map((field) => [field.id, activityValue(record, field.id)]));
}

/** What the report card prints: each activity with its mark out of full marks. */
export function activityLines(fields, record) {
  return fields.map((field) => ({ id: field.id, name: field.name, fullMarks: field.fullMarks, obtained: activityValue(record, field.id) }));
}

/** A typed cell: null (blank), a mark, or undefined (not a mark within full marks). */
export function parseActivityMark(text, fullMarks) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const marks = Number(value);
  return marks <= fullMarks ? marks : undefined;
}

/** Has any activity been recorded on these card lines? */
export function hasActivityMarks(lines) {
  return (lines || []).some((line) => line.obtained !== null && line.obtained !== undefined && line.obtained !== '');
}
