/**
 * Internal exam marks structure: how one subject's full marks split into a
 * theory paper (TH) and internal assessment (INT), and which fields the
 * school's internal assessment is made of (Weekly Test 10, Project 10, …).
 *
 * The school sets it once per grade in Manage Exams, with optional
 * per-subject overrides, and every exam of that grade uses it: First, Second,
 * Third Terminal, Final or a board exam alike. Teachers type marks against
 * these real full marks; nothing is rescaled.
 *
 * A structure:
 *   { theoryFullMarks, internalFullMarks, fields: [{ id, name, fullMarks }] }
 *
 * With no fields, INT (when above 0) is typed as one number. With fields, INT
 * is their sum and is never typed. Marks are stored by field id, so renaming
 * a field keeps its marks.
 *
 * Dependency-free: the server, the Manage Exams editor and the mark-entry grid
 * all use it.
 */

export const MAX_FIELDS = 12;
export const MAX_FULL_MARKS = 1000;
/** Key that holds a directly typed INT mark when a structure has no fields. */
export const DIRECT_INTERNAL_KEY = 'INT';
export const FIELD_ID_PATTERN = /^[a-z0-9]{4,24}$/;

const round2 = (value) => Math.round(value * 100) / 100;
const isMarks = (value) => typeof value === 'number' && Number.isFinite(value);
const twoDecimals = (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

/** A short random id for a new field (stable once saved). */
export function newFieldId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `f${random.slice(0, 11).toLowerCase()}`;
}

/** The default structure before a grade saves its own assessment structure. */
export function legacyStructure() {
  return { theoryFullMarks: 50, internalFullMarks: 50, fields: [] };
}

export function totalFullMarks(structure) {
  return round2((Number(structure?.theoryFullMarks) || 0) + (Number(structure?.internalFullMarks) || 0));
}

export function allocatedInternal(structure) {
  return round2((structure?.fields || []).reduce((sum, field) => sum + (Number(field.fullMarks) || 0), 0));
}

/** Does this structure have an internal part at all? */
export function hasInternal(structure) {
  return (Number(structure?.internalFullMarks) || 0) > 0;
}

/**
 * The input keys a teacher types for one subject, in column order:
 * `{ key: 'TH' | fieldId | 'INT', label, fullMarks }`.
 */
export function entryColumns(structure) {
  const columns = [];
  if (Number(structure?.theoryFullMarks) > 0) {
    columns.push({ key: 'TH', part: 'theory', label: 'TH', fullMarks: Number(structure.theoryFullMarks) });
  }
  if (hasInternal(structure)) {
    if (structure.fields?.length) {
      for (const field of structure.fields) {
        columns.push({ key: field.id, part: 'internal', label: field.name, fullMarks: Number(field.fullMarks) });
      }
    } else {
      columns.push({ key: DIRECT_INTERNAL_KEY, part: 'internal', label: 'INT', fullMarks: Number(structure.internalFullMarks) });
    }
  }
  return columns;
}

/**
 * Problems with a structure, as plain sentences; empty when it can be used.
 * `totalFullMarks`, when given, must equal TH + INT.
 */
export function structureProblems(structure, { totalFullMarks: total } = {}) {
  const problems = [];
  const theory = Number(structure?.theoryFullMarks);
  const internal = Number(structure?.internalFullMarks);
  const fields = structure?.fields || [];

  if (!isMarks(theory) || theory < 0 || !twoDecimals(theory)) problems.push('Theory full marks must be 0 or more.');
  if (!isMarks(internal) || internal < 0 || !twoDecimals(internal)) problems.push('Internal full marks must be 0 or more.');
  if (!problems.length) {
    if (theory + internal <= 0) problems.push('Theory and internal full marks cannot both be 0.');
    if (theory + internal > MAX_FULL_MARKS) problems.push(`Total full marks cannot be more than ${MAX_FULL_MARKS}.`);
    if (total !== undefined && total !== null && total !== '' && round2(theory + internal) !== round2(Number(total))) {
      problems.push(`Theory ${theory} + Internal ${internal} = ${round2(theory + internal)}, not the total of ${Number(total)}.`);
    }
  }

  if (fields.length > MAX_FIELDS) problems.push(`Use at most ${MAX_FIELDS} internal assessment fields.`);
  if (fields.length && !(internal > 0)) problems.push('Remove the internal fields, or give internal assessment some full marks.');

  const names = new Set();
  const ids = new Set();
  for (const field of fields) {
    const name = String(field?.name || '').trim();
    if (!name) problems.push('Every internal field needs a name.');
    else if (names.has(name.toLowerCase())) problems.push(`"${name}" is listed twice.`);
    names.add(name.toLowerCase());
    if (!FIELD_ID_PATTERN.test(String(field?.id || '')) || ids.has(field.id)) problems.push(`"${name || 'A field'}" has an invalid id. Reload and try again.`);
    ids.add(field?.id);
    const marks = Number(field?.fullMarks);
    if (!isMarks(marks) || marks <= 0 || !twoDecimals(marks)) problems.push(`"${name || 'A field'}" needs full marks above 0.`);
  }

  if (fields.length && internal > 0) {
    const allocated = allocatedInternal(structure);
    if (allocated < internal) {
      problems.push(`Allocated internal marks: ${allocated}/${internal}. Please allocate the remaining ${round2(internal - allocated)} marks.`);
    } else if (allocated > internal) {
      problems.push(`Allocated internal marks: ${allocated}/${internal}. Remove ${round2(allocated - internal)} marks from the fields.`);
    }
  }
  return [...new Set(problems)];
}

/** A clean copy keeping only the stored keys (names trimmed). */
export function cleanStructure(structure) {
  return {
    theoryFullMarks: Number(structure.theoryFullMarks),
    internalFullMarks: Number(structure.internalFullMarks),
    fields: (structure.fields || []).map((field) => ({ id: String(field.id), name: String(field.name).trim(), fullMarks: Number(field.fullMarks) })),
  };
}

/**
 * The structure one subject uses under a grade's scheme: its override, else
 * the grade default, else the exam's own full marks as one theory mark.
 */
export function structureForSubject(scheme, subjectId, fallbackFullMarks) {
  const override = (scheme?.subjects || []).find((row) => String(row.subject) === String(subjectId));
  if (override?.structure) return override.structure;
  if (scheme?.default) return scheme.default;
  return legacyStructure(fallbackFullMarks);
}

/**
 * Read a stored mark row into `{ theory, internal: { key: number }, absent }`.
 * Rows saved before the TH/INT split carry a single `marks`, which is theory.
 */
export function entryFromRow(row) {
  if (!row) return null;
  const internal = {};
  const source = row.internal instanceof Map ? Object.fromEntries(row.internal) : (row.internal || {});
  for (const [key, value] of Object.entries(source)) if (isMarks(value)) internal[key] = value;
  const theory = isMarks(row.theory) ? row.theory : (isMarks(row.marks) && !Object.keys(internal).length ? row.marks : null);
  return { theory, internal, absent: Boolean(row.absent) };
}

/**
 * Marks that would no longer fit a structure: a theory mark with no theory
 * paper or above its full marks, a field mark for a field that was removed
 * or above its full marks. Used before a structure change is saved.
 */
export function entryConflicts(structure, entry) {
  if (!entry) return [];
  const conflicts = [];
  const theoryFull = Number(structure.theoryFullMarks) || 0;
  if (isMarks(entry.theory) && entry.theory > theoryFull) {
    conflicts.push(theoryFull ? `a theory mark of ${entry.theory} is above the new ${theoryFull}` : 'it has theory marks, but theory would be removed');
  }
  const columns = new Map(entryColumns(structure).filter((column) => column.part === 'internal').map((column) => [column.key, column]));
  for (const [key, value] of Object.entries(entry.internal || {})) {
    const column = columns.get(key);
    if (!column) conflicts.push('it has marks in an internal field that would be removed or replaced');
    else if (value > column.fullMarks) conflicts.push(`a ${column.label} mark of ${value} is above the new ${column.fullMarks}`);
  }
  return [...new Set(conflicts)];
}
