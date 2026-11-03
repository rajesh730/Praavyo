import fs from 'node:fs';
import process from 'node:process';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '@pravyo/db';
import User from '@pravyo/db/models/User';
import Student from '@pravyo/db/models/Student';
import Parent from '@pravyo/db/models/Parent';
import ParentStudentLink, { applyAccessLevelDefaults } from '@pravyo/db/models/ParentStudentLink';
import SchoolConfig from '@pravyo/db/models/SchoolConfig';
import AcademicYear from '@pravyo/db/models/AcademicYear';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';
import { generatePlatformStudentId, generateUniqueStudentUsername } from '../apps/pravyo/lib/studentIdentity.js';
import { generateStrongPassword } from '../apps/pravyo/lib/passwordGenerator.js';

/**
 * One-off import of Tejaswee Pathshala's Grades 1–5 roster from the
 * government IEMIS "Control List Report" sheets (owner's request, 2026-11-03).
 *
 *   node scripts/import-tejaswee-students.mjs <students.json> <credentials.csv> --dry-run
 *   node scripts/import-tejaswee-students.mjs <students.json> <credentials.csv> --apply
 *
 * <students.json> is the sheets converted to rows: grade, sn, iemis, name,
 * gender, father, mother, dobBs. Per student it creates what the school's own
 * bulk registration creates (username, random password, enrollment in the
 * active academic year) with roll number = S.N. and the IEMIS id as the
 * student IEMIS number. Guardians follow lib/guardianLinking.js: the father is
 * the primary guardian, the mother a second one; view + notices only, no
 * Parent Access Card issued. No contacts are invented. The school's IEMIS
 * number is saved too. Passwords are written once to <credentials.csv>.
 *
 * Refuses to run if the school already has students or any IEMIS number is
 * taken, so it cannot double-import.
 */

dotenv.config({ path: 'apps/pravyo/.env.local', quiet: true });
dotenv.config({ path: '.env.local', quiet: true });

const SCHOOL_ID = '6a8e95eb0ededff148af938e';
const SCHOOL_IEMIS = '26011002772';
const [dataPath, credentialsPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
if (apply === dryRun) throw new Error('Choose exactly one mode: --dry-run or --apply.');
if (!dataPath || !credentialsPath) throw new Error('Pass <students.json> <credentials.csv>.');

// Same shape as makeEnrollmentEntry in apps/pravyo/lib/studentEnrollment.js,
// which imports through the app's "@/" alias and so cannot load here.
function makeEnrollmentEntry({ school, schoolName, grade, rollNumber, section, academicYear }) {
  return {
    school,
    schoolNameSnapshot: schoolName || '',
    grade,
    rollNumber: String(rollNumber),
    section: section || '',
    academicYear: academicYear?.year || '',
    academicYearStart: academicYear?.yearStart ?? null,
    status: 'CURRENT',
    startedAt: new Date(),
    endedAt: null,
  };
}

function splitName(full) {
  const parts = full.split(' ').filter(Boolean);
  return parts.length === 1
    ? { firstName: parts[0], middleName: '', lastName: parts[0] }
    : { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts.at(-1) };
}

async function addGuardian({ name, relationship, primary, student }) {
  const parent = await Parent.create({ name, status: 'ACTIVE', accessState: 'NOT_CREATED' });
  const preset = applyAccessLevelDefaults({ accessLevel: 'VIEW_AND_NOTICES' });
  await ParentStudentLink.create({
    parent: parent._id,
    student: student._id,
    school: SCHOOL_ID,
    relationshipType: relationship,
    accessLevel: 'VIEW_AND_NOTICES',
    canViewPortfolio: preset.canViewPortfolio,
    canReceiveNotices: preset.canReceiveNotices,
    canRegisterEvents: preset.canRegisterEvents,
    canGiveConsent: preset.canGiveConsent,
    canMessageSchool: preset.canMessageSchool,
    isPrimaryGuardian: primary,
    invitedBy: SCHOOL_ID,
    status: 'ACTIVE',
    activatedAt: new Date(),
  });
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  await connectDB();

  const school = await User.findOne({ _id: SCHOOL_ID, role: 'SCHOOL_ADMIN' }).select('schoolName').lean();
  if (!/tejaswee/i.test(school?.schoolName || '')) throw new Error('Tejaswee Pathshala not found.');
  const year = await AcademicYear.findOne({ school: SCHOOL_ID, status: 'ACTIVE' }).lean();
  if (!year) throw new Error('Tejaswee Pathshala has no active academic year.');

  // Safety checks: nothing imported yet, every IEMIS number free.
  const problems = [];
  const existing = await Student.countDocuments({ school: SCHOOL_ID, isDeleted: { $ne: true } });
  if (existing) problems.push(`school already has ${existing} students`);
  const taken = await Student.find({ iemisNumber: { $in: rows.map((row) => row.iemis) } }).select('iemisNumber').lean();
  if (taken.length) problems.push(`IEMIS numbers already registered: ${taken.map((row) => row.iemisNumber).join(', ')}`);
  const schoolIemisOwner = await SchoolConfig.findOne({ iemisNumber: SCHOOL_IEMIS, school: { $ne: SCHOOL_ID } }).select('school').lean();
  if (schoolIemisOwner) problems.push(`school IEMIS ${SCHOOL_IEMIS} belongs to another school`);
  for (const row of rows) {
    if (!parseBsNumeric(row.dobBs)) problems.push(`${row.grade} #${row.sn} ${row.name}: bad DOB ${row.dobBs}`);
    if (!['Male', 'Female'].includes(row.gender)) problems.push(`${row.grade} #${row.sn} ${row.name}: gender ${row.gender}`);
  }

  const byGrade = rows.reduce((acc, row) => ({ ...acc, [row.grade]: (acc[row.grade] || 0) + 1 }), {});
  console.log(`School: ${school.schoolName} | year ${year.year} (${year.yearStart}) | IEMIS ${SCHOOL_IEMIS}`);
  console.log(`Students: ${rows.length}`, byGrade);
  console.log(`Fathers: ${rows.filter((row) => row.father).length} | Mothers: ${rows.filter((row) => row.mother).length}`);
  console.log(`Single-word names: ${rows.filter((row) => !row.name.includes(' ')).map((row) => row.name).join(', ') || 'none'}`);
  if (problems.length) {
    console.log('PROBLEMS:\n - ' + problems.join('\n - '));
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }

  await SchoolConfig.updateOne({ school: SCHOOL_ID }, { $set: { iemisNumber: SCHOOL_IEMIS } });

  const reserved = new Set();
  const credentials = [['Grade', 'Roll', 'Name', 'Student IEMIS', 'Username', 'Password']];
  let guardians = 0;
  for (const row of rows) {
    const rollNumber = String(row.sn);
    const { firstName, middleName, lastName } = splitName(row.name);
    const username = await generateUniqueStudentUsername(Student, {
      firstName, grade: row.grade, rollNumber, school: SCHOOL_ID, reserved,
    });
    const password = generateStrongPassword();
    const student = await Student.create({
      platformStudentId: await generatePlatformStudentId(Student),
      firstName, middleName, lastName,
      name: row.name,
      username,
      password: await bcrypt.hash(password, 10),
      dateOfBirth: parseBsNumeric(row.dobBs).ad,
      gender: row.gender === 'Male' ? 'MALE' : 'FEMALE',
      school: SCHOOL_ID,
      grade: row.grade,
      section: '',
      rollNumber,
      registrationNumber: '',
      iemisNumber: row.iemis,
      status: 'ACTIVE',
      guardianRelationship: row.father ? 'FATHER' : row.mother ? 'MOTHER' : undefined,
      parentName: row.father || row.mother || '',
      enrollments: [makeEnrollmentEntry({
        school: SCHOOL_ID, schoolName: school.schoolName, grade: row.grade, rollNumber, section: '', academicYear: year,
      })],
    });
    if (row.father) {
      await addGuardian({ name: row.father, relationship: 'FATHER', primary: true, student });
      guardians += 1;
    }
    if (row.mother) {
      await addGuardian({ name: row.mother, relationship: 'MOTHER', primary: !row.father, student });
      guardians += 1;
    }
    credentials.push([row.grade, rollNumber, row.name, row.iemis, username, password]);
  }

  await AcademicYear.updateOne({ _id: year._id }, { $inc: { 'summary.admitted': rows.length } });
  fs.writeFileSync(credentialsPath, credentials.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`Imported ${rows.length} students and ${guardians} guardians. Credentials: ${credentialsPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { default: mongoose } = await import('mongoose');
    await mongoose.disconnect();
  });
