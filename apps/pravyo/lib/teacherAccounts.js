import Teacher from '@/models/Teacher';
import Student from '@/models/Student';
import User from '@/models/User';
import TeacherMembership from '@pravyo/db/models/TeacherMembership';
import { APIError } from '@/lib/apiResponse';
import { teacherCardToken } from '@pravyo/auth/teacherCardToken';

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;
const ID_PATTERN = /^[a-f\d]{24}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT'];

export function normalizeTeacherUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new APIError('Username must start with a letter and use 3-40 lowercase letters, numbers, dots, hyphens, or underscores.', 400, 'VALIDATION_ERROR');
  }
  return username;
}

export function normalizeTeacherEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new APIError('Enter a valid email address', 400, 'VALIDATION_ERROR');
  return email;
}

function usernameSeed(name) {
  const parts = String(name || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const seed = parts.join('.') || 'teacher';
  return /^[a-z]/.test(seed) ? seed : `t.${seed}`;
}

/**
 * A username no teacher holds and no student signs in with. Teacher sign-in is
 * checked before student sign-in, so a clash would lock that student out.
 */
async function usernameTaken(username, exceptTeacherId = null) {
  const [teacher, student] = await Promise.all([
    Teacher.exists({ username, ...(exceptTeacherId ? { _id: { $ne: exceptTeacherId } } : {}) }),
    Student.exists({ username }),
  ]);
  return Boolean(teacher || student);
}

export async function assertUsernameAvailable(username, exceptTeacherId = null) {
  if (await usernameTaken(username, exceptTeacherId)) {
    throw new APIError('That username is already in use', 409, 'CONFLICT');
  }
}

/** An email no other teacher or school/admin account uses. */
export async function assertEmailAvailable(email, exceptTeacherId = null) {
  const [teacher, user] = await Promise.all([
    Teacher.exists({ email, ...(exceptTeacherId ? { _id: { $ne: exceptTeacherId } } : {}) }),
    User.exists({ email, role: { $ne: 'TEACHER' } }),
  ]);
  if (teacher || user) throw new APIError('An account with this email already exists', 409, 'CONFLICT');
}

/** Returns an available username without ever relying on an email address. */
export async function resolveTeacherUsername({ username, name }) {
  if (String(username || '').trim()) return normalizeTeacherUsername(username);
  return suggestTeacherUsername(name);
}

export async function suggestTeacherUsername(name) {
  const base = usernameSeed(name).slice(0, 34);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix ? `${base.slice(0, 40 - String(suffix).length - 1)}.${suffix}` : base;
    if (USERNAME_PATTERN.test(candidate) && !await usernameTaken(candidate)) return candidate;
  }
  throw new APIError('Could not create a unique username. Please choose one manually.', 409, 'CONFLICT');
}

export function asTeacherId(value) {
  const id = String(value || '');
  if (!ID_PATTERN.test(id)) throw new APIError('Choose a valid teacher', 400, 'VALIDATION_ERROR');
  return id;
}

/** The teacher and this school's membership, or 404 if they never worked here. */
export async function loadSchoolTeacher(teacherId, school) {
  const id = asTeacherId(teacherId);
  const [teacher, membership] = await Promise.all([
    Teacher.findById(id).select('-password').lean(),
    TeacherMembership.findOne({ teacher: id, school }).lean(),
  ]);
  if (!teacher || !membership) throw new APIError('Teacher not found', 404, 'NOT_FOUND');
  return { teacher, membership };
}

/**
 * Whether the teacher currently works at any OTHER school. A shared account's
 * login and personal details belong to the teacher, so one school may not
 * change them for everyone.
 */
export async function worksElsewhere(teacherId, school) {
  return Boolean(await TeacherMembership.exists({
    teacher: teacherId, school: { $ne: school }, status: { $in: ['ACTIVE', 'INACTIVE'] },
  }));
}

/**
 * The sign-in token for a teacher's login card, or null when the card must be
 * username-only: a teacher who also works at another school, so this school
 * never holds a login into that one. Needs `cardVersion` on `teacher`.
 */
export async function teacherCardSignInToken(teacher, school) {
  return (await worksElsewhere(teacher._id, school)) ? null : teacherCardToken(teacher);
}

export function parseOptionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new APIError(`Enter a valid ${label}`, 400, 'VALIDATION_ERROR');
  return date;
}

export function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}
