/**
 * Load a transcribed assessment book into the default theme library.
 *
 * Usage:
 *   node scripts/load-library-grade.mjs data/curriculum/books/grade-4.json            (dry run)
 *   node scripts/load-library-grade.mjs data/curriculum/books/grade-4.json --apply
 *
 * The JSON comes from `node scripts/build-curriculum-books.mjs`.
 *
 * - Writes only under the reserved library id (packages/core/themeLibrary.js);
 *   no school is touched. Schools receive the new subjects through
 *   `npm run provision:curriculum` (or automatically on approval).
 * - Insert-only: a library subject that already exists for the grade and code
 *   is skipped, so whatever the super admin edited stays exactly as it is.
 * - Keys follow the existing library: theme `ENG-T01`, outcome `ENG-T01-01`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { LIBRARY_GRADES, LIBRARY_SCHOOL_ID } from '../packages/core/themeLibrary.js';

dotenv.config({ path: 'apps/pravyo/.env.local', quiet: true });
dotenv.config({ path: '.env.local', quiet: true });

const fileArg = process.argv[2];
const apply = process.argv.includes('--apply');
if (!fileArg || fileArg.startsWith('--')) {
  console.error('Usage: node scripts/load-library-grade.mjs <grade-N.json> [--apply]');
  process.exit(1);
}

const pad = (value) => String(value).padStart(2, '0');
const payload = JSON.parse(await readFile(path.resolve(fileArg), 'utf8'));
if (!LIBRARY_GRADES.includes(payload.grade) || !Array.isArray(payload.subjects)) {
  throw new Error(`File must hold one of ${LIBRARY_GRADES.join(', ')} and a subjects array`);
}

await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const subjectsCol = db.collection('cassubjects');
const outcomesCol = db.collection('caslearningoutcomes');
const library = new mongoose.Types.ObjectId(LIBRARY_SCHOOL_ID);
const now = new Date();

console.log(`${apply ? 'Writing' : 'DRY RUN — nothing is written'}: ${payload.grade} → default theme library`);

// Display order as the books print it; codes not listed keep their file order after these.
const ORDER = ['NEP', 'ENG', 'MATH', 'SOC', 'SCI', 'HPA', 'SURR'];
const rank = (code) => { const at = ORDER.indexOf(String(code).toUpperCase()); return at === -1 ? ORDER.length : at; };
payload.subjects.sort((a, b) => rank(a.code) - rank(b.code));

try {
  for (const [index, subject] of payload.subjects.entries()) {
    const code = String(subject.code).toUpperCase();
    const existing = await subjectsCol.findOne({ school: library, grade: payload.grade, code });
    const outcomeTotal = subject.themes.reduce((sum, theme) => sum + theme.outcomes.length, 0);
    if (existing) {
      console.log(`  = ${code.padEnd(5)} ${subject.titleEn}: already in the library — skipped`);
      continue;
    }

    const themes = subject.themes.map((theme) => ({
      key: `${code}-T${pad(theme.sequence)}`,
      titleEn: theme.titleEn || '',
      titleNe: theme.titleNe || '',
      workingHours: theme.workingHours ?? null,
      sequence: theme.sequence,
      status: 'ACTIVE',
    }));
    console.log(`  + ${code.padEnd(5)} ${subject.titleEn} (${subject.creditHours} CH): ${themes.length} themes, ${outcomeTotal} outcomes`);
    if (!apply) continue;

    const { insertedId } = await subjectsCol.insertOne({
      school: library, grade: payload.grade, code,
      titleEn: subject.titleEn, titleNe: subject.titleNe || '', sequence: index + 1,
      creditHours: subject.creditHours ?? null,
      taught: true, examined: true, kind: 'COMPULSORY', optionalGroup: '', sections: [], librarySubject: null,
      themes, status: 'ACTIVE', createdAt: now, updatedAt: now,
    });

    const rows = subject.themes.flatMap((theme) => theme.outcomes.map((outcome, oIndex) => ({
      school: library, grade: payload.grade, subject: insertedId, subjectCode: code,
      code: `${code}-T${pad(theme.sequence)}-${pad(oIndex + 1)}`,
      themeKey: `${code}-T${pad(theme.sequence)}`,
      themeEn: theme.titleEn || '', themeNe: theme.titleNe || '',
      titleEn: outcome.titleEn || '', titleNe: outcome.titleNe || '',
      descriptors: (outcome.descriptors || []).map((d) => ({ level: d.level, textEn: d.textEn || '', textNe: d.textNe || '' })),
      indicators: [],
      assessmentAspect: outcome.assessmentAspect || '', assessmentAspectNe: outcome.assessmentAspectNe || '',
      assessmentTool: outcome.assessmentTool || '', assessmentToolNe: outcome.assessmentToolNe || '',
      sequence: oIndex + 1, status: 'ACTIVE', createdAt: now, updatedAt: now,
    })));
    if (rows.length) await outcomesCol.insertMany(rows);
  }
} finally {
  await mongoose.disconnect();
}
console.log(apply ? 'Done. Run `npm run provision:curriculum -- --dry-run` to see which schools would receive it.' : 'Dry run finished. Re-run with --apply to write.');
