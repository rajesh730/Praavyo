/**
 * Load curriculum content into a school from a JSON file.
 *
 * Usage:
 *   node scripts/seed-curriculum.mjs data/curriculum/grade-3.json --school <schoolId>
 *   node scripts/seed-curriculum.mjs data/curriculum/grade-3.json --school <schoolId> --dry-run
 *
 * Idempotent: subjects and outcomes are matched on their code, so re-running
 * updates text rather than creating duplicates. Nothing is ever deleted — an
 * outcome that has already been assessed must keep meaning what it meant when
 * the level was awarded.
 *
 * The school id is required and never guessed. Find it with `npm run db:inspect`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const [, , fileArg, ...rest] = process.argv;
const flags = new Map();
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, true);
    }
  }
}

const schoolId = flags.get('school');
const dryRun = Boolean(flags.get('dry-run'));
const pad = (value) => String(value).padStart(2, '0');

function themeKeyFor(subjectCode, theme) {
  return theme.key || `${subjectCode}-T${pad(theme.sequence || 1)}`;
}

function normalizeThemes(subject, subjectCode) {
  return (subject.themes || []).map((theme, index) => ({
    key: themeKeyFor(subjectCode, theme),
    titleEn: theme.titleEn || '',
    titleNe: theme.titleNe || '',
    workingHours: theme.workingHours ?? null,
    sequence: theme.sequence || index + 1,
    status: theme.status || 'ACTIVE',
    assessmentStatus: theme.assessmentStatus || 'PUBLISHED',
    publishedAt: theme.publishedAt ? new Date(theme.publishedAt) : null,
  }));
}

function subjectOutcomes(subject, subjectCode) {
  if (Array.isArray(subject.outcomes)) return subject.outcomes;
  return (subject.themes || []).flatMap((theme) => {
    const themeKey = themeKeyFor(subjectCode, theme);
    return (theme.outcomes || []).map((outcome, index) => ({
      code: `${subjectCode}-T${pad(theme.sequence || 1)}-${pad(index + 1)}`,
      themeKey,
      themeEn: theme.titleEn || '',
      themeNe: theme.titleNe || '',
      ...outcome,
    }));
  });
}

if (!fileArg || !schoolId) {
  console.error(
    'Usage: node scripts/seed-curriculum.mjs <file.json> --school <schoolId> [--dry-run]',
  );
  process.exit(1);
}
if (!/^[a-f\d]{24}$/i.test(schoolId)) {
  console.error('--school must be a 24-character MongoDB id');
  process.exit(1);
}

/**
 * Expected file shape:
 * {
 *   "grade": "Grade 3",
 *   "source": "Asmita Publication — विद्यार्थी मूल्याङ्कन अभिलेख कार्यसञ्चयिका, कक्षा ३",
 *   "subjects": [
 *     { "code": "NEP", "titleEn": "Nepali", "titleNe": "मेरो नेपाली",
 *       "outcomes": [
 *         { "code": "NEP-01", "themeEn": "Reading comprehension", "themeNe": "पठन बोध",
 *           "titleEn": "...", "titleNe": "..." }
 *       ] }
 *   ]
 * }
 */
async function main() {
  const filePath = path.resolve(fileArg);
  const payload = JSON.parse(await readFile(filePath, 'utf8'));

  if (!payload.grade || !Array.isArray(payload.subjects)) {
    throw new Error('File must define "grade" and a "subjects" array');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;

  const school = await db
    .collection('users')
    .findOne({ _id: new mongoose.Types.ObjectId(schoolId), role: 'SCHOOL_ADMIN' });
  if (!school) throw new Error(`No SCHOOL_ADMIN user with id ${schoolId}`);

  console.log(`School:  ${school.schoolName}`);
  console.log(`Grade:   ${payload.grade}`);
  console.log(`Source:  ${payload.source || '(not stated)'}`);
  console.log(dryRun ? 'Mode:    DRY RUN — nothing will be written\n' : 'Mode:    writing\n');

  const subjects = db.collection('cassubjects');
  const outcomes = db.collection('caslearningoutcomes');
  const now = new Date();
  let createdSubjects = 0;
  let createdOutcomes = 0;
  let updatedOutcomes = 0;

  for (const [index, subject] of payload.subjects.entries()) {
    if (!subject.code || !subject.titleEn) {
      throw new Error(`Subject ${index + 1} needs a code and titleEn`);
    }
    const code = String(subject.code).toUpperCase();
    const themes = normalizeThemes(subject, code);
    const outcomesForSubject = subjectOutcomes(subject, code);
    const key = {
      school: new mongoose.Types.ObjectId(schoolId),
      grade: payload.grade,
      code,
    };

    let subjectDoc = await subjects.findOne(key);
    if (subjectDoc && !dryRun) {
      // Keep book metadata in step on a re-run without touching assessment rows.
      const subjectPatch = {
        titleEn: subject.titleEn,
        titleNe: subject.titleNe || '',
        updatedAt: now,
      };
      if (subject.creditHours != null) subjectPatch.creditHours = subject.creditHours;
      if (themes.length) subjectPatch.themes = themes;
      await subjects.updateOne(
        { _id: subjectDoc._id },
        { $set: subjectPatch },
      );
    }
    if (!subjectDoc) {
      createdSubjects += 1;
      if (!dryRun) {
        const result = await subjects.insertOne({
          ...key,
          titleEn: subject.titleEn,
          titleNe: subject.titleNe || '',
          // Drives the credit-hour weighting on the GPA sheet.
          creditHours: subject.creditHours ?? null,
          themes,
          sequence: index + 1,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
        subjectDoc = { _id: result.insertedId, ...key };
      } else {
        subjectDoc = { _id: null, ...key };
      }
    }

    for (const [oIndex, outcome] of outcomesForSubject.entries()) {
      const outcomeCode = String(
        outcome.code || `${code}-${String(oIndex + 1).padStart(2, '0')}`,
      ).toUpperCase();

      const existing = subjectDoc._id
        ? await outcomes.findOne({ subject: subjectDoc._id, code: outcomeCode })
        : null;

      const doc = {
        school: new mongoose.Types.ObjectId(schoolId),
        grade: payload.grade,
        subject: subjectDoc._id,
        subjectCode: code,
        code: outcomeCode,
        themeKey: outcome.themeKey || '',
        themeEn: outcome.themeEn || '',
        themeNe: outcome.themeNe || '',
        titleEn: outcome.titleEn || '',
        titleNe: outcome.titleNe || '',
        // The book's four Indicator rows, so a teacher grades against the
        // published wording rather than their memory of it.
        descriptors: (outcome.descriptors || []).map((d) => ({
          level: d.level,
          textEn: d.textEn || '',
          textNe: d.textNe || '',
        })),
        // Checklist sub-points, where the subject uses them.
        indicators: (outcome.indicators || []).map((i) => ({
          textEn: i.textEn || '',
          textNe: i.textNe || '',
          tool: i.tool || '',
        })),
        assessmentAspect: outcome.assessmentAspect || '',
        assessmentAspectNe: outcome.assessmentAspectNe || '',
        assessmentTool: outcome.assessmentTool || '',
        assessmentToolNe: outcome.assessmentToolNe || '',
        sequence: oIndex + 1,
        status: 'ACTIVE',
        updatedAt: now,
      };

      if (existing) {
        updatedOutcomes += 1;
        if (!dryRun) {
          await outcomes.updateOne({ _id: existing._id }, { $set: doc });
        }
      } else {
        createdOutcomes += 1;
        if (!dryRun) {
          await outcomes.insertOne({ ...doc, createdAt: now });
        }
      }
    }

    // The book states an outcome count per theme; print the tally per theme so
    // a transcription that dropped a row is visible immediately.
    const byTheme = new Map();
    for (const o of outcomesForSubject) {
      const key = o.themeEn || o.themeNe || '(no theme)';
      byTheme.set(key, (byTheme.get(key) || 0) + 1);
    }
    console.log(
      `  ${code.padEnd(6)} ${subject.titleEn.padEnd(20)} ${outcomesForSubject.length} outcomes` +
        (subject.creditHours != null ? `  ${subject.creditHours} credit hours` : ''),
    );
    for (const [theme, count] of byTheme) {
      console.log(`         ${String(count).padStart(3)}  ${theme}`);
    }
  }

  console.log(
    `\n${dryRun ? 'Would create' : 'Created'}: ${createdSubjects} subjects, ${createdOutcomes} outcomes` +
      `\n${dryRun ? 'Would update' : 'Updated'}: ${updatedOutcomes} outcomes`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
