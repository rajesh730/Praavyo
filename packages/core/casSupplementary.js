export const ECA_FIELDS = [
  { key: 'discipline', label: 'Discipline' },
  { key: 'personalHygiene', label: 'Personal Hygiene' },
  { key: 'classWork', label: 'Class Work' },
  { key: 'homeWork', label: 'Home Work' },
  { key: 'eca', label: 'ECA' },
  { key: 'artCraft', label: 'Art & Craft' },
  { key: 'handwriting', label: 'Handwriting' },
  { key: 'projectPresentation', label: 'Project / Presentation' },
];

export function emptyAttendance() {
  return { workingDays: null, presentDays: null, absentDays: null };
}

export function normalizeAttendance(attendance = {}) {
  const workingDays = normalizeDayCount(attendance.workingDays);
  const presentDays = normalizeDayCount(attendance.presentDays);
  const absentDays =
    workingDays != null && presentDays != null
      ? Math.max(workingDays - presentDays, 0)
      : normalizeDayCount(attendance.absentDays);
  return { workingDays, presentDays, absentDays };
}

export function normalizeExtraActivities(extraActivities = {}) {
  return Object.fromEntries(
    ECA_FIELDS.map((field) => [
      field.key,
      String(extraActivities[field.key] || '').trim().slice(0, 20),
    ]),
  );
}

/** Has the school recorded any attendance figure for this student? */
export function hasAttendance(attendance) {
  const value = attendance || {};
  return ['workingDays', 'presentDays', 'absentDays'].some((key) => value[key] != null && value[key] !== '');
}

/** Has the school recorded any extra-activity grade for this student? */
export function hasExtraActivities(extraActivities) {
  const value = extraActivities || {};
  return ECA_FIELDS.some((field) => String(value[field.key] || '').trim() !== '');
}

function normalizeDayCount(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}
