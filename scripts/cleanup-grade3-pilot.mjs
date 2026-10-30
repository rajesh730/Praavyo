/**
 * Remove the Grade 3 pilot rows that the (now deleted) seed script wrote
 * straight into the Pravyo roster. CAS students must come only from students
 * a school admin registers in Pravyo.
 *
 * Usage:
 *   node scripts/cleanup-grade3-pilot.mjs --dry-run
 *   node scripts/cleanup-grade3-pilot.mjs --confirm
 *
 * Deletes strictly by the ids recorded in data/seed/grade3-pilot.json — it
 * never matches on name, grade or date, so it cannot take a real student with
 * it. Also removes any CAS assessments and reports belonging to those students,
 * because leaving those behind would orphan rows pointing at deleted people.
 *
 * Refuses to run without --confirm.
 */
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import connectDB from '@pravyo/db';
import Student from '@pravyo/db/models/Student';
import Parent from '@pravyo/db/models/Parent';
import ParentStudentLink from '@pravyo/db/models/ParentStudentLink';
import AcademicYear from '@pravyo/db/models/AcademicYear';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';

dotenv.config({ path: '.env.local', quiet: true });

const MANIFEST = 'data/seed/grade3-pilot.json';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirmed = args.includes('--confirm');

if (!dryRun && !confirmed) {
  console.error(
    'This deletes students, guardians and their assessment records.\n' +
      'Run with --dry-run to preview, or --confirm to proceed.',
  );
  process.exit(1);
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    throw new Error(
      `No manifest at ${MANIFEST}. Nothing to clean up, or it was already removed.`,
    );
  }

  const students = manifest.students || [];
  const parents = manifest.parents || [];
  const links = manifest.links || [];

  await connectDB();

  const [assessments, reports] = await Promise.all([
    CasAssessment.countDocuments({ student: { $in: students } }),
    CasReport.countDocuments({ student: { $in: students } }),
  ]);

  console.log(`Manifest:    ${MANIFEST}  (seeded ${manifest.createdAt})`);
  console.log(`Students:    ${students.length}`);
  console.log(`Guardians:   ${parents.length}`);
  console.log(`Links:       ${links.length}`);
  console.log(`Assessments: ${assessments}`);
  console.log(`Reports:     ${reports}`);

  if (dryRun) {
    console.log('\nDRY RUN — nothing deleted.');
    return;
  }

  // Assessments and reports first: if the run dies halfway, the manifest still
  // names the students, so a retry can finish the job.
  const removedAssessments = await CasAssessment.deleteMany({ student: { $in: students } });
  const removedReports = await CasReport.deleteMany({ student: { $in: students } });
  const removedLinks = await ParentStudentLink.deleteMany({ _id: { $in: links } });
  const removedStudents = await Student.deleteMany({ _id: { $in: students } });
  const removedParents = await Parent.deleteMany({ _id: { $in: parents } });

  if (removedStudents.deletedCount > 0 && manifest.schoolId) {
    await AcademicYear.updateOne(
      { school: manifest.schoolId, status: 'ACTIVE' },
      { $inc: { 'summary.admitted': -removedStudents.deletedCount } },
    );
  }

  console.log(
    `\nDeleted: ${removedStudents.deletedCount} students, ` +
      `${removedParents.deletedCount} guardians, ${removedLinks.deletedCount} links, ` +
      `${removedAssessments.deletedCount} assessments, ${removedReports.deletedCount} reports.`,
  );
  console.log(`You can now delete ${MANIFEST}.`);
}

main()
  .catch((error) => {
    console.error('\nCleanup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
