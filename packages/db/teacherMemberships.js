import Teacher from "./models/Teacher.js";
import User from "./models/User.js";
import TeacherMembership from "./models/TeacherMembership.js";
import TeacherTeachingAssignment from "./models/TeacherTeachingAssignment.js";
import CasSubject from "./models/cas/CasSubject.js";
import CasExamTeacherAssignment from "./models/cas/CasExamTeacherAssignment.js";

/**
 * Teacher ↔ school membership rules, shared by sign-in, the session check,
 * the admin Teacher section and CAS.
 *
 * A Teacher record is the person; TeacherMembership says which schools they
 * work at. `Teacher.school` is kept only as the school that created the account.
 */

/**
 * Build the teacher collections' indexes once per process. `autoIndex` is off
 * for the shared database, and the unique (teacher, school) index is what stops
 * two concurrent backfills from creating duplicate memberships.
 */
export function ensureTeacherIndexes() {
  if (!globalThis.__teacherIndexes) {
    globalThis.__teacherIndexes = Promise.all([
      TeacherMembership.createIndexes(),
      TeacherTeachingAssignment.createIndexes(),
    ]).catch((error) => {
      // Never block sign-in over an index build; retry on the next call.
      console.error("[teacherMemberships] index build failed:", error.message);
      globalThis.__teacherIndexes = null;
    });
  }
  return globalThis.__teacherIndexes;
}
const LIVE_SCHOOL_STATUSES = ["APPROVED", "SUBSCRIBED"];

/**
 * Give every pre-membership teacher a membership for their `school`.
 *
 * Before memberships existed a school "removed" a teacher by setting
 * `isDeleted`/`status` on the account itself. Those become LEFT/INACTIVE
 * memberships here, and the account is cleared so the same person can still be
 * added by another school. Safe to call repeatedly: it only touches teachers
 * that have no membership for their creating school yet.
 */
export async function backfillTeacherMemberships(filter) {
  await ensureTeacherIndexes();
  const teachers = await Teacher.find({ ...filter, school: { $ne: null } })
    .select("school status isDeleted deletedAt deletedBy designation employmentType dateOfJoining")
    .lean();
  if (!teachers.length) return;

  const existing = await TeacherMembership.find({ teacher: { $in: teachers.map((t) => t._id) } })
    .select("teacher school").lean();
  const have = new Set(existing.map((row) => `${row.teacher}:${row.school}`));
  const missing = teachers.filter((t) => !have.has(`${t._id}:${t.school}`));
  if (!missing.length) return;

  await TeacherMembership.bulkWrite(missing.map((teacher) => {
    const status = teacher.isDeleted ? "LEFT" : teacher.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    return {
      updateOne: {
        filter: { teacher: teacher._id, school: teacher.school },
        update: {
          $setOnInsert: {
            status,
            designation: teacher.designation || "",
            employmentType: teacher.employmentType || "FULL_TIME",
            dateOfJoining: teacher.dateOfJoining || null,
            leftAt: status === "LEFT" ? teacher.deletedAt || new Date() : null,
            statusChangedBy: status === "LEFT" ? teacher.deletedBy || null : null,
          },
        },
        upsert: true,
      },
    };
  }), { ordered: false });

  const cleared = missing.filter((t) => t.isDeleted || t.status === "INACTIVE").map((t) => t._id);
  if (cleared.length) {
    await Teacher.updateMany(
      { _id: { $in: cleared } },
      { $set: { isDeleted: false, status: "ACTIVE", deletedAt: null, deletedBy: null } },
    );
  }
}

/** Teacher ids holding one of `statuses` at a school. */
export async function teacherIdsAtSchool(school, statuses = ["ACTIVE"]) {
  return TeacherMembership.distinct("teacher", { school, status: { $in: statuses } });
}

/** True when the teacher may work at this school right now. */
export async function isActiveTeacherMember(teacher, school) {
  if (!teacher || !school) return false;
  const [membership, schoolLive] = await Promise.all([
    TeacherMembership.exists({ teacher, school, status: "ACTIVE" }),
    User.exists({ _id: school, role: "SCHOOL_ADMIN", status: { $in: LIVE_SCHOOL_STATUSES } }),
  ]);
  return Boolean(membership && schoolLive);
}

/** Schools this teacher can open now, as `{ id, name }`, alphabetical. */
export async function activeSchoolsForTeacher(teacher) {
  const memberships = await TeacherMembership.find({ teacher, status: "ACTIVE" }).select("school").lean();
  if (!memberships.length) return [];
  const schools = await User.find({
    _id: { $in: memberships.map((row) => row.school) },
    role: "SCHOOL_ADMIN",
    status: { $in: LIVE_SCHOOL_STATUSES },
  }).select("schoolName name").lean();
  return schools
    .map((school) => ({ id: String(school._id), name: school.schoolName || school.name || "School" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Close a teacher's work at one school: snapshot and clear their teaching
 * assignments, and withdraw exam mark-entry access. Marks they already entered
 * and published results are never touched.
 */
export async function endTeacherWorkAtSchool(teacher, school) {
  const assignments = await TeacherTeachingAssignment.find({ teacher, school }).lean();
  const subjectIds = assignments.map((row) => row.subject).filter(Boolean);
  const subjects = subjectIds.length
    ? await CasSubject.find({ _id: { $in: subjectIds } }).select("code titleEn titleNe").lean()
    : [];
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const endedAt = new Date();
  const snapshot = assignments.map((row) => {
    const subject = row.subject ? subjectById.get(String(row.subject)) : null;
    return {
      grade: row.grade,
      assignmentType: row.assignmentType,
      subjectTitle: subject ? subject.titleEn || subject.titleNe || subject.code : "",
      subjectCode: subject?.code || "",
      endedAt,
    };
  });
  await Promise.all([
    TeacherTeachingAssignment.deleteMany({ teacher, school }),
    CasExamTeacherAssignment.deleteMany({ teacher, school }),
  ]);
  return snapshot;
}
