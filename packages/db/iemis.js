/**
 * IEMIS identity: the single place that knows how Praavyo identifies a student
 * or a school the way the government does.
 *
 * The government (IEMIS) issues one number per school and one per student.
 * Praavyo treats them as the identity that stays the same everywhere:
 *
 *   - a STUDENT's IEMIS number is compulsory, unique across the platform, and
 *     follows them when they change school. Students sign in with it, parent
 *     links carry it, and transfer records keep it as history;
 *   - a SCHOOL's IEMIS number (SchoolConfig.iemisNumber) is compulsory and
 *     unique across schools; transfer records keep the source and destination
 *     schools' numbers.
 *
 * Database ids (`_id`) still join records internally. IEMIS is the number
 * people, report cards and any future government sync use. Read
 * apps/pravyo/docs/IEMIS_IDENTITY.md before changing a rule here.
 *
 * Everything that cleans, validates or looks up an IEMIS number should come
 * from this file or ./iemisFormat.js (re-exported as `@/lib/iemis`), so the rules cannot
 * drift between registration, sign-in, CAS and transfers.
 */
import mongoose from "mongoose";
import Student from "./models/Student.js";
import SchoolConfig from "./models/SchoolConfig.js";
import { isValidIemisNumber, normalizeIemisNumber } from "./iemisFormat.js";

// The format rules are pure (no database), so browser code can import them
// from "@pravyo/db/iemisFormat" without pulling in Mongoose.
export { iemisNumberError, isValidIemisNumber, normalizeIemisNumber } from "./iemisFormat.js";

// ParentStudentLink imports this file for its hook, so it is looked up on the
// shared connection instead of imported (that would be an import cycle).
function linkModel() {
  return mongoose.models.ParentStudentLink || null;
}

/**
 * The active students holding an IEMIS number. Normally zero or one; more than
 * one means bad data the school must correct, and callers must refuse to guess.
 */
export async function findActiveStudentsByIemis(value, { limit = 2, session = null } = {}) {
  const iemisNumber = normalizeIemisNumber(value);
  if (!iemisNumber || !isValidIemisNumber(iemisNumber)) return [];
  return Student.find({ iemisNumber, isDeleted: { $ne: true }, status: "ACTIVE" })
    .limit(limit)
    .session(session);
}

/** The school (User id) registered with an IEMIS number, or null. */
export async function findSchoolIdByIemis(value) {
  const iemisNumber = normalizeIemisNumber(value);
  if (!iemisNumber || !isValidIemisNumber(iemisNumber)) return null;
  const config = await SchoolConfig.findOne({ iemisNumber }).select("school").lean();
  return config?.school || null;
}

/** A student's IEMIS number by id ("" when unknown). */
export async function studentIemisNumber(studentId, { session = null } = {}) {
  if (!studentId) return "";
  const student = await Student.findById(studentId).select("iemisNumber").session(session).lean();
  return student?.iemisNumber || "";
}

/** A school's IEMIS number by its User id ("" when unknown). */
export async function schoolIemisNumber(schoolId, { session = null } = {}) {
  if (!schoolId) return "";
  const config = await SchoolConfig.findOne({ school: schoolId }).select("iemisNumber").session(session).lean();
  return config?.iemisNumber || "";
}

/** IEMIS numbers for many schools at once: Map of String(schoolId) to number. */
export async function schoolIemisMap(schoolIds = []) {
  const ids = [...new Set(schoolIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const configs = await SchoolConfig.find({ school: { $in: ids } }).select("school iemisNumber").lean();
  return new Map(configs.map((config) => [String(config.school), config.iemisNumber || ""]));
}

/**
 * Copy a student's current IEMIS number onto every parent link for that
 * student. Call it whenever a student's IEMIS number changes; new links fill
 * it themselves (ParentStudentLink pre-save hook).
 */
export async function syncStudentIemisOnLinks(studentId, { session = null } = {}) {
  const ParentStudentLink = linkModel();
  if (!ParentStudentLink || !studentId) return;
  const iemisNumber = await studentIemisNumber(studentId, { session });
  await ParentStudentLink.updateMany(
    { student: studentId },
    { $set: { studentIemisNumber: iemisNumber } },
    { session }
  );
}
