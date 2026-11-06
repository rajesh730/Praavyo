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
 * Praavyo trainings (models/Training.js): Praavyo creates and publishes a
 * training, schools register participants, Praavyo trains at each school and
 * marks that school's registration completed, which issues the certificates.
 *
 * Everything that decides who may do what lives here; routes only parse the
 * request and call in.
 */

export const AUDIENCES = ["STUDENTS", "TEACHERS"];
const objectId = /^[a-f\d]{24}$/i;
export const isId = (value) => objectId.test(String(value || ""));

const text = (max) => z.string().trim().max(max);

export const trainingInput = z.object({
  title: z.string({ error: "Give the training a title." }).trim().min(2, "Give the training a title.").max(160, "The title is too long."),
  description: text(3000).default(""),
  audience: z.enum(AUDIENCES, { message: "Choose who the training is for." }),
  grades: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  duration: text(60).default(""),
  // "YYYY-MM-DD" or "", the last day schools can register.
  registrationDeadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid deadline.")]).default(""),
});

/** The last moment of a "YYYY-MM-DD" day in Nepal (UTC+5:45). */
function endOfNepalDay(day) {
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - (5 * 60 + 45) * 60 * 1000);
}

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

export function serializeRegistration(registration, { certificates = null, schoolName = "" } = {}) {
  return {
    id: String(registration._id),
    training: String(registration.training?._id || registration.training),
    school: String(registration.school?._id || registration.school),
    schoolName: schoolName || registration.school?.schoolName || "",
    selection: {
      mode: registration.selection?.mode || "CHOSEN",
      grades: registration.selection?.grades || [],
    },
    participants: (registration.participants || []).map((row) => ({
      id: String(row.student || row.teacher),
      name: row.name,
      grade: row.grade || "",
    })),
    participantCount: (registration.participants || []).length,
    status: registration.status,
    trainingDate: registration.trainingDate || null,
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
    return teachers.map((teacher) => ({ id: String(teacher._id), name: teacher.name, grade: "", detail: teacher.designation || "" }));
  }

  const filter = { school: schoolId, status: "ACTIVE", isDeleted: { $ne: true } };
  if (training.grades?.length) filter.grade = { $in: training.grades };
  const students = await Student.find(filter).select("name grade section rollNumber").lean();
  return students
    .map((student) => ({
      id: String(student._id),
      name: student.name,
      grade: student.grade || "",
      detail: [student.section ? `Section ${student.section}` : "", student.rollNumber ? `Roll ${student.rollNumber}` : ""].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

const selectionInput = z.object({
  mode: z.enum(["ALL", "GRADES", "CHOSEN"]),
  grades: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  participants: z.array(z.string().regex(objectId)).max(5000).default([]),
});

/** Create or replace the school's registration from its selection. */
export async function saveRegistration(training, schoolId, body) {
  if (!registrationOpen(training)) {
    throw new APIError("Registration for this training is closed.", 409, "REGISTRATION_CLOSED");
  }
  const parsed = selectionInput.safeParse(body || {});
  if (!parsed.success) throw new APIError("Choose who to register.", 400, "VALIDATION_ERROR");
  const { mode, grades, participants } = parsed.data;
  if (training.audience === "TEACHERS" && mode === "GRADES") {
    throw new APIError("Teachers are registered all together or one by one.", 400, "VALIDATION_ERROR");
  }

  const existing = await TrainingRegistration.findOne({ training: training._id, school: schoolId });
  if (existing?.status === "COMPLETED") {
    throw new APIError("This training is already completed at your school, so the list can no longer change.", 409, "COMPLETED");
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
    throw new APIError(
      training.audience === "TEACHERS" ? "Choose at least one teacher." : "No students match — choose at least one student.",
      400,
      "VALIDATION_ERROR"
    );
  }

  const field = training.audience === "TEACHERS" ? "teacher" : "student";
  const update = {
    selection: { mode, grades: mode === "GRADES" ? grades : [] },
    participants: chosen.map((person) => ({ [field]: person.id, name: person.name, grade: person.grade })),
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
  if (registration.status === "COMPLETED") {
    throw new APIError("This training is already completed at your school, so it cannot be cancelled.", 409, "COMPLETED");
  }
  await registration.deleteOne();
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
 * Mark one school's training done: every registered participant gets a
 * participation certificate (Praavyo + school logos), dated `trainingDate`.
 * Safe to retry: a rerun replaces this registration's certificates.
 */
export async function completeRegistration(training, registration, { trainingDate, actorId }) {
  if (training.status === "DRAFT") throw new APIError("Publish the training first.", 409, "NOT_PUBLISHED");
  if (!registration.participants.length) {
    throw new APIError("This school has no participants registered.", 409, "NOTHING_TO_ISSUE");
  }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(trainingDate || "")) ? trainingDate : null;
  const trainedOn = day ? new Date(`${day}T06:15:00.000Z`) : new Date(); // midday in Nepal
  const now = new Date();
  const teachers = training.audience === "TEACHERS";
  const schoolId = registration.school?._id || registration.school;

  const docs = registration.participants.map((person) => {
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

/** Undo a completion (a mistake): the certificates are withdrawn. */
export async function reopenRegistration(registration) {
  await Achievement.deleteMany({ trainingRegistration: registration._id });
  registration.status = "REGISTERED";
  registration.completedAt = null;
  registration.completedBy = null;
  registration.trainingDate = null;
  await registration.save();
}
