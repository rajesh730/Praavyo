import process from 'node:process';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '@pravyo/db';
import User from '@pravyo/db/models/User';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import { LIBRARY_SCHOOL_ID } from '@pravyo/core/themeLibrary';
import { provisionDefaultCurriculum } from '@pravyo/cas/lib/casLibraryService';

/**
 * Bring every approved school up to date with the default library (Grades
 * 1–5) — the same copy a school receives automatically on approval.
 *
 *   npm run provision:curriculum -- --dry-run
 *   npm run provision:curriculum -- --apply
 *
 * Run it after the super admin finishes a new grade in the library (e.g.
 * Grade 4), so schools approved earlier receive it too. Safe to re-run: each
 * library subject reaches a school at most once, grades a school set up
 * itself are skipped, and nothing existing is changed.
 *
 * --dry-run copies nothing: it lists, per school, the library subjects that
 * --apply would copy (grades the school manages itself are reported by
 * --apply as skipped).
 */

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
if (apply === dryRun) {
  throw new Error('Choose exactly one mode: --dry-run or --apply.');
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();

  const library = await CasSubject.find({ school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' })
    .select('grade code').sort({ grade: 1, sequence: 1 }).lean();
  if (!library.length) throw new Error('The default library is empty; nothing to copy.');
  const grades = [...new Set(library.map((row) => row.grade))];
  console.log(`Default library: ${library.length} subjects in ${grades.join(', ')}`);

  const schools = await User.find({ role: 'SCHOOL_ADMIN', status: { $in: ['APPROVED', 'SUBSCRIBED'] } })
    .select('schoolName email casDefaultSubjects').lean();

  for (const school of schools) {
    const label = `${school.schoolName || '(no name)'} <${school.email}> ${school._id}`;
    const received = new Set((school.casDefaultSubjects || []).map(String));
    if (dryRun) {
      const own = await CasSubject.find({ school: school._id }).select('grade code librarySubject').lean();
      const selfManaged = new Set(own
        .filter((row) => !(row.librarySubject && received.has(String(row.librarySubject))))
        .map((row) => row.grade));
      const pending = library.filter((row) => !received.has(String(row._id)));
      const wouldCopy = pending.filter((row) => !selfManaged.has(row.grade));
      const skipped = [...new Set(pending.filter((row) => selfManaged.has(row.grade)).map((row) => row.grade))];
      console.log(`  ${label}\n      would copy ${wouldCopy.length} subjects${skipped.length ? `; skips ${skipped.join(', ')} (school's own subjects)` : ''}`);
      continue;
    }

    const result = await provisionDefaultCurriculum(school._id, { received: [...received] });
    if (result.copied.length) {
      await User.updateOne({ _id: school._id }, { $addToSet: { casDefaultSubjects: { $each: result.copied } } });
    }
    console.log(`  ${label}\n      copied ${result.subjects} subjects, ${result.themes} themes, ${result.outcomes} outcomes`
      + `${result.skippedGrades.length ? `; skipped ${result.skippedGrades.join(', ')} (school's own subjects)` : ''}`);
    if (result.error) {
      console.error(`      FAILED: ${result.error.message} — re-run to continue`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
