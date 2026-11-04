import mongoose from "mongoose";
import PerformanceProgram from "@/models/PerformanceProgram";
import Achievement from "@/models/Achievement";
import Student from "@/models/Student";
import UserNotification from "@/models/UserNotification";
import "@/models/Teacher";
import { APIError } from "@/lib/apiResponse";
import { getSessionSchoolId, isActiveStudentQuery, sameId } from "@/lib/authz";
import { activeSchoolTeacherIds } from "@/lib/eventManagers";
import { ensureActiveAcademicYear } from "@/lib/studentEnrollment";
import { buildCertificateCode, buildCertificatePath } from "@/lib/results";
import { syncAchievementNotifications } from "@/lib/achievementNotifications";

/**
 * Performance programs (Dashain Program, Tihar Program, …): see
 * models/PerformanceProgram.js for the shape and the lifecycle.
 *
 * Who can do what:
 *   - School admin: everything, including lock/unlock, publish/unpublish,
 *     assigning teachers and deleting.
 *   - Assigned teacher (active at the school): edit the program and its
 *     performances, add/remove performers while open, tick who performed.
 *   - Student of the school: join or leave a performance while open.
 * Once certificates are published the program is frozen until unpublished.
 */

const ID = /^[a-f\d]{24}$/i;

export function isValidId(value) {
  return ID.test(String(value || ""));
}

export function isProgramSchool(session, program) {
  if (session?.user?.role === "SUPER_ADMIN") return true;
  return (
    session?.user?.role === "SCHOOL_ADMIN" &&
    sameId(getSessionSchoolId(session), program?.school?._id || program?.school)
  );
}

export function isProgramTeacher(session, program) {
  if (session?.user?.role !== "TEACHER") return false;
  if (!sameId(session.user.schoolId, program?.school?._id || program?.school)) return false;
  return (program.assignedTeachers || []).some((teacher) =>
    sameId(teacher?._id || teacher, session.user.id)
  );
}

export function canManageProgram(session, program) {
  return isProgramSchool(session, program) || isProgramTeacher(session, program);
}

export async function loadProgram(id) {
  if (!isValidId(id)) throw new APIError("Program not found", 404, "NOT_FOUND");
  const program = await PerformanceProgram.findById(id);
  if (!program) throw new APIError("Program not found", 404, "NOT_FOUND");
  return program;
}

function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function parseDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new APIError("Please choose a valid program date", 400, "VALIDATION_ERROR");
  }
  return date;
}

function performanceType(value) {
  return String(value || "").toUpperCase() === "GROUP" ? "GROUP" : "SOLO";
}

/**
 * A performance's list is locked when it was locked itself, or when the
 * program was locked as a whole before per-performance locks existed.
 */
export function isPerformanceLocked(program, performance) {
  return Boolean(performance?.locked || program?.participantsLocked);
}

export function programStage(program) {
  if (program.certificatesPublishedAt) return "PUBLISHED";
  if (program.participantsLocked) return "LOCKED";
  return "OPEN";
}

/** Plain JSON for the client. Expects students/teachers populated. */
export function serializeProgram(program, { session } = {}) {
  const raw = typeof program.toObject === "function" ? program.toObject() : program;
  const performances = (raw.performances || []).map((performance) => ({
    _id: String(performance._id),
    title: performance.title,
    certificateTitle: performance.certificateTitle || "",
    performanceType: performance.performanceType,
    locked: isPerformanceLocked(raw, performance),
    performers: (performance.performers || [])
      .filter((performer) => performer.student)
      .map((performer) => ({
        studentId: String(performer.student?._id || performer.student),
        name: performer.student?.name || "Student",
        grade: performer.student?.grade || "",
        section: performer.student?.section || "",
        rollNumber: performer.student?.rollNumber || "",
        status: performer.status,
        addedByRole: performer.addedByRole || "",
      })),
  }));
  const performerCount = performances.reduce((sum, p) => sum + p.performers.length, 0);
  const performedCount = performances.reduce(
    (sum, p) => sum + p.performers.filter((x) => x.status === "PERFORMED").length,
    0
  );

  return {
    _id: String(raw._id),
    title: raw.title,
    description: raw.description || "",
    venue: raw.venue || "",
    date: raw.date,
    academicYear: raw.academicYear || "",
    academicYearStart: raw.academicYearStart ?? null,
    assignedTeachers: (raw.assignedTeachers || []).map((teacher) => ({
      _id: String(teacher?._id || teacher),
      name: teacher?.name || "Teacher",
    })),
    performances,
    performerCount,
    performedCount,
    participantsLocked: Boolean(raw.participantsLocked),
    certificatesPublishedAt: raw.certificatesPublishedAt || null,
    stage: programStage(raw),
    canManage: session ? canManageProgram(session, raw) : false,
    isSchool: session ? isProgramSchool(session, raw) : false,
  };
}

export function populateProgram(query) {
  return query
    .populate("assignedTeachers", "name")
    .populate("performances.performers.student", "name grade section rollNumber");
}

export async function createProgram(session, body) {
  const schoolId = getSessionSchoolId(session);
  if (!schoolId) throw new APIError("School not found", 400, "VALIDATION_ERROR");
  const title = cleanText(body.title);
  if (!title) throw new APIError("Please give the program a name", 400, "VALIDATION_ERROR");
  const year = await ensureActiveAcademicYear(schoolId);

  return PerformanceProgram.create({
    school: schoolId,
    academicYear: year?.year || "",
    academicYearStart: year?.yearStart ?? null,
    title,
    description: cleanText(body.description, 2000),
    venue: cleanText(body.venue),
    date: parseDate(body.date),
    assignedTeachers: await activeSchoolTeacherIds(body.teacherIds, schoolId),
    createdBy: session.user.id,
    createdByRole: session.user.role,
  });
}

function findPerformance(program, performanceId) {
  const performance = program.performances.id(performanceId);
  if (!performance) throw new APIError("Performance not found", 404, "NOT_FOUND");
  return performance;
}

function assertNotPublished(program) {
  if (program.certificatesPublishedAt) {
    throw new APIError(
      "Certificates are published. Unpublish them first to make changes.",
      409,
      "PROGRAM_PUBLISHED"
    );
  }
}

function assertPerformanceOpen(program, performance) {
  assertNotPublished(program);
  if (performance.locked) {
    throw new APIError(
      `The list of “${performance.title}” is locked. The school must unlock it to make changes.`,
      409,
      "PERFORMANCE_LOCKED"
    );
  }
}

/**
 * Programs locked as a whole (before per-performance locks) carry the lock
 * onto each performance the first time they change, so the two never
 * disagree. Afterwards the program-level flag is derived.
 */
function carryProgramLock(program) {
  if (!program.participantsLocked) return;
  program.performances.forEach((performance) => {
    if (!performance.locked) {
      performance.locked = true;
      performance.lockedAt = performance.lockedAt || program.lockedAt || new Date();
    }
  });
}

function syncProgramLock(program) {
  const all = program.performances.length > 0 && program.performances.every((p) => p.locked);
  if (all && !program.participantsLocked) program.lockedAt = new Date();
  if (!all) program.lockedAt = null;
  program.participantsLocked = all;
}

function setLocked(performance, locked) {
  performance.locked = locked;
  performance.lockedAt = locked ? new Date() : null;
}

function requireSchool(session, program) {
  if (!isProgramSchool(session, program)) {
    throw new APIError("Only the school can do this", 403, "FORBIDDEN");
  }
}

async function schoolStudents(program, studentIds) {
  const ids = [...new Set((studentIds || []).map(String).filter(isValidId))];
  if (!ids.length) return [];
  const students = await Student.find(
    isActiveStudentQuery({ _id: { $in: ids }, school: program.school })
  )
    .select("_id")
    .lean();
  return students.map((student) => String(student._id));
}

function addPerformers(performance, studentIds, session) {
  const existing = new Set(performance.performers.map((p) => String(p.student)));
  for (const studentId of studentIds) {
    if (existing.has(studentId)) continue;
    performance.performers.push({
      student: studentId,
      status: "REGISTERED",
      addedByRole: session.user.role,
      addedBy: isValidId(session.user.id) ? session.user.id : null,
      addedAt: new Date(),
    });
    existing.add(studentId);
  }
}

/** Staff actions on one program. Returns the saved program document. */
export async function applyProgramAction(session, program, body) {
  if (!canManageProgram(session, program)) {
    throw new APIError("Forbidden", 403, "FORBIDDEN");
  }
  const action = String(body.action || "");
  let issued = null;
  carryProgramLock(program);

  switch (action) {
    case "update": {
      assertNotPublished(program);
      if (body.title !== undefined) {
        const title = cleanText(body.title);
        if (!title) throw new APIError("Please give the program a name", 400, "VALIDATION_ERROR");
        program.title = title;
      }
      if (body.description !== undefined) program.description = cleanText(body.description, 2000);
      if (body.venue !== undefined) program.venue = cleanText(body.venue);
      if (body.date !== undefined) program.date = parseDate(body.date);
      break;
    }
    case "setTeachers": {
      requireSchool(session, program);
      program.assignedTeachers = await activeSchoolTeacherIds(body.teacherIds, program.school);
      break;
    }
    case "addPerformance": {
      assertNotPublished(program);
      const title = cleanText(body.title);
      if (!title) throw new APIError("Please name the performance", 400, "VALIDATION_ERROR");
      program.performances.push({
        title,
        certificateTitle: cleanText(body.certificateTitle),
        performanceType: performanceType(body.performanceType),
      });
      // Students picked in the same form join the new performance at once.
      if (Array.isArray(body.studentIds) && body.studentIds.length) {
        const added = program.performances[program.performances.length - 1];
        addPerformers(added, await schoolStudents(program, body.studentIds), session);
      }
      break;
    }
    case "updatePerformance": {
      assertNotPublished(program);
      const performance = findPerformance(program, body.performanceId);
      if (body.title !== undefined) {
        const title = cleanText(body.title);
        if (!title) throw new APIError("Please name the performance", 400, "VALIDATION_ERROR");
        performance.title = title;
      }
      if (body.certificateTitle !== undefined) {
        performance.certificateTitle = cleanText(body.certificateTitle);
      }
      if (body.performanceType !== undefined) {
        performance.performanceType = performanceType(body.performanceType);
      }
      break;
    }
    case "removePerformance": {
      const performance = findPerformance(program, body.performanceId);
      assertPerformanceOpen(program, performance);
      performance.deleteOne();
      break;
    }
    case "addPerformers": {
      const performance = findPerformance(program, body.performanceId);
      assertPerformanceOpen(program, performance);
      addPerformers(performance, await schoolStudents(program, body.studentIds), session);
      break;
    }
    case "removePerformer": {
      const performance = findPerformance(program, body.performanceId);
      assertPerformanceOpen(program, performance);
      performance.performers = performance.performers.filter(
        (p) => String(p.student) !== String(body.studentId)
      );
      break;
    }
    case "markPerformer": {
      assertNotPublished(program);
      const performance = findPerformance(program, body.performanceId);
      // Marking a whole performance from its card locks the list first:
      // a result means the names are final.
      if (!performance.locked && body.lock === true && !body.studentId) setLocked(performance, true);
      if (!performance.locked) {
        throw new APIError(`Lock the list of “${performance.title}” before marking who performed`, 409, "PERFORMANCE_OPEN");
      }
      const status = ["PERFORMED", "NOT_PERFORMED", "REGISTERED"].includes(body.status)
        ? body.status
        : "PERFORMED";
      const targets = body.studentId
        ? performance.performers.filter((p) => String(p.student) === String(body.studentId))
        : performance.performers; // whole performance at once
      targets.forEach((performer) => {
        performer.status = status;
        performer.markedAt = new Date();
      });
      break;
    }
    // One performance's list. The school or an assigned teacher locks it;
    // only the school unlocks it again.
    case "lockPerformance": {
      assertNotPublished(program);
      setLocked(findPerformance(program, body.performanceId), true);
      break;
    }
    case "unlockPerformance": {
      requireSchool(session, program);
      assertNotPublished(program);
      setLocked(findPerformance(program, body.performanceId), false);
      break;
    }
    // Every performance at once.
    case "lock": {
      assertNotPublished(program);
      program.performances.forEach((performance) => {
        if (!performance.locked) setLocked(performance, true);
      });
      break;
    }
    case "unlock": {
      requireSchool(session, program);
      assertNotPublished(program);
      program.performances.forEach((performance) => setLocked(performance, false));
      break;
    }
    case "publish": {
      requireSchool(session, program);
      assertNotPublished(program);
      syncProgramLock(program);
      if (!program.participantsLocked) {
        throw new APIError("Lock every performance's list first", 409, "PROGRAM_OPEN");
      }
      issued = await publishCertificates(program);
      break;
    }
    case "unpublish": {
      requireSchool(session, program);
      await Achievement.deleteMany({ program: program._id });
      await clearProgramNotifications(program);
      program.certificatesPublishedAt = null;
      break;
    }
    default:
      throw new APIError("Unknown action", 400, "VALIDATION_ERROR");
  }

  syncProgramLock(program);
  await program.save();
  if (issued) await notifyCertificates(program, issued);
  return program;
}

/**
 * Tell each certified student, and their linked guardians, that the
 * certificate is ready. Keyed by the program id (as `metadata.eventId`, the
 * same key competition results use), so a republish replaces the batch and
 * an unpublish removes it. The certificates are already saved: a failed
 * delivery is logged, never turned into a failed publish.
 */
async function notifyCertificates(program, achievements) {
  try {
    await syncAchievementNotifications({
      event: { _id: program._id, title: program.title },
      achievements,
    });
  } catch (error) {
    console.error("[performancePrograms] certificate notifications failed:", error.message);
  }
}

async function clearProgramNotifications(program) {
  await UserNotification.deleteMany({
    category: "ACHIEVEMENT",
    "metadata.eventId": String(program._id),
  });
}

/** One participation certificate per PERFORMED student per performance. */
async function publishCertificates(program) {
  const studentIds = program.performances.flatMap((performance) =>
    performance.performers.filter((p) => p.status === "PERFORMED").map((p) => String(p.student))
  );
  if (!studentIds.length) {
    throw new APIError("Tick at least one student as performed before publishing", 409, "NOTHING_TO_PUBLISH");
  }
  const students = await Student.find({ _id: { $in: studentIds } }).select("name").lean();
  const nameById = new Map(students.map((s) => [String(s._id), s.name]));

  const now = new Date();
  const docs = [];
  for (const performance of program.performances) {
    for (const performer of performance.performers) {
      if (performer.status !== "PERFORMED") continue;
      const _id = new mongoose.Types.ObjectId();
      const printedTitle = performance.certificateTitle || performance.title;
      docs.push({
        _id,
        school: program.school,
        student: performer.student,
        recipientType: "STUDENT",
        program: program._id,
        performanceId: performance._id,
        performanceTitle: printedTitle,
        performanceType: performance.performanceType,
        title: `${printedTitle} · ${program.title}`,
        description: "",
        level: "SCHOOL",
        placement: "PARTICIPANT",
        certificateRecipientName: nameById.get(String(performer.student)) || "",
        certificateCode: buildCertificateCode(_id, now),
        certificateUrl: buildCertificatePath(_id),
        certificateIssuedAt: now,
        certificateState: "CERTIFICATE_ACTIVE",
        isPublic: false,
        awardedAt: now,
      });
    }
  }

  // A rerun after a half-finished publish must not leave duplicates.
  await Achievement.deleteMany({ program: program._id });
  await Achievement.insertMany(docs);
  program.certificatesPublishedAt = now;
  return docs;
}

/** Students joining or leaving a performance themselves. */
export async function applyStudentAction(session, program, body) {
  if (!sameId(session.user.schoolId, program.school)) {
    throw new APIError("Program not found", 404, "NOT_FOUND");
  }
  carryProgramLock(program);
  const performance = findPerformance(program, body.performanceId);
  assertPerformanceOpen(program, performance);
  const studentId = String(session.user.id);

  if (body.action === "join") {
    const allowed = await schoolStudents(program, [studentId]);
    if (!allowed.length) throw new APIError("Your account cannot join this program", 403, "FORBIDDEN");
    addPerformers(performance, allowed, session);
  } else if (body.action === "leave") {
    performance.performers = performance.performers.filter(
      (p) => String(p.student) !== studentId
    );
  } else {
    throw new APIError("Unknown action", 400, "VALIDATION_ERROR");
  }

  await program.save();
  return program;
}

export async function deleteProgram(session, program) {
  requireSchool(session, program);
  await Achievement.deleteMany({ program: program._id });
  await clearProgramNotifications(program);
  await program.deleteOne();
}
