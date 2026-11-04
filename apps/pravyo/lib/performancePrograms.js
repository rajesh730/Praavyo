import mongoose from "mongoose";
import PerformanceProgram from "@/models/PerformanceProgram";
import Achievement from "@/models/Achievement";
import Student from "@/models/Student";
import "@/models/Teacher";
import { APIError } from "@/lib/apiResponse";
import { getSessionSchoolId, isActiveStudentQuery, sameId } from "@/lib/authz";
import { activeSchoolTeacherIds } from "@/lib/eventManagers";
import { ensureActiveAcademicYear } from "@/lib/studentEnrollment";
import { buildCertificateCode, buildCertificatePath } from "@/lib/results";

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
    performanceType: performance.performanceType,
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

function assertOpen(program) {
  assertNotPublished(program);
  if (program.participantsLocked) {
    throw new APIError(
      "The participant list is locked. The school must unlock it to make changes.",
      409,
      "PROGRAM_LOCKED"
    );
  }
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
      assertOpen(program);
      const title = cleanText(body.title);
      if (!title) throw new APIError("Please name the performance", 400, "VALIDATION_ERROR");
      program.performances.push({ title, performanceType: performanceType(body.performanceType) });
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
      if (body.performanceType !== undefined) {
        performance.performanceType = performanceType(body.performanceType);
      }
      break;
    }
    case "removePerformance": {
      assertOpen(program);
      findPerformance(program, body.performanceId).deleteOne();
      break;
    }
    case "addPerformers": {
      assertOpen(program);
      const performance = findPerformance(program, body.performanceId);
      addPerformers(performance, await schoolStudents(program, body.studentIds), session);
      break;
    }
    case "removePerformer": {
      assertOpen(program);
      const performance = findPerformance(program, body.performanceId);
      performance.performers = performance.performers.filter(
        (p) => String(p.student) !== String(body.studentId)
      );
      break;
    }
    case "markPerformer": {
      assertNotPublished(program);
      if (!program.participantsLocked) {
        throw new APIError("Lock the participant list before marking performances", 409, "PROGRAM_OPEN");
      }
      const status = ["PERFORMED", "NOT_PERFORMED", "REGISTERED"].includes(body.status)
        ? body.status
        : "PERFORMED";
      const performance = findPerformance(program, body.performanceId);
      const targets = body.studentId
        ? performance.performers.filter((p) => String(p.student) === String(body.studentId))
        : performance.performers; // whole performance at once
      targets.forEach((performer) => {
        performer.status = status;
        performer.markedAt = new Date();
      });
      break;
    }
    case "lock": {
      requireSchool(session, program);
      assertNotPublished(program);
      program.participantsLocked = true;
      program.lockedAt = new Date();
      break;
    }
    case "unlock": {
      requireSchool(session, program);
      assertNotPublished(program);
      program.participantsLocked = false;
      program.lockedAt = null;
      break;
    }
    case "publish": {
      requireSchool(session, program);
      assertNotPublished(program);
      if (!program.participantsLocked) {
        throw new APIError("Lock the participant list first", 409, "PROGRAM_OPEN");
      }
      await publishCertificates(program);
      break;
    }
    case "unpublish": {
      requireSchool(session, program);
      await Achievement.deleteMany({ program: program._id });
      program.certificatesPublishedAt = null;
      break;
    }
    default:
      throw new APIError("Unknown action", 400, "VALIDATION_ERROR");
  }

  await program.save();
  return program;
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
      docs.push({
        _id,
        school: program.school,
        student: performer.student,
        recipientType: "STUDENT",
        program: program._id,
        performanceId: performance._id,
        performanceTitle: performance.title,
        performanceType: performance.performanceType,
        title: `${performance.title} · ${program.title}`,
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
}

/** Students joining or leaving a performance themselves. */
export async function applyStudentAction(session, program, body) {
  if (!sameId(session.user.schoolId, program.school)) {
    throw new APIError("Program not found", 404, "NOT_FOUND");
  }
  assertOpen(program);
  const performance = findPerformance(program, body.performanceId);
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
  await program.deleteOne();
}
