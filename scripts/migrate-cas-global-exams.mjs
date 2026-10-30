import process from 'node:process';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '@pravyo/db';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
if (apply === dryRun) {
  throw new Error('Choose exactly one mode: --dry-run or --apply.');
}

function id(value) {
  return String(value?._id || value);
}

function identity(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

function uniqueCollisionCount(rows, keyOf) {
  const seen = new Set();
  let collisions = 0;
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) collisions += 1;
    else seen.add(key);
  }
  return collisions;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();
  const exams = await CasExam.collection.find({ mergedInto: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).toArray();
  const groups = new Map();
  for (const exam of exams) {
    const examName = identity(exam.name);
    if (!examName) throw new Error(`Exam ${id(exam)} has no usable name; correct it before migration.`);
    const key = `${id(exam.school)}:${id(exam.academicYear)}:${examName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(exam);
  }

  const remap = new Map();
  const canonical = [];
  for (const group of groups.values()) {
    const primary = group[0];
    const isActive = group.some((exam) => exam.status !== 'ARCHIVED');
    canonical.push({ exam: primary, name: String(primary.name || '').trim(), status: isActive ? 'ACTIVE' : 'ARCHIVED' });
    for (const exam of group.slice(1)) remap.set(id(exam), id(primary));
  }

  const affectedIds = [...new Set([...remap.keys(), ...remap.values()])];
  const affectedObjectIds = affectedIds.map((value) => new mongoose.Types.ObjectId(value));
  const newIdFor = (examId) => remap.get(id(examId)) || id(examId);
  const [assignments, assessments, reports] = affectedObjectIds.length
    ? await Promise.all([
        CasThemeExam.find({ exam: { $in: affectedObjectIds } }).lean(),
        CasAssessment.find({ exam: { $in: affectedObjectIds } }).lean(),
        CasReport.find({ $or: [
          { exam: { $in: affectedObjectIds } },
          { resultKey: { $in: affectedIds } },
          { resultKey: { $in: affectedIds.map(value => `CUMULATIVE:${value}`) } },
        ] }).lean(),
      ])
    : [[], [], []];

  const assignmentCollisions = uniqueCollisionCount(assignments, (row) => [
    id(row.school), id(row.academicYear), row.grade, id(row.subject), row.themeKey, newIdFor(row.exam),
  ].join('|'));
  const assessmentCollisions = uniqueCollisionCount(assessments, (row) => [
    id(row.academicYear), id(row.student), id(row.outcome), newIdFor(row.exam),
  ].join('|'));
  const reportCollisions = uniqueCollisionCount(reports, (row) => {
    let resultKey = row.resultKey;
    if (remap.has(resultKey)) resultKey = remap.get(resultKey);
    else if (String(resultKey || '').startsWith('CUMULATIVE:')) {
      const examId = String(resultKey).slice('CUMULATIVE:'.length);
      if (remap.has(examId)) resultKey = `CUMULATIVE:${remap.get(examId)}`;
    }
    return [id(row.school), id(row.academicYear), id(row.student), resultKey || `NO_KEY:${id(row._id)}`].join('|');
  });

  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`CAS exams found: ${exams.length}`);
  console.log(`Year-wide exam records after consolidation: ${canonical.length}`);
  console.log(`Duplicate exam records to merge: ${remap.size}`);
  console.log(`Theme assignments to remap: ${assignments.length}`);
  console.log(`Assessments to remap: ${assessments.length}`);
  console.log(`Reports to remap: ${reports.length}`);
  console.log(`Unique-key collisions (assignments / assessments / reports): ${assignmentCollisions} / ${assessmentCollisions} / ${reportCollisions}`);
  console.log('Exam identities are grouped by school, academic year and case-insensitive trimmed name.');

  if (assignmentCollisions || assessmentCollisions || reportCollisions) {
    throw new Error('Migration stopped before writes: resolve the reported duplicate references, then rerun the dry run.');
  }
  if (dryRun) {
    console.log('DRY RUN: no database records or indexes were changed.');
    return;
  }

  await mongoose.connection.transaction(async (session) => {
    for (const [from, to] of remap) {
      const oldId = new mongoose.Types.ObjectId(from);
      const newId = new mongoose.Types.ObjectId(to);
      await CasThemeExam.updateMany({ exam: oldId }, { $set: { exam: newId } }, { session });
      await CasAssessment.updateMany({ exam: oldId }, { $set: { exam: newId } }, { session });
      await CasReport.updateMany({ exam: oldId }, { $set: { exam: newId } }, { session });
      await CasReport.updateMany({ resultKey: from }, { $set: { resultKey: to } }, { session });
      await CasReport.updateMany({ resultKey: `CUMULATIVE:${from}` }, { $set: { resultKey: `CUMULATIVE:${to}` } }, { session });
      await CasReport.updateMany({ 'snapshot.examId': from }, { $set: { 'snapshot.examId': to } }, { session });
    }

    for (const row of canonical) {
      await CasExam.collection.updateOne(
        { _id: row.exam._id },
        { $set: { name: row.name, status: row.status, isAlias: false }, $unset: { grade: '', mergedInto: '' } },
        { session },
      );
    }
    for (const [from, to] of remap) {
      await CasExam.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(from) },
        { $set: { status: 'ARCHIVED', isAlias: true, mergedInto: new mongoose.Types.ObjectId(to) } },
        { session },
      );
    }
  });

  const indexes = await CasExam.collection.indexes();
  for (const index of indexes) {
    if (index.unique && index.key.school === 1 && index.key.academicYear === 1 && index.key.grade === 1 && index.key.name === 1) {
      await CasExam.collection.dropIndex(index.name);
    }
    if (index.key.school === 1 && index.key.academicYear === 1 && index.key.grade === 1 && index.key.status === 1) {
      await CasExam.collection.dropIndex(index.name);
    }
  }
  await CasExam.createIndexes();
  console.log('Migration complete: exams now have one identity per school and academic year.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
