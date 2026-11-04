import { randomUUID } from 'node:crypto';
import { EXAMINED_FILTER } from '@pravyo/core/subjectScope';
import { LIBRARY_GRADES } from '@pravyo/core/themeLibrary';
import mongoose from 'mongoose';
import connectDB from '@pravyo/db';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import ensureCasIndexes from './casIndexes.js';
import { assessmentColumns } from './casBilingual.js';
import { assert, requireSchoolAdmin } from './casAccess.js';
import { assignedSubjectIds } from './casTeacherAssignmentService.js';
import { syncDefaultCurriculum } from './casLibraryService.js';
import {
  subjectInput,
  subjectUpdateInput,
  themeInput,
  themeUpdateInput,
  themeDeleteInput,
  themeBookInput,
  outcomeInput,
  outcomeUpdateInput,
  deleteInput,
} from './casValidation.js';

/**
 * Curriculum: the subjects and learning outcomes a grade is assessed on.
 *
 * Only the school account writes here. Adding a subject or an outcome is a form
 * submission, never a code change — which is the whole point of holding the
 * curriculum in the database rather than in a seed file.
 */

const legacyThemeKey = (row) => `${row.themeNe || ''}|${row.themeEn || ''}`;
const outcomeThemeKey = (row) => row.themeKey || legacyThemeKey(row);

function serializeTheme(row) {
  return {
    key: row.key,
    titleEn: row.titleEn || '',
    titleNe: row.titleNe || '',
    workingHours: row.workingHours ?? null,
    sequence: row.sequence || 1,
    status: row.status || 'ACTIVE',
    outcomeCount: row.outcomeCount || 0,
  };
}

function buildThemeGroups(subject, outcomes = []) {
  const themes = new Map();
  for (const theme of [...(subject.themes || [])]
    .filter((item) => (item.status || 'ACTIVE') === 'ACTIVE')
    .sort((a, b) => (a.sequence || 1) - (b.sequence || 1))) {
    themes.set(theme.key, serializeTheme(theme));
  }

  for (const outcome of outcomes) {
    const key = outcomeThemeKey(outcome);
    if (!themes.has(key)) {
      themes.set(key, serializeTheme({
        key,
        titleEn: outcome.themeEn || '',
        titleNe: outcome.themeNe || '',
        sequence: themes.size + 1,
      }));
    }
    const theme = themes.get(key);
    theme.outcomeCount += 1;
    if (!theme.titleEn && outcome.themeEn) theme.titleEn = outcome.themeEn;
    if (!theme.titleNe && outcome.themeNe) theme.titleNe = outcome.themeNe;
  }

  return [...themes.values()].sort(
    (a, b) =>
      (a.sequence || 1) - (b.sequence || 1) ||
      (a.titleEn || a.titleNe).localeCompare(b.titleEn || b.titleNe),
  );
}

function findTheme(subject, outcomes, key) {
  return buildThemeGroups(subject, outcomes).find((theme) => theme.key === key) || null;
}

function themeOutcomeFilter(actor, subject, theme) {
  return {
    school: actor.school,
    subject,
    status: 'ACTIVE',
    $or: [
      { themeKey: theme.key },
      {
        themeKey: { $in: [null, ''] },
        themeEn: theme.titleEn || '',
        themeNe: theme.titleNe || '',
      },
    ],
  };
}

function setThemeOnSubject(subject, theme) {
  const existing = (subject.themes || []).find((item) => item.key === theme.key);
  const next = {
    key: theme.key,
    titleEn: theme.titleEn || '',
    titleNe: theme.titleNe || '',
    workingHours: theme.workingHours ?? null,
    sequence: theme.sequence || 1,
    status: theme.status || 'ACTIVE',
  };
  if (existing) Object.assign(existing, next);
  else subject.themes.push(next);
}

function removeThemeFromSubject(subject, key) {
  subject.themes = (subject.themes || []).filter((theme) => theme.key !== key);
}

async function loadActiveSubject(actor, id) {
  const subject = await CasSubject.findOne({
    _id: id,
    school: actor.school,
    status: 'ACTIVE',
  });
  assert(subject, 'Subject unavailable', 404);
  return subject;
}

async function loadSubjectOutcomes(actor, subject) {
  return CasLearningOutcome.find({
    school: actor.school,
    subject,
    status: 'ACTIVE',
  })
    .sort({ sequence: 1, _id: 1 })
    .lean();
}

export function serializeSubject(row, outcomes = []) {
  return {
    id: String(row._id),
    grade: row.grade,
    code: row.code,
    titleEn: row.titleEn,
    titleNe: row.titleNe || '',
    sequence: row.sequence || 1,
    creditHours: row.creditHours ?? null,
    taught: row.taught !== false,
    examined: row.examined !== false,
    kind: row.kind || 'COMPULSORY',
    optionalGroup: row.optionalGroup || '',
    sections: row.sections || [],
    status: row.status,
    themes: buildThemeGroups(row, outcomes),
  };
}

export function serializeOutcome(row) {
  return {
    id: String(row._id),
    subject: String(row.subject),
    subjectCode: row.subjectCode,
    code: row.code,
    themeKey: outcomeThemeKey(row),
    themeEn: row.themeEn || '',
    themeNe: row.themeNe || '',
    titleEn: row.titleEn || '',
    titleNe: row.titleNe || '',
    ...assessmentColumns(row),
    // Read-only book material the Assessment screen falls back to; sent here
    // so the Curriculum table shows the same cells the teacher will see.
    descriptors: row.descriptors || [],
    indicators: row.indicators || [],
    sequence: row.sequence || 1,
    status: row.status,
  };
}

/** Subjects for a grade, each with its learning outcomes in display order. */
export async function loadCurriculum(actor, { grade, subject, academicYear } = {}) {
  await connectDB();
  await ensureCasIndexes();
  // The curriculum request can race the shell's context request; either one syncs.
  if (!actor.library) await syncDefaultCurriculum(actor.school);

  let allowedSubjects = null;
  if (actor.role === 'TEACHER') {
    assert(academicYear, 'Choose an academic year');
    assert(grade, 'Choose a grade');
    allowedSubjects = await assignedSubjectIds(actor, { academicYear, grade });
    if (subject) assert(allowedSubjects.includes(String(subject)), 'Your school has not assigned you to this subject', 403);
  }

  // CAS shows only the register's examined subjects; taught-only subjects
  // (Moral Education, Music) live on the Pravyo Subjects screen alone.
  const subjects = await CasSubject.find({
    school: actor.school,
    status: 'ACTIVE',
    ...EXAMINED_FILTER,
    ...(grade ? { grade } : {}),
    ...(allowedSubjects ? { _id: { $in: allowedSubjects } } : {}),
  })
    .sort({ sequence: 1, titleEn: 1 })
    .lean();

  const outcomes = await CasLearningOutcome.find({
    school: actor.school,
    status: 'ACTIVE',
    ...(subject
      ? { subject }
      : { subject: { $in: subjects.map((s) => s._id) } }),
  })
    .sort({ sequence: 1 })
    .lean();

  // Flags rows a teacher has already scored, so the editor can say so.
  const scored = new Set((outcomes.length
    ? await CasAssessment.distinct('outcome', {
        school: actor.school,
        outcome: { $in: outcomes.map((outcome) => outcome._id) },
      })
    : []).map(String));

  const bySubject = new Map();
  for (const outcome of outcomes) {
    const key = String(outcome.subject);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push({
      ...serializeOutcome(outcome),
      scored: scored.has(String(outcome._id)),
    });
  }

  return subjects.map((s) => ({
    ...serializeSubject(s, bySubject.get(String(s._id)) || []),
    outcomes: bySubject.get(String(s._id)) || [],
  }));
}

export async function createSubject(actor, input) {
  requireSchoolAdmin(actor);
  const data = subjectInput.parse(input);
  await connectDB();
  await ensureCasIndexes();

  await assertGradeExists(actor, data.grade);

  const last = await CasSubject.findOne({ school: actor.school, grade: data.grade })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();

  try {
    const created = await CasSubject.create({
      ...data,
      school: actor.school,
      sequence: (last?.sequence || 0) + 1,
      createdBy: actor.id,
    });
    return serializeSubject(created.toObject());
  } catch (error) {
    if (error?.code === 11000) {
      throw Object.assign(
        new Error(`Subject code ${data.code} already exists in ${data.grade}`),
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function updateSubject(actor, input) {
  requireSchoolAdmin(actor);
  const data = subjectUpdateInput.parse(input);
  await connectDB();

  const { subject, ...patch } = data;
  const saved = await CasSubject.findOneAndUpdate(
    { _id: subject, school: actor.school },
    { $set: patch },
    { new: true },
  ).lean();
  assert(saved, 'Subject unavailable', 404);
  return serializeSubject(saved);
}

/**
 * Removing a subject.
 *
 * A subject that already carries recorded results is archived, not deleted —
 * deleting it would orphan assessments a parent may already have seen. One with
 * no results is removed outright, along with its outcomes.
 */
export async function deleteSubject(actor, input) {
  requireSchoolAdmin(actor);
  const { id } = deleteInput.parse(input);
  await connectDB();

  const subject = await CasSubject.findOne({ _id: id, school: actor.school }).lean();
  assert(subject, 'Subject unavailable', 404);

  const assessed = await CasAssessment.countDocuments({ subject: subject._id });
  if (assessed > 0) {
    await CasSubject.updateOne({ _id: subject._id }, { $set: { status: 'ARCHIVED' } });
    await CasLearningOutcome.updateMany(
      { subject: subject._id },
      { $set: { status: 'ARCHIVED' } },
    );
    return { archived: true, retainedAssessments: assessed };
  }

  await CasLearningOutcome.deleteMany({ subject: subject._id });
  await CasSubject.deleteOne({ _id: subject._id });
  return { archived: false, retainedAssessments: 0 };
}

export async function createOutcome(actor, input) {
  requireSchoolAdmin(actor);
  const data = outcomeInput.parse(input);
  await connectDB();
  await ensureCasIndexes();

  const subject = await loadActiveSubject(actor, data.subject);
  const existingOutcomes = await loadSubjectOutcomes(actor, subject._id);
  const theme = data.themeKey
    ? findTheme(subject.toObject(), existingOutcomes, data.themeKey)
    : null;
  assert(!data.themeKey || theme, 'Theme unavailable', 404);

  const last = await CasLearningOutcome.findOne({ subject: subject._id })
    .sort({ sequence: -1 })
    .select('sequence code')
    .lean();
  const sequence = (last?.sequence || 0) + 1;

  const created = await CasLearningOutcome.create({
    school: actor.school,
    grade: subject.grade,
    subject: subject._id,
    subjectCode: subject.code,
    // Auto-generated so the school never has to invent an identifier; still
    // stable once written, because assessments reference it.
    code: data.code || `${subject.code}-${String(sequence).padStart(2, '0')}`,
    themeKey: theme?.key || data.themeKey || legacyThemeKey(data),
    themeEn: theme?.titleEn ?? data.themeEn,
    themeNe: theme?.titleNe ?? data.themeNe,
    titleEn: data.titleEn,
    titleNe: data.titleNe,
    assessmentAspect: data.assessmentAspect,
    assessmentAspectNe: data.assessmentAspectNe,
    assessmentTool: data.assessmentTool,
    assessmentToolNe: data.assessmentToolNe,
    sequence,
    createdBy: actor.id,
  });
  return serializeOutcome(created.toObject());
}

/**
 * Editing a row.
 *
 * Wording can change even after scoring — results stay attached to the row and
 * published reports keep their snapshot. Moving a scored row to another theme
 * is refused: it would carry recorded results into a different book page.
 */
export async function updateOutcome(actor, input) {
  requireSchoolAdmin(actor);
  const data = outcomeUpdateInput.parse(input);
  await connectDB();

  const { outcome, ...patch } = data;
  const existing = await CasLearningOutcome.findOne({
    _id: outcome,
    school: actor.school,
  }).lean();
  assert(existing, 'Learning outcome unavailable', 404);

  if (patch.themeKey && patch.themeKey !== outcomeThemeKey(existing)) {
    const assessed = await CasAssessment.countDocuments({
      school: actor.school,
      outcome: existing._id,
    });
    assert(
      assessed === 0,
      'This row already carries recorded scores, so it cannot move to another theme.',
      409,
    );
  }

  if (patch.themeKey) {
    const subject = await loadActiveSubject(actor, existing.subject);
    const outcomes = await loadSubjectOutcomes(actor, subject._id);
    const theme = findTheme(subject.toObject(), outcomes, patch.themeKey);
    assert(theme, 'Theme unavailable', 404);
    patch.themeEn = theme.titleEn || '';
    patch.themeNe = theme.titleNe || '';
  }

  const saved = await CasLearningOutcome.findOneAndUpdate(
    { _id: outcome, school: actor.school },
    { $set: patch },
    { new: true },
  ).lean();
  assert(saved, 'Learning outcome unavailable', 404);
  return serializeOutcome(saved);
}

export async function createTheme(actor, input) {
  requireSchoolAdmin(actor);
  const data = themeInput.parse(input);
  await connectDB();

  const subject = await loadActiveSubject(actor, data.subject);
  const outcomes = await loadSubjectOutcomes(actor, subject._id);
  const groups = buildThemeGroups(subject.toObject(), outcomes);
  const sequence = groups.reduce((max, theme) => Math.max(max, theme.sequence || 1), 0) + 1;
  const theme = {
    key: `theme-${randomUUID()}`,
    titleEn: data.titleEn,
    titleNe: data.titleNe,
    workingHours: data.workingHours ?? null,
    sequence,
    status: 'ACTIVE',
    outcomeCount: 0,
  };
  setThemeOnSubject(subject, theme);
  await subject.save();
  return serializeTheme(theme);
}

export async function updateTheme(actor, input) {
  requireSchoolAdmin(actor);
  const data = themeUpdateInput.parse(input);
  await connectDB();

  const subject = await loadActiveSubject(actor, data.subject);
  const outcomes = await loadSubjectOutcomes(actor, subject._id);
  const current = findTheme(subject.toObject(), outcomes, data.themeKey);
  assert(current, 'Theme unavailable', 404);

  const next = {
    ...current,
    ...(data.titleEn !== undefined ? { titleEn: data.titleEn } : {}),
    ...(data.titleNe !== undefined ? { titleNe: data.titleNe } : {}),
    ...(data.workingHours !== undefined ? { workingHours: data.workingHours } : {}),
    ...(data.sequence !== undefined ? { sequence: data.sequence } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
  };
  assert(next.titleEn || next.titleNe, 'Give the theme a name in English or Nepali');

  setThemeOnSubject(subject, next);
  await subject.save();
  await CasLearningOutcome.updateMany(themeOutcomeFilter(actor, subject._id, current), {
    $set: {
      themeKey: next.key,
      themeEn: next.titleEn,
      themeNe: next.titleNe,
    },
  });
  return serializeTheme(next);
}

const BOOK_ROW_FIELDS = [
  'titleEn', 'titleNe',
  'assessmentAspect', 'assessmentAspectNe',
  'assessmentTool', 'assessmentToolNe',
];
const bookRowContent = (row) =>
  Object.fromEntries(BOOK_ROW_FIELDS.map((field) => [field, row[field] || '']));

/**
 * Save a theme exactly as the school edited it on the Curriculum screen.
 *
 * The page sends the whole theme — name, hours and every row in book order —
 * and this reconciles it in one transaction: changed rows are updated, new
 * rows created, and rows left out removed (archived when a teacher has already
 * scored them). Either the whole edit lands or none of it does, so a school
 * never ends up with half a theme after a failed save.
 */
export async function saveThemeBook(actor, input) {
  requireSchoolAdmin(actor);
  const data = themeBookInput.parse(input);
  await connectDB();
  await ensureCasIndexes();

  return mongoose.connection.transaction(async (session) => {
    const subject = await CasSubject.findOne({
      _id: data.subject,
      school: actor.school,
      status: 'ACTIVE',
    }).session(session);
    assert(subject, 'Subject unavailable', 404);
    const outcomes = await CasLearningOutcome.find({
      school: actor.school,
      subject: subject._id,
      status: 'ACTIVE',
    }).sort({ sequence: 1, _id: 1 }).session(session).lean();
    const theme = findTheme(subject.toObject(), outcomes, data.themeKey);
    assert(theme, 'Theme unavailable', 404);

    const current = outcomes.filter((row) => outcomeThemeKey(row) === theme.key);
    const byId = new Map(current.map((row) => [String(row._id), row]));
    const rows = data.rows.map((row) => ({ ...row, id: row.id?.toLowerCase() }));
    assert(
      rows.every((row) => !row.id || byId.has(row.id)),
      'This theme changed while you were editing. Reload before saving.',
      409,
    );

    const scored = new Set((current.length
      ? await CasAssessment.distinct('outcome', {
          school: actor.school,
          outcome: { $in: current.map((row) => row._id) },
        }).session(session)
      : []).map(String));

    const next = {
      ...theme,
      titleEn: data.titleEn,
      titleNe: data.titleNe,
      workingHours: data.workingHours ?? null,
    };
    // A theme left with no rows has nothing to assess.
    const labels = { themeKey: theme.key, themeEn: next.titleEn, themeNe: next.titleNe };

    // Scored rows may be reworded: their results stay attached to the row, and
    // a published report keeps the wording it was published with (snapshot).
    const updates = [];
    rows.forEach((row) => {
      if (!row.id) return;
      const existing = byId.get(row.id);
      updates.push({
        updateOne: {
          filter: { _id: existing._id, school: actor.school },
          update: { $set: { ...bookRowContent(row), ...labels } },
        },
      });
    });

    const kept = new Set(rows.map((row) => row.id).filter(Boolean));
    const removed = current.filter((row) => !kept.has(String(row._id)));
    const archive = removed.filter((row) => scored.has(String(row._id))).map((row) => row._id);
    const erase = removed.filter((row) => !scored.has(String(row._id))).map((row) => row._id);

    const additions = rows.filter((row) => !row.id);
    if (additions.length) {
      // Archived rows keep their codes, so read every row the subject has.
      const taken = await CasLearningOutcome.find({ school: actor.school, subject: subject._id })
        .select('code sequence').session(session).lean();
      const codes = new Set(taken.map((row) => row.code));
      let sequence = taken.reduce((max, row) => Math.max(max, row.sequence || 0), 0);
      const nextCode = () => {
        let code;
        do {
          sequence += 1;
          code = `${subject.code}-${String(sequence).padStart(2, '0')}`;
        } while (codes.has(code));
        codes.add(code);
        return code;
      };
      await CasLearningOutcome.create(additions.map((row) => ({
        school: actor.school,
        grade: subject.grade,
        subject: subject._id,
        subjectCode: subject.code,
        code: nextCode(),
        ...labels,
        ...bookRowContent(row),
        sequence,
        createdBy: actor.id,
      })), { session, ordered: true });
    }

    if (updates.length) await CasLearningOutcome.bulkWrite(updates, { session });
    if (archive.length) {
      await CasLearningOutcome.updateMany(
        { _id: { $in: archive }, school: actor.school },
        { $set: { status: 'ARCHIVED' } },
        { session },
      );
    }
    if (erase.length) {
      await CasLearningOutcome.deleteMany({ _id: { $in: erase }, school: actor.school }, { session });
    }

    setThemeOnSubject(subject, next);
    await subject.save({ session });
    return {
      theme: serializeTheme({ ...next, outcomeCount: rows.length }),
      created: additions.length,
      updated: updates.length,
      archived: archive.length,
      deleted: erase.length,
    };
  });
}

/**
 * Send a theme for assessment, or take it back.
 *
 * Sending is what makes a theme visible on the Assessment screen: the school
 * finishes its rows here first, so a teacher never opens a half-written book.
 * Taking a theme back hides it again; results already recorded are untouched.
 */
export async function deleteTheme(actor, input) {
  requireSchoolAdmin(actor);
  const data = themeDeleteInput.parse(input);
  await connectDB();

  const subject = await loadActiveSubject(actor, data.subject);
  const outcomes = await loadSubjectOutcomes(actor, subject._id);
  const theme = findTheme(subject.toObject(), outcomes, data.themeKey);
  assert(theme, 'Theme unavailable', 404);

  const themeOutcomes = await CasLearningOutcome.find(
    themeOutcomeFilter(actor, subject._id, theme),
  ).select('_id').lean();
  const outcomeIds = themeOutcomes.map((outcome) => outcome._id);
  const assessed = outcomeIds.length
    ? await CasAssessment.countDocuments({ school: actor.school, outcome: { $in: outcomeIds } })
    : 0;

  if (assessed > 0) {
    await CasLearningOutcome.updateMany(
      { _id: { $in: outcomeIds }, school: actor.school },
      { $set: { status: 'ARCHIVED' } },
    );
    setThemeOnSubject(subject, { ...theme, status: 'ARCHIVED' });
    await subject.save();
    return { archived: true, retainedAssessments: assessed };
  }

  if (outcomeIds.length) {
    await CasLearningOutcome.deleteMany({ _id: { $in: outcomeIds }, school: actor.school });
  }
  removeThemeFromSubject(subject, theme.key);
  await subject.save();
  return { archived: false, retainedAssessments: 0 };
}

export async function deleteOutcome(actor, input) {
  requireSchoolAdmin(actor);
  const { id } = deleteInput.parse(input);
  await connectDB();

  const outcome = await CasLearningOutcome.findOne({
    _id: id,
    school: actor.school,
  }).lean();
  assert(outcome, 'Learning outcome unavailable', 404);

  const assessed = await CasAssessment.countDocuments({ outcome: outcome._id });
  if (assessed > 0) {
    await CasLearningOutcome.updateOne(
      { _id: outcome._id },
      { $set: { status: 'ARCHIVED' } },
    );
    return { archived: true, retainedAssessments: assessed };
  }
  await CasLearningOutcome.deleteOne({ _id: outcome._id });
  return { archived: false, retainedAssessments: 0 };
}

/** The grade must be one the school actually runs, per its Pravyo config. */
async function assertGradeExists(actor, grade) {
  if (actor.library) {
    assert(LIBRARY_GRADES.includes(grade), 'The default library covers Grades 1 to 5', 400);
    return;
  }
  const SchoolConfig = (await import('@pravyo/db/models/SchoolConfig')).default;
  const config = await SchoolConfig.findOne({ school: actor.school })
    .select('grades')
    .lean();
  assert(
    !config?.grades?.length || config.grades.includes(grade),
    'Choose a grade your school runs in Pravyo',
  );
}
