import { randomUUID } from 'node:crypto';
import connectDB from '@pravyo/db';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import { LIBRARY_GRADES, LIBRARY_SCHOOL_ID, sameGrade } from '@pravyo/core/themeLibrary';
import ensureCasIndexes from './casIndexes.js';
import { bySequence, outcomeContent, themeHash } from './casThemeHash.js';
import { assert, requireSchoolAdmin } from './casAccess.js';

/**
 * Default theme library → school copies.
 *
 * The library lives under LIBRARY_SCHOOL_ID in the ordinary curriculum
 * collections. A school links one of its own subjects to a library subject
 * and copies themes into it. Every copy remembers the library theme it came
 * from and a fingerprint (hash) of the library content at copy time:
 *
 *   library hash ≠ copy's sourceHash  → "Update available" (school's choice)
 *   copy's own hash ≠ sourceHash      → the school edited its copy
 *
 * Applying an update never touches published report cards (they are frozen
 * snapshots) and never touches themes the school created itself. Outcomes are
 * matched by code: same code → updated in place (its marks stay attached),
 * new code → added, missing code → removed, or archived if it has marks.
 */

const legacyThemeKey = (row) => `${row.themeNe || ''}|${row.themeEn || ''}`;
const themeKeyOf = (row) => row.themeKey || legacyThemeKey(row);

const OUTCOME_COPY_FIELDS = [
  'titleEn', 'titleNe', 'descriptors', 'indicators',
  'assessmentAspect', 'assessmentAspectNe', 'assessmentTool', 'assessmentToolNe',
];

export { themeHash };

/** Active themes of a subject, each with its active outcomes. */
async function subjectThemes(school, subject) {
  const outcomes = await CasLearningOutcome.find({ school, subject: subject._id, status: 'ACTIVE' }).lean();
  const themes = (subject.themes || [])
    .filter((theme) => (theme.status || 'ACTIVE') === 'ACTIVE')
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1))
    .map((theme) => ({ ...theme, outcomes: [] }));
  const byKey = new Map(themes.map((theme) => [theme.key, theme]));
  for (const outcome of outcomes) {
    const key = themeKeyOf(outcome);
    if (!byKey.has(key)) {
      // Older rows carry the theme only as a label on each outcome.
      const theme = { key, titleEn: outcome.themeEn || '', titleNe: outcome.themeNe || '', sequence: themes.length + 1, outcomes: [] };
      themes.push(theme);
      byKey.set(key, theme);
    }
    byKey.get(key).outcomes.push(outcome);
  }
  return themes;
}

async function loadSchoolSubject(actor, id) {
  const subject = await CasSubject.findOne({ _id: id, school: actor.school, status: 'ACTIVE' });
  assert(subject, 'Subject unavailable', 404);
  return subject;
}

async function loadLibrarySubject(id) {
  const subject = await CasSubject.findOne({ _id: id, school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' }).lean();
  assert(subject, 'That default subject is no longer in the library', 404);
  return subject;
}

function assertSchoolActor(actor) {
  requireSchoolAdmin(actor);
  assert(!actor.library, 'The default library itself cannot copy themes', 400);
}

/**
 * Everything the "Default themes" panel needs for one school subject: the
 * library subjects it can link to, and — once linked — each library theme
 * with its status in this school.
 */
export async function libraryOverview(actor, { subject }) {
  requireSchoolAdmin(actor);
  await connectDB();
  if (actor.library) return { library: true };
  const own = (await loadSchoolSubject(actor, subject)).toObject();

  const candidates = (await CasSubject.find({ school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' })
    .select('grade code titleEn titleNe').sort({ sequence: 1, titleEn: 1 }).lean())
    .filter((row) => sameGrade(row.grade, own.grade));

  const result = {
    subject: { id: String(own._id), titleEn: own.titleEn, titleNe: own.titleNe || '', grade: own.grade },
    candidates: candidates.map((row) => ({ id: String(row._id), code: row.code, titleEn: row.titleEn, titleNe: row.titleNe || '' })),
    linked: null,
    themes: [],
  };
  if (!own.librarySubject) return result;

  const library = await CasSubject.findOne({ _id: own.librarySubject, school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' }).lean();
  if (!library) return result;
  result.linked = { id: String(library._id), code: library.code, titleEn: library.titleEn, titleNe: library.titleNe || '' };

  const [libraryThemes, ownThemes] = await Promise.all([
    subjectThemes(LIBRARY_SCHOOL_ID, library),
    subjectThemes(actor.school, own),
  ]);
  const copies = new Map(ownThemes.filter((theme) => theme.sourceThemeKey).map((theme) => [theme.sourceThemeKey, theme]));

  result.themes = libraryThemes.map((theme) => {
    const copy = copies.get(theme.key);
    const libraryHash = themeHash(theme, theme.outcomes);
    let status = 'NOT_ADDED';
    let edited = false;
    if (copy) {
      edited = themeHash(copy, copy.outcomes) !== copy.sourceHash;
      status = libraryHash === copy.sourceHash ? 'UP_TO_DATE' : 'UPDATE_AVAILABLE';
    }
    return {
      key: theme.key,
      titleEn: theme.titleEn || '',
      titleNe: theme.titleNe || '',
      outcomeCount: theme.outcomes.length,
      status,
      edited,
      schoolThemeKey: copy?.key || null,
    };
  });
  result.ownThemeCount = ownThemes.filter((theme) => !theme.sourceThemeKey).length;
  // Copies whose library theme the super admin has since deleted. They stay
  // in the school exactly as they are; only updates stop.
  const libraryKeys = new Set(libraryThemes.map((theme) => theme.key));
  result.removedFromLibrary = ownThemes
    .filter((theme) => theme.sourceThemeKey && !libraryKeys.has(theme.sourceThemeKey))
    .map((theme) => ({ key: theme.key, titleEn: theme.titleEn || '', titleNe: theme.titleNe || '', outcomeCount: theme.outcomes.length }));
  return result;
}

/** Link (or unlink with `librarySubject: null`) a school subject to a library subject. */
export async function linkLibrarySubject(actor, { subject, librarySubject }) {
  assertSchoolActor(actor);
  await connectDB();
  const own = await loadSchoolSubject(actor, subject);
  if (librarySubject) {
    const library = await loadLibrarySubject(librarySubject);
    assert(sameGrade(library.grade, own.grade), 'Link a default subject of the same grade', 400);
    own.librarySubject = library._id;
  } else {
    own.librarySubject = null;
  }
  await own.save();
  return { linked: Boolean(librarySubject) };
}

/** Copy chosen library themes (and their outcomes) into the school subject. */
export async function addLibraryThemes(actor, { subject, themeKeys }) {
  assertSchoolActor(actor);
  await connectDB();
  await ensureCasIndexes();
  assert(Array.isArray(themeKeys) && themeKeys.length, 'Choose at least one theme', 400);
  const own = await loadSchoolSubject(actor, subject);
  assert(own.librarySubject, 'Link this subject to a default subject first', 400);
  const library = await loadLibrarySubject(own.librarySubject);
  const libraryThemes = await subjectThemes(LIBRARY_SCHOOL_ID, library);
  const ownThemes = await subjectThemes(actor.school, own.toObject());
  const alreadyCopied = new Set(ownThemes.map((theme) => theme.sourceThemeKey).filter(Boolean));
  // Archived theme entries keep their keys, so a re-added theme gets a new one.
  const usedKeys = new Set([...ownThemes.map((theme) => theme.key), ...(own.themes || []).map((theme) => theme.key)]);
  const usedCodes = new Set((await CasLearningOutcome.find({ school: actor.school, subject: own._id }).select('code').lean())
    .map((row) => row.code));
  const sequence = ownThemes.reduce((max, theme) => Math.max(max, theme.sequence || 1), 0);

  const chosen = libraryThemes.filter((item) => themeKeys.includes(item.key) && !alreadyCopied.has(item.key));
  const rows = copyThemesInto(own, chosen, { school: actor.school, createdBy: actor.id, usedKeys, usedCodes, sequence });
  if (rows.length) await CasLearningOutcome.insertMany(rows, { ordered: true });
  await own.save();
  return { added: chosen.length };
}

/**
 * Append copies of library themes to `own.themes` and return the outcome rows
 * to insert. Each copy records its library theme and content hash, so the
 * school can later see and choose updates. Saves nothing.
 */
function copyThemesInto(own, libraryThemes, { school, createdBy, usedKeys, usedCodes, sequence }) {
  const rows = [];
  for (const theme of libraryThemes) {
    const key = usedKeys.has(theme.key) ? `theme-${randomUUID()}` : theme.key;
    usedKeys.add(key);
    sequence += 1;
    own.themes.push({
      key, titleEn: theme.titleEn || '', titleNe: theme.titleNe || '',
      workingHours: theme.workingHours ?? null, sequence, status: 'ACTIVE',
      sourceThemeKey: theme.key, sourceHash: themeHash(theme, theme.outcomes),
    });
    [...theme.outcomes].sort(bySequence).forEach((outcome, index) => {
      let code = String(outcome.code).toUpperCase();
      for (let n = 2; usedCodes.has(code); n += 1) code = `${String(outcome.code).toUpperCase().slice(0, 26)}-${n}`;
      usedCodes.add(code);
      rows.push({
        school, grade: own.grade, subject: own._id, subjectCode: own.code,
        code, themeKey: key, themeEn: theme.titleEn || '', themeNe: theme.titleNe || '',
        ...Object.fromEntries(OUTCOME_COPY_FIELDS.map((field) => [field, outcome[field] ?? (field.endsWith('s') ? [] : '')])),
        sequence: outcome.sequence || index + 1, status: 'ACTIVE', createdBy,
      });
    });
  }
  return rows;
}

/**
 * Give a school its own copy of the default library — every library subject
 * (Grades 1–5 only; Grades 6–10 are Phase 2) it has not received yet, linked
 * to its source, with all of its themes and outcomes.
 *
 * `received` lists the library subject ids the school already got (kept on
 * the school's account by the caller). Each library subject reaches a school
 * at most once, so a subject the school deleted never comes back, while a
 * grade added to the library later (Grades 4–5) still reaches schools that
 * were approved before it existed.
 *
 * A grade the school set up itself — any subject there, active or archived,
 * that did not come from this copy — is left alone. After copying, the rows
 * are the school's: edits stay local, library changes arrive only as "Update
 * available", and the school may archive or delete what it does not use.
 *
 * Each subject is copied completely or not at all. The caller records
 * `copied` even when `error` is set.
 */
export async function provisionDefaultCurriculum(school, { createdBy = null, received = [] } = {}) {
  await connectDB();
  await ensureCasIndexes();
  assert(school && String(school) !== LIBRARY_SCHOOL_ID, 'Choose a school', 400);
  const done = new Set(received.map(String));

  const [librarySubjects, ownSubjects] = await Promise.all([
    CasSubject.find({ school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' }).sort({ grade: 1, sequence: 1, titleEn: 1 }).lean(),
    CasSubject.find({ school }).select('grade code librarySubject').lean(),
  ]);
  const selfManaged = (grade) => ownSubjects.some((row) => sameGrade(row.grade, grade)
    && !(row.librarySubject && done.has(String(row.librarySubject))));
  const codeTaken = (library) => ownSubjects.some((row) => sameGrade(row.grade, library.grade)
    && String(row.code).toUpperCase() === String(library.code).toUpperCase());

  const result = { copied: [], subjects: 0, themes: 0, outcomes: 0, skippedGrades: [] };
  for (const library of librarySubjects) {
    if (!LIBRARY_GRADES.some((grade) => sameGrade(grade, library.grade))) continue;
    if (done.has(String(library._id)) || codeTaken(library)) continue;
    if (selfManaged(library.grade)) {
      if (!result.skippedGrades.includes(library.grade)) result.skippedGrades.push(library.grade);
      continue;
    }

    const own = new CasSubject({
      school, grade: library.grade, code: library.code,
      titleEn: library.titleEn, titleNe: library.titleNe || '',
      sequence: library.sequence || 1, creditHours: library.creditHours ?? null,
      taught: library.taught ?? true, examined: library.examined ?? true,
      kind: library.kind || 'COMPULSORY', optionalGroup: library.optionalGroup || '',
      librarySubject: library._id, createdBy,
    });
    let saved = false;
    try {
      const libraryThemes = await subjectThemes(LIBRARY_SCHOOL_ID, library);
      const rows = copyThemesInto(own, libraryThemes, { school, createdBy, usedKeys: new Set(), usedCodes: new Set(), sequence: 0 });
      await own.save();
      saved = true;
      if (rows.length) await CasLearningOutcome.insertMany(rows, { ordered: true });
      result.copied.push(library._id);
      result.subjects += 1;
      result.themes += libraryThemes.length;
      result.outcomes += rows.length;
    } catch (error) {
      // The subject itself already exists: a concurrent run (a double-click on
      // Approve) copied it first. Nothing of ours to undo.
      if (!saved && error?.code === 11000) continue;
      // Never leave a half-copied subject behind.
      if (saved) {
        await CasLearningOutcome.deleteMany({ school, subject: own._id });
        await CasSubject.deleteOne({ _id: own._id });
      }
      result.error = error;
      break;
    }
  }
  return result;
}

async function themePair(actor, { subject, themeKey }) {
  const own = await loadSchoolSubject(actor, subject);
  assert(own.librarySubject, 'This subject is not linked to a default subject', 400);
  const library = await loadLibrarySubject(own.librarySubject);
  const ownThemes = await subjectThemes(actor.school, own.toObject());
  const copy = ownThemes.find((theme) => theme.sourceThemeKey === themeKey);
  assert(copy, 'This school has not added that default theme', 404);
  const source = (await subjectThemes(LIBRARY_SCHOOL_ID, library)).find((theme) => theme.key === themeKey);
  assert(source, 'That theme is no longer in the default library', 404);
  return { own, copy, source };
}

/** What applying the library's current version would change. Saves nothing. */
export async function previewThemeUpdate(actor, input) {
  assertSchoolActor(actor);
  await connectDB();
  const { copy, source } = await themePair(actor, input);
  const mine = new Map(copy.outcomes.map((row) => [String(row.code).toUpperCase(), row]));
  const theirs = new Map(source.outcomes.map((row) => [String(row.code).toUpperCase(), row]));
  const added = source.outcomes.filter((row) => !mine.has(String(row.code).toUpperCase()));
  const removed = copy.outcomes.filter((row) => !theirs.has(String(row.code).toUpperCase()));
  const changed = source.outcomes.filter((row) => {
    const current = mine.get(String(row.code).toUpperCase());
    return current && JSON.stringify(outcomeContent(current)) !== JSON.stringify(outcomeContent(row));
  });
  const markedRemoved = removed.length
    ? await CasAssessment.distinct('outcome', { school: actor.school, outcome: { $in: removed.map((row) => row._id) } })
    : [];
  const summary = (row) => ({ code: row.code, titleEn: row.titleEn || '', titleNe: row.titleNe || '' });
  return {
    theme: { titleEn: copy.titleEn || '', titleNe: copy.titleNe || '' },
    renamed: (copy.titleEn || '') !== (source.titleEn || '') || (copy.titleNe || '') !== (source.titleNe || '')
      ? { titleEn: source.titleEn || '', titleNe: source.titleNe || '' } : null,
    workingHours: (copy.workingHours ?? null) !== (source.workingHours ?? null) ? source.workingHours ?? null : undefined,
    added: added.map(summary),
    changed: changed.map((row) => ({ ...summary(row), before: summary(mine.get(String(row.code).toUpperCase())) })),
    removed: removed.map((row) => ({ ...summary(row), hasMarks: markedRemoved.some((id) => String(id) === String(row._id)) })),
    edited: themeHash(copy, copy.outcomes) !== copy.sourceHash,
  };
}

/**
 * Bring one copied theme up to the library's current version. Published
 * report cards are snapshots and do not change; the school's own themes are
 * not touched.
 */
export async function applyThemeUpdate(actor, input) {
  assertSchoolActor(actor);
  await connectDB();
  await ensureCasIndexes();
  const { own, copy, source } = await themePair(actor, input);

  const allRows = await CasLearningOutcome.find({ school: actor.school, subject: own._id }).lean();
  const byCode = new Map(allRows.map((row) => [String(row.code).toUpperCase(), row]));
  const copyIds = new Set(copy.outcomes.map((row) => String(row._id)));
  const wanted = new Set(source.outcomes.map((row) => String(row.code).toUpperCase()));
  const themeFields = { themeKey: copy.key, themeEn: source.titleEn || '', themeNe: source.titleNe || '' };

  let updated = 0;
  let addedCount = 0;
  for (const [index, row] of [...source.outcomes].sort(bySequence).entries()) {
    const code = String(row.code).toUpperCase();
    const content = {
      ...Object.fromEntries(OUTCOME_COPY_FIELDS.map((field) => [field, row[field] ?? (field.endsWith('s') ? [] : '')])),
      ...themeFields,
      sequence: row.sequence || index + 1,
      status: 'ACTIVE',
    };
    const existing = byCode.get(code);
    // Reuse a row with the same code when it is this theme's (keeps its marks)
    // or an archived leftover; never take over another theme's active row.
    if (existing && (copyIds.has(String(existing._id)) || existing.status === 'ARCHIVED')) {
      await CasLearningOutcome.updateOne({ _id: existing._id }, { $set: content });
      updated += 1;
    } else {
      let next = code;
      for (let n = 2; byCode.has(next); n += 1) next = `${code.slice(0, 26)}-${n}`;
      const created = await CasLearningOutcome.create({
        school: actor.school, grade: own.grade, subject: own._id, subjectCode: own.code,
        code: next, ...content, createdBy: actor.id,
      });
      byCode.set(next, created.toObject());
      addedCount += 1;
    }
  }

  // Rows the library dropped: deleted, unless marks exist — then archived so
  // the marks keep their meaning (published results are snapshots anyway).
  const dropped = copy.outcomes.filter((row) => !wanted.has(String(row.code).toUpperCase()));
  const marked = new Set((dropped.length
    ? await CasAssessment.distinct('outcome', { school: actor.school, outcome: { $in: dropped.map((row) => row._id) } })
    : []).map(String));
  const toArchive = dropped.filter((row) => marked.has(String(row._id))).map((row) => row._id);
  const toDelete = dropped.filter((row) => !marked.has(String(row._id))).map((row) => row._id);
  if (toArchive.length) await CasLearningOutcome.updateMany({ _id: { $in: toArchive } }, { $set: { status: 'ARCHIVED' } });
  if (toDelete.length) await CasLearningOutcome.deleteMany({ _id: { $in: toDelete } });

  const entry = own.themes.find((theme) => theme.key === copy.key);
  const fresh = {
    titleEn: source.titleEn || '', titleNe: source.titleNe || '',
    workingHours: source.workingHours ?? null, sourceHash: themeHash(source, source.outcomes),
  };
  if (entry) Object.assign(entry, fresh);
  else own.themes.push({ key: copy.key, sequence: copy.sequence || own.themes.length + 1, status: 'ACTIVE', sourceThemeKey: source.key, ...fresh });
  await own.save();

  return { updated, added: addedCount, archived: toArchive.length, removed: toDelete.length };
}
