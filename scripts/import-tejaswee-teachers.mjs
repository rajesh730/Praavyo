import fs from 'node:fs';
import process from 'node:process';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '@pravyo/db';
import User from '@pravyo/db/models/User';
import Teacher from '@pravyo/db/models/Teacher';
import Student from '@pravyo/db/models/Student';
import TeacherMembership from '@pravyo/db/models/TeacherMembership';
import { generateStrongPassword } from '../apps/pravyo/lib/passwordGenerator.js';

/**
 * One-off registration of Tejaswee Pathshala's ten Grades 1–5 teachers
 * (owner's request, 2026-11-03).
 *
 *   node scripts/import-tejaswee-teachers.mjs <credentials.csv> --dry-run
 *   node scripts/import-tejaswee-teachers.mjs <credentials.csv> --apply
 *
 * Per teacher it creates what the school's bulk registration
 * (api/teachers/bulk-register) creates: a Teacher login with a generated
 * username and random password, focus area "General", and an ACTIVE
 * TeacherMembership at the school. No teaching assignments: the school sets
 * those in the Teacher section. No emails were given, so each gets a
 * placeholder the school can replace later; sign-in uses the username.
 * Passwords are written once to <credentials.csv>.
 *
 * Refuses to run if any of these teachers or emails already exist.
 */

dotenv.config({ path: 'apps/pravyo/.env.local', quiet: true });
dotenv.config({ path: '.env.local', quiet: true });

const SCHOOL_ID = '6a8e95eb0ededff148af938e';
const EMAIL_DOMAIN = 'tejaswee.praavyo.com';
const TEACHERS = [
  ['Grade 1', 'Samjhana Karki'], ['Grade 1', 'Devi Sigdel'],
  ['Grade 2', 'Sungnima Panta'], ['Grade 2', 'Rakshya Sing'],
  ['Grade 3', 'Sanjita Shrestha'], ['Grade 3', 'Sarala Poudel'],
  ['Grade 4', 'Menuka Danuwar'], ['Grade 4', 'Sabina Khadka'],
  ['Grade 5', 'Youkti Upadhay'], ['Grade 5', 'Rojina Bhujel'],
];
const [credentialsPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
if (apply === dryRun) throw new Error('Choose exactly one mode: --dry-run or --apply.');
if (!credentialsPath) throw new Error('Pass <credentials.csv>.');

// Same rules as suggestTeacherUsername in apps/pravyo/lib/teacherAccounts.js,
// which imports through the app's "@/" alias and so cannot load here.
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;
const seedOf = (name) => (String(name).toLowerCase().match(/[a-z0-9]+/g) || []).join('.');

async function usernameTaken(username, reserved) {
  if (reserved.has(username)) return true;
  const [teacher, student] = await Promise.all([Teacher.exists({ username }), Student.exists({ username })]);
  return Boolean(teacher || student);
}

async function uniqueUsername(name, reserved) {
  const base = seedOf(name).slice(0, 34);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix ? `${base}.${suffix}` : base;
    if (USERNAME_PATTERN.test(candidate) && !await usernameTaken(candidate, reserved)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error(`No free username for ${name}`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();

  const school = await User.findOne({ _id: SCHOOL_ID, role: 'SCHOOL_ADMIN' }).select('schoolName').lean();
  if (!/tejaswee/i.test(school?.schoolName || '')) throw new Error('Tejaswee Pathshala not found.');

  const reserved = new Set();
  const rows = [];
  for (const [grade, name] of TEACHERS) {
    rows.push({ grade, name, email: `${seedOf(name)}@${EMAIL_DOMAIN}`, username: await uniqueUsername(name, reserved) });
  }

  // Safety checks: no teacher of the same name at the school, every email free.
  const problems = [];
  const memberIds = (await TeacherMembership.find({ school: SCHOOL_ID }).select('teacher').lean()).map((row) => row.teacher);
  const sameName = await Teacher.find({ _id: { $in: memberIds }, name: { $in: rows.map((row) => row.name) } }).select('name').lean();
  if (sameName.length) problems.push(`already teachers here: ${sameName.map((row) => row.name).join(', ')}`);
  const emails = rows.map((row) => row.email);
  const [takenTeacher, takenUser] = await Promise.all([
    Teacher.find({ email: { $in: emails } }).select('email').lean(),
    User.find({ email: { $in: emails } }).select('email').lean(),
  ]);
  const taken = [...takenTeacher, ...takenUser].map((row) => row.email);
  if (taken.length) problems.push(`emails in use: ${taken.join(', ')}`);

  console.log(`School: ${school.schoolName} | current teacher memberships: ${memberIds.length}`);
  rows.forEach((row) => console.log(`  ${row.grade} | ${row.name} | ${row.username} | ${row.email}`));
  if (problems.length) {
    console.log('PROBLEMS:\n - ' + problems.join('\n - '));
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log('Dry run: nothing written.');
    return;
  }

  const credentials = [['Grade', 'Name', 'Username', 'Password', 'Email (placeholder)']];
  for (const row of rows) {
    const password = generateStrongPassword();
    const teacher = await Teacher.create({
      name: row.name,
      email: row.email,
      username: row.username,
      password: await bcrypt.hash(password, 10),
      subject: 'General',
      school: SCHOOL_ID,
      roles: ['MENTOR'],
    });
    await TeacherMembership.create({ teacher: teacher._id, school: SCHOOL_ID, status: 'ACTIVE', addedBy: SCHOOL_ID });
    credentials.push([row.grade, row.name, row.username, password, row.email]);
  }

  fs.writeFileSync(credentialsPath, credentials.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n'));
  console.log(`Registered ${rows.length} teachers. Credentials: ${credentialsPath}`);
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
