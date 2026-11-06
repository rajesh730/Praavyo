import mongoose from "mongoose";
import { z } from "zod";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import Achievement from "@/models/Achievement";
import Student from "@/models/Student";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { APIError } from "@/lib/apiResponse";
import { buildCertificateCode, buildCertificatePath } from "@/lib/results";

/**
 * Praavyo trainings (models/Training.js):
 *
 *   Praavyo publishes → a school registers (whole grades or chosen people) →
 *   Praavyo trains at the school → the school marks Present/Absent and sends
 *   it → Praavyo issues certificates to the present ones.
 *
 * Everything that decides who may do what lives here; routes only parse the
 * request and call in.
 */

export const AUDIENCES = ["STUDENTS", "TEACHERS"];
const objectId = /^[a-f\d]{24}$/i;
export const isId = (value) => objectId.test(String(value || ""));

const text = (max) => z.string().trim().max(max);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const trainingInput = z.object({
  title: z.string({ error: "Give the training a title." }).trim().min(2, "Give the training a title.").max(160, "The title is too long."),
  description: text(3000).default(""),
  audience: z.enum(AUDIENCES, { message: "Choose who the training is for." }),
  grades: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  duration: text(60).default(""),
  // "YYYY-MM-DD" or "", the last day schools can register.
  registrationDeadline: z.union([z.literal(""), z.string().regex(DAY, "Choose a valid deadline.")]).default(""),
});

/** The last moment of a "YYYY-MM-DD" day in Nepal (UTC+5:45). */
function endOfNepalDay(day) {
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - (5 * 60 + 45) * 60 * 1000);
}

/** Midday in Nepal on a "YYYY-MM-DD" day — the moment certificates are dated. */
const nepalMidday = (day) => new Date(`${day}T06:15:00.000Z`);

export function parseTraining(body) {
  const result = trainingInput.safeParse(body || {});
  if (!result.success) throw new APIError(result.error.issues[0]?.message || "Check the training details.", 400, "VALIDATION_ERROR");
  const data = result.data;
  return {
    ...data,
    // Grades only make sense for students.
    grades: data.audience === "STUDENTS" ? [...new Set(data.grades)] : [],
    registrationDeadline: endOfNepalDay(data.registrationDeadline),
  };
}

export function registrationOpen(training, now = new Date()) {
  if (training.status !== "PUBLISHED") return false;
  return !training.registrationDeadline || new Date(training.registrationDeadline) >= now;
}

export function serializeTraining(training, extra = {}) {
  return {
    id: String(training._id),
    title: training.title,
    description: training.description || "",
    audience: training.audience,
    grades: training.grades || [],
    duration: training.duration || "",
    registrationDeadline: training.registrationDeadline || null,
    status: training.status,
    publishedAt: training.publishedAt || null,
    registrationOpen: registrationOpen(training),
    createdAt: training.createdAt,
    ...extra,
  };
}

/**
 * Attendance as it counts for certificates. While the school is still marking
 * (REGISTERED), not marked is just not marked. Once the list has left the
 * school, not marked means present — that is every registration completed
 * before attendance existed.
 */
export function attendanceOf(row, status) {
  if (row.attendance === "PRESENT" || row.attendance === "ABSENT") return row.attendance;
  return status === "REGISTERED" ? null : "PRESENT";
}

export function serializeRegistration(registration, { certificates = null, schoolName = "" } = {}) {
  const status = registration.status;
  const people = (registration.participants || []).map((row) => ({
    id: String(row.student || row.teacher),
    name: row.name,
    grade: row.grade || "",
    section: row.section || "",
    attendance: attendanceOf(row, status),
  }));
  return {
    id: String(registration._id),
    training: String(registration.training?._id || registration.training),
    school: String(registration.school?._id || registration.school),
    schoolName: schoolName || registration.school?.schoolName || "",
    selection: {
      mode: registration.selection?.mode || "CHOSEN",
      grades: registration.selection?.grades || [],
    },
    // Grades the school took whole (kept in every mode).
    wholeGrades: registration.selection?.grades || [],
    participants: people,
    participantCount: people.length,
    presentCount: people.filter((row) => row.attendance === "PRESENT").length,
    absentCount: people.filter((row) => row.attendance === "ABSENT").length,
    status,
    trainingDate: registration.trainingDate || null,
    attendanceSubmittedAt: registration.attendanceSubmittedAt || null,
    returnedAt: registration.returnedAt || null,
    returnReason: registration.returnReason || "",
    completedAt: registration.completedAt || null,
    registeredAt: registration.registeredAt || registration.createdAt,
    ...(certificates ? { certificates } : {}),
  };
}

export async function loadTraining(id) {
  if (!isId(id)) throw new APIError("Training not found", 404, "NOT_FOUND");
  const training = await Training.findById(id);
  if (!training) throw new APIError("Training not found", 404, "NOT_FOUND");
  return training;
}

// ------------------------------------------------------------- the school

/**
 * Who a school can register for this training: its active students (in the
 * training's grades, when it names some) or its active teachers.
 */
export async function schoolRoster(training, schoolId) {
  if (training.audience === "TEACHERS") {
    const memberships = await TeacherMembership.find({ school: schoolId, status: "ACTIVE" }).select("teacher").lean();
    const teachers = await Teacher.find({ _id: { $in: memberships.map((row) => row.teacher) }, isDeleted: { $ne: true } })
      .select("name designation")
      .sort({ name: 1 })
      .lean();
    return teachers.map((teacher) => ({ id: String(teacher._id), name: teacher.name, grade: "", section: "", detail: teacher.designation || "" }));
  }

  const filter = { school: schoolId, status: "ACTIVE", isDeleted: { $ne: true } };
  if (training.grades?.length) filter.grade = { $in: training.grades };
  const students = await Student.find(filter).select("name grade section rollNumber").lean();
  return students
    .map((student) => ({
      id: String(student._id),
      name: student.name,
      grade: student.grade || "",
      section: student.section || "",
      detail: [student.section ? `Section ${student.section}` : "", student.rollNumber ? `Roll ${student.rollNumber}` : ""].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

const selectionInput = z.object({
  mode: z.enum(["ALL", "GRADES", "CHOSEN"]).default("CHOSEN"),
  grades: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  participants: z.array(z.string().regex(objectId)).max(5000).default([]),
});

const LOCKED = {
  SUBMITTED: "Your attendance was sent to Praavyo, so the list can no longer change.",
  COMPLETED: "This training is already completed at your school, so the list can no longer change.",
};

/**
 * Create or replace the school's registration. The school picks people —
 * whole grades and/or students inside a grade; how that reads (whole school,
 * whole grades, chosen) is worked out here from the roster, never trusted
 * from the client. Attendance already marked is kept for everyone who stays.
 */
export async function saveRegistration(training, schoolId, body) {
  if (!registrationOpen(training)) {
    throw new APIError("Registration for this training is closed.", 409, "REGISTRATION_CLOSED");
  }
  const parsed = selectionInput.safeParse(body || {});
  if (!parsed.success) throw new APIError("Choose who to register.", 400, "VALIDATION_ERROR");
  const { mode, grades, participants } = parsed.data;
  const teachers = training.audience === "TEACHERS";
  if (teachers && mode === "GRADES") {
    throw new APIError("Teachers are registered all together or one by one.", 400, "VALIDATION_ERROR");
  }

  const existing = await TrainingRegistration.findOne({ training: training._id, school: schoolId });
  if (existing && existing.status !== "REGISTERED") {
    throw new APIError(LOCKED[existing.status] || LOCKED.COMPLETED, 409, existing.status);
  }

  const roster = await schoolRoster(training, schoolId);
  let chosen;
  if (mode === "ALL") chosen = roster;
  else if (mode === "GRADES") {
    if (!grades.length) throw new APIError("Choose at least one grade.", 400, "VALIDATION_ERROR");
    chosen = roster.filter((person) => grades.includes(person.grade));
  } else {
    const wanted = new Set(participants);
    chosen = roster.filter((person) => wanted.has(person.id));
    if (chosen.length !== wanted.size) {
      throw new APIError("Someone in the list is not an active member of your school for this training.", 400, "VALIDATION_ERROR");
    }
  }
  if (!chosen.length) {
    throw new APIError(teachers ? "Choose at least one teacher." : "No students match — choose at least one student.", 400, "VALIDATION_ERROR");
  }

  // Grades taken whole, and so how the choice reads.
  const chosenIds = new Set(chosen.map((person) => person.id));
  const wholeGrades = teachers
    ? []
    : [...new Set(roster.map((person) => person.grade).filter(Boolean))].filter((grade) =>
        roster.filter((person) => person.grade === grade).every((person) => chosenIds.has(person.id))
      );
  const resolvedMode =
    chosen.length === roster.length
      ? "ALL"
      : wholeGrades.length && chosen.every((person) => wholeGrades.includes(person.grade))
      ? "GRADES"
      : "CHOSEN";

  const marked = new Map((existing?.participants || []).map((row) => [String(row.student || row.teacher), row.attendance || null]));
  const field = teachers ? "teacher" : "student";
  const update = {
    selection: { mode: resolvedMode, grades: wholeGrades },
    participants: chosen.map((person) => ({
      [field]: person.id,
      name: person.name,
      grade: person.grade,
      section: person.section || "",
      attendance: marked.get(person.id) || null,
    })),
  };
  return TrainingRegistration.findOneAndUpdate(
    { training: training._id, school: schoolId },
    { $set: update, $setOnInsert: { status: "REGISTERED", registeredAt: new Date() } },
    { new: true, upsert: true, runValidators: true }
  );
}

export async function cancelRegistration(training, schoolId) {
  const registration = await TrainingRegistration.findOne({ training: training._id, school: schoolId });
  if (!registration) throw new APIError("Your school is not registered for this training.", 404, "NOT_FOUND");
  if (registration.status !== "REGISTERED") {
    throw new APIError(
      registration.status === "SUBMITTED"
        ? "Your attendance was sent to Praavyo, so the registration cannot be cancelled."
        : "This training is already completed at your school, so it cannot be cancelled.",
      409,
      registration.status
    );
  }
  await registration.deleteOne();
}

const attendanceInput = z.object({
  marks: z.record(z.string().regex(objectId), z.enum(["PRESENT", "ABSENT"]).nullable()).default({}),
  trainingDate: z.union([z.literal(""), z.string().regex(DAY, "Choose the day of the training.")]).default(""),
  submit: z.boolean().default(false),
});

/**
 * The school marks Present/Absent after the training — as a draft, as often
 * as it likes — and with `submit` sends it to Praavyo, which locks the list.
 */
export async function saveAttendance(training, schoolId, body, { actorId = null, now = new Date() } = {}) {
  if (training.status === "DRAFT") throw new APIError("Training not found", 404, "NOT_FOUND");
  const parsed = attendanceInput.safeParse(body || {});
  if (!parsed.success) throw new APIError(parsed.error.issues[0]?.message || "Check the attendance.", 400, "VALIDATION_ERROR");
  const { marks, trainingDate, submit } = parsed.data;

  const registration = await TrainingRegistration.findOne({ training: training._id, school: schoolId });
  if (!registration) throw new APIError("Your school is not registered for this training.", 404, "NOT_FOUND");
  if (registration.status !== "REGISTERED") {
    throw new APIError(
      registration.status === "SUBMITTED" ? "Attendance was already sent to Praavyo." : "This training is already completed at your school.",
      409,
      registration.status
    );
  }

  const byId = new Map(registration.participants.map((row) => [String(row.student || row.teacher), row]));
  for (const [id, value] of Object.entries(marks)) {
    const row = byId.get(id);
    if (!row) throw new APIError("Someone in the attendance is not on your registered list.", 400, "VALIDATION_ERROR");
    row.attendance = value;
  }

  if (trainingDate) {
    const day = nepalMidday(trainingDate);
    if (Number.isNaN(day.getTime())) throw new APIError("Choose the day of the training.", 400, "VALIDATION_ERROR");
    // Midday of any day up to today in Nepal is fine; tomorrow is not.
    if (day.getTime() > now.getTime() + 18 * 60 * 60 * 1000) {
      throw new APIError("The training day cannot be in the future.", 400, "VALIDATION_ERROR");
    }
    registration.trainingDate = day;
  }

  if (submit) {
    const unmarked = registration.participants.filter((row) => !row.attendance).length;
    if (unmarked) throw new APIError(`Mark everyone first — ${unmarked} not marked yet.`, 400, "VALIDATION_ERROR");
    if (!registration.trainingDate) throw new APIError("Choose the day the training was held.", 400, "VALIDATION_ERROR");
    if (!registration.participants.some((row) => row.attendance === "PRESENT")) {
      throw new APIError("Nobody is marked present. Check the attendance before sending.", 400, "VALIDATION_ERROR");
    }
    registration.status = "SUBMITTED";
    registration.attendanceSubmittedAt = now;
    registration.attendanceSubmittedBy = actorId;
    registration.returnedAt = null;
    registration.returnReason = "";
  }

  registration.markModified?.("participants");
  await registration.save();
  return registration;
}

// ------------------------------------------------------------- Praavyo

/** Certificates of one registration, for listing next to it. */
export async function registrationCertificates(registrationIds) {
  const rows = await Achievement.find({ trainingRegistration: { $in: registrationIds } })
    .select("trainingRegistration student teacher certificateRecipientName certificateUrl certificateCode")
    .lean();
  const byRegistration = new Map();
  for (const row of rows) {
    const key = String(row.trainingRegistration);
    if (!byRegistration.has(key)) byRegistration.set(key, []);
    byRegistration.get(key).push({
      id: String(row._id),
      personId: String(row.student || row.teacher || ""),
      name: row.certificateRecipientName,
      url: row.certificateUrl || `/certificates/${row._id}`,
      code: row.certificateCode || "",
    });
  }
  return byRegistration;
}

/**
 * Issue one school's certificates once it has sent its attendance: everyone
 * marked present gets a participation certificate (Praavyo + school logos),
 * dated the training day — the school's, unless Praavyo corrects it.
 * Safe to retry: a rerun replaces this registration's certificates.
 */
export async function completeRegistration(training, registration, { trainingDate, actorId }) {
  if (training.status === "DRAFT") throw new APIError("Publish the training first.", 409, "NOT_PUBLISHED");
  if (registration.status !== "SUBMITTED") {
    throw new APIError(
      registration.status === "COMPLETED" ? "Certificates were already issued to this school." : "This school has not sent its attendance yet.",
      409,
      "INVALID_STATE"
    );
  }
  const present = registration.participants.filter((row) => attendanceOf(row, registration.status) === "PRESENT");
  if (!present.length) throw new APIError("Nobody from this school is marked present.", 409, "NOTHING_TO_ISSUE");

  const day = DAY.test(String(trainingDate || "")) ? trainingDate : null;
  const trainedOn = day ? nepalMidday(day) : registration.trainingDate || new Date();
  const now = new Date();
  const teachers = training.audience === "TEACHERS";
  const schoolId = registration.school?._id || registration.school;

  const docs = present.map((person) => {
    const _id = new mongoose.Types.ObjectId();
    return {
      _id,
      school: schoolId,
      student: teachers ? null : person.student,
      teacher: teachers ? person.teacher : null,
      recipientType: teachers ? "TEACHER" : "STUDENT",
      training: training._id,
      trainingRegistration: registration._id,
      title: training.title,
      description: "",
      level: "PLATFORM",
      placement: "PARTICIPANT",
      certificateRecipientName: person.name,
      certificateCode: buildCertificateCode(_id, now),
      certificateUrl: buildCertificatePath(_id),
      certificateIssuedAt: now,
      certificateState: "CERTIFICATE_ACTIVE",
      isPublic: false,
      awardedAt: trainedOn,
    };
  });

  await Achievement.deleteMany({ trainingRegistration: registration._id });
  await Achievement.insertMany(docs);
  registration.status = "COMPLETED";
  registration.trainingDate = trainedOn;
  registration.completedAt = now;
  registration.completedBy = actorId || null;
  await registration.save();
  return docs.length;
}

/**
 * Undo a completion (a mistake): the certificates are withdrawn and the
 * school's attendance is back with Praavyo, ready to issue again.
 */
export async function reopenRegistration(registration) {
  await Achievement.deleteMany({ trainingRegistration: registration._id });
  registration.status = "SUBMITTED";
  registration.completedAt = null;
  registration.completedBy = null;
  await registration.save();
}

/** Praavyo sends the attendance back for the school to correct and resend. */
export async function returnAttendance(registration, reason, now = new Date()) {
  if (registration.status !== "SUBMITTED") {
    throw new APIError("Only attendance waiting for certificates can be sent back.", 409, "INVALID_STATE");
  }
  const why = String(reason || "").trim();
  if (why.length < 3) throw new APIError("Tell the school what to correct.", 400, "VALIDATION_ERROR");
  registration.status = "REGISTERED";
  registration.returnedAt = now;
  registration.returnReason = why.slice(0, 500);
  await registration.save();
}
