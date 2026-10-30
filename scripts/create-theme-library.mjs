/**
 * Create the platform's default theme library from one school's curriculum,
 * and link that school's subjects to it.
 *
 * Usage:
 *   node scripts/create-theme-library.mjs --source <schoolId> --dry-run
 *   node scripts/create-theme-library.mjs --source <schoolId>
 *
 * - Copies the source school's ACTIVE subjects for Grades 1–5, with their
 *   active themes and learning outcomes, under the reserved library id.
 * - Never overwrites: a library subject that already exists (same grade and
 *   code) is left exactly as the super admin may have edited it.
 * - Links the source school: each copied subject gets `librarySubject`, and
 *   each of its themes records `sourceThemeKey` + `sourceHash`, so the school
 *   sees future library changes as "Update available". The school's own
 *   curriculum content, marks and results are not changed.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { LIBRARY_SCHOOL_ID, gradeNumber } from '../packages/core/themeLibrary.js';
import { themeHash } from '../packages/cas/lib/casThemeHash.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, 'apps/pravyo/.env.local'), quiet: true });

const args = process.argv.slice(2);
const source = args[args.indexOf('--source') + 1];
const dryRun = args.includes('--dry-run');
if (!/^[a-f\d]{24}$/i.test(String(source || ''))) {
  console.error('Pass the source school id: --source <schoolId>');
  process.exit(1);
}

const themeKeyOf = (row) => row.themeKey || `${row.themeNe || ''}|${row.themeEn || ''}`;

function themesOf(subject, outcomes) {
  const themes = (subject.themes || [])
    .filter((theme) => (theme.status || 'ACTIVE') === 'ACTIVE')
    .map((theme) => ({ ...theme, outcomes: [] }));
  const byKey = new Map(themes.map((theme) => [theme.key, theme]));
  for (const outcome of outcomes) {
    const key = themeKeyOf(outcome);
    if (!byKey.has(key)) {
      const theme = { key, titleEn: outcome.themeEn || '', titleNe: outcome.themeNe || '', sequence: themes.length + 1, status: 'ACTIVE', outcomes: [] };
      themes.push(theme);
      byKey.set(key, theme);
    }
    byKey.get(key).outcomes.push(outcome);
  }
  return themes;
}

await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
const db = mongoose.connection.db;
const subjectsCol = db.collection('cassubjects');
const outcomesCol = db.collection('caslearningoutcomes');
const sourceId = new mongoose.Types.ObjectId(source);
const libraryId = new mongoose.Types.ObjectId(LIBRARY_SCHOOL_ID);

const sourceSubjects = (await subjectsCol.find({ school: sourceId, status: 'ACTIVE' }).toArray())
  .filter((subject) => { const n = gradeNumber(subject.grade); return n >= 1 && n <= 5; });
console.log(`${dryRun ? '[dry run] ' : ''}${sourceSubjects.length} subject(s) in Grades 1–5 at the source school`);

const now = new Date();
for (const subject of sourceSubjects) {
  const outcomes = await outcomesCol.find({ school: sourceId, subject: subject._id, status: 'ACTIVE' }).toArray();
  const themes = themesOf(subject, outcomes);
  let library = await subjectsCol.findOne({ school: libraryId, grade: subject.grade, code: subject.code });

  if (library) {
    console.log(`  = ${subject.grade} ${subject.code}: library subject already exists — left unchanged`);
  } else {
    console.log(`  + ${subject.grade} ${subject.code} "${subject.titleEn}": ${themes.length} themes, ${outcomes.length} outcomes`);
    if (!dryRun) {
      const { insertedId } = await subjectsCol.insertOne({
        school: libraryId, grade: subject.grade, code: subject.code,
        titleEn: subject.titleEn, titleNe: subject.titleNe || '', sequence: subject.sequence || 1,
        creditHours: subject.creditHours ?? null,
        taught: true, examined: true, kind: 'COMPULSORY', optionalGroup: '', sections: [], librarySubject: null,
        themes: themes.map((theme) => ({
          key: theme.key, titleEn: theme.titleEn || '', titleNe: theme.titleNe || '',
          workingHours: theme.workingHours ?? null, sequence: theme.sequence || 1, status: 'ACTIVE',
        })),
        status: 'ACTIVE', createdAt: now, updatedAt: now,
      });
      if (outcomes.length) {
        await outcomesCol.insertMany(outcomes.map((row) => {
          const { _id, createdBy, createdAt, updatedAt, __v, ...rest } = row;
          return { ...rest, school: libraryId, subject: insertedId, themeKey: themeKeyOf(row), createdAt: now, updatedAt: now };
        }));
      }
      library = await subjectsCol.findOne({ _id: insertedId });
    }
  }

  // Link the source school's subject and its themes to the library copy.
  if (!dryRun && library) {
    const libraryOutcomes = await outcomesCol.find({ school: libraryId, subject: library._id, status: 'ACTIVE' }).toArray();
    const libraryThemes = new Map(themesOf(library, libraryOutcomes).map((theme) => [theme.key, theme]));
    const linkedThemes = (subject.themes || []).map((theme) => {
      const match = libraryThemes.get(theme.key);
      return match ? { ...theme, sourceThemeKey: match.key, sourceHash: themeHash(match, match.outcomes) } : theme;
    });
    // Themes that exist only as outcome labels get a proper entry so they can be linked too.
    for (const theme of themes) {
      if (linkedThemes.some((entry) => entry.key === theme.key)) continue;
      const match = libraryThemes.get(theme.key);
      if (match) {
        linkedThemes.push({
          key: theme.key, titleEn: theme.titleEn || '', titleNe: theme.titleNe || '', workingHours: null,
          sequence: theme.sequence || linkedThemes.length + 1, status: 'ACTIVE',
          sourceThemeKey: match.key, sourceHash: themeHash(match, match.outcomes),
        });
      }
    }
    await subjectsCol.updateOne({ _id: subject._id }, { $set: { librarySubject: library._id, themes: linkedThemes, updatedAt: now } });
    console.log(`    linked ${subject.grade} ${subject.code} at the source school`);
  }
}

await mongoose.disconnect();
console.log(dryRun ? 'Dry run finished — nothing was written.' : 'Theme library ready.');
