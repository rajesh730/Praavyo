import connectDB from '@/lib/db';
import PlatformSetting from '@/models/PlatformSetting';
import { HttpError, handler, teacherHandler } from '@pravyo/cas/lib/casRoute';

/**
 * Internal Exam lock (Super Admin > Settings > "Lock Internal Exam").
 *
 * While the feature is not ready, the Super Admin keeps it locked and no
 * school or teacher can open the Internal Exam screens or call its APIs.
 * Locked is the default: a platform without the setting saved stays locked.
 * Results already published stay readable by parents and students
 * (lib/casPublished.js), because the lock only closes the work area.
 */

export const INTERNAL_EXAM_LOCKED_MESSAGE =
  'Internal Exam is locked: it is not ready yet. It will open once Praavyo enables it.';

// Read at most every few seconds per server instance; every internal exam
// request would otherwise add a database read.
const CACHE_MS = 10_000;
let cached = { value: true, at: 0 };

export async function isInternalExamLocked() {
  if (Date.now() - cached.at < CACHE_MS) return cached.value;
  await connectDB();
  const settings = await PlatformSetting.findOne({ singletonKey: 'platform' })
    .select('governance.internalExamsLocked')
    .lean();
  const value = settings?.governance?.internalExamsLocked !== false;
  cached = { value, at: Date.now() };
  return value;
}

/** Forget the cached value (after the Super Admin saves, and in tests). */
export function clearInternalExamLockCache() {
  cached = { value: true, at: 0 };
}

/**
 * Wrap an internal exam endpoint so it refuses with 423 Locked while the lock
 * is on. Use inside the casRoute wrappers: handler(whenUnlocked(fn)).
 */
export function whenUnlocked(fn) {
  return async function unlockedOnly(args) {
    if (await isInternalExamLocked()) {
      throw new HttpError(INTERNAL_EXAM_LOCKED_MESSAGE, 423);
    }
    return fn(args);
  };
}

/** casRoute `handler` (school API) that also honours the lock. Every /api/cas/internal-exams route uses it. */
export const internalExamHandler = (fn) => handler(whenUnlocked(fn));

/** casRoute `teacherHandler` that also honours the lock. Every /api/teacher/exams/internal route uses it. */
export const internalExamTeacherHandler = (fn) => teacherHandler(whenUnlocked(fn));
