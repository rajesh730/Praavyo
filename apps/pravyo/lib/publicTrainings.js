import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { getActiveCertificateFilter } from "@/lib/certificates";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import Achievement from "@/models/Achievement";
// Registered for .populate("school") and .populate("student").
import "@/models/User";
import "@/models/Student";

/**
 * Praavyo trainings on the public site (/trainings, /trainings/[id]).
 *
 * A published training is public in full: what it is, every school that
 * registered (with how many it registered and how many were certified), and
 * every certificate issued — the same openness as a platform competition's
 * public results. What stays private is each person's attendance: an absent
 * student is never named; only the certified are.
 */
const VISIBLE = ["PUBLISHED", "CLOSED"];

function serializeTraining(training) {
  return {
    id: String(training._id),
    title: training.title,
    description: training.description || "",
    audience: training.audience,
    grades: training.grades || [],
    duration: training.duration || "",
    status: training.status,
    registrationOpen:
      training.status === "PUBLISHED" &&
      (!training.registrationDeadline || new Date(training.registrationDeadline) >= new Date()),
    registrationDeadline: training.registrationDeadline ? new Date(training.registrationDeadline).toISOString() : null,
    publishedAt: training.publishedAt ? new Date(training.publishedAt).toISOString() : null,
  };
}

/** Every public training, newest first, with its headline numbers. */
export async function getPublicTrainings() {
  await connectDB();
  const trainings = await Training.find({ status: { $in: VISIBLE } }).sort({ publishedAt: -1, createdAt: -1 }).lean();
  if (!trainings.length) return [];
  const ids = trainings.map((training) => training._id);
  const [registrations, certificates] = await Promise.all([
    TrainingRegistration.aggregate([
      { $match: { training: { $in: ids } } },
      { $group: { _id: "$training", schools: { $sum: 1 }, people: { $sum: { $size: "$participants" } } } },
    ]),
    Achievement.aggregate([
      { $match: { training: { $in: ids }, ...getActiveCertificateFilter() } },
      { $group: { _id: "$training", count: { $sum: 1 } } },
    ]),
  ]);
  const reg = new Map(registrations.map((row) => [String(row._id), row]));
  const cert = new Map(certificates.map((row) => [String(row._id), row.count]));
  return trainings.map((training) => ({
    ...serializeTraining(training),
    schoolCount: reg.get(String(training._id))?.schools || 0,
    participantCount: reg.get(String(training._id))?.people || 0,
    certificateCount: cert.get(String(training._id)) || 0,
  }));
}

/** One public training: its schools and its certificates. Null if not public. */
export async function getPublicTraining(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  await connectDB();
  const training = await Training.findOne({ _id: id, status: { $in: VISIBLE } }).lean();
  if (!training) return null;

  const [registrations, achievements] = await Promise.all([
    TrainingRegistration.find({ training: training._id })
      .populate("school", "schoolName schoolLocation")
      .select("school participants status trainingDate")
      .lean(),
    Achievement.find({ training: training._id, ...getActiveCertificateFilter() })
      .populate("school", "schoolName")
      .populate("student", "grade")
      .select("school student teacher recipientType certificateRecipientName certificateUrl certificateCode awardedAt")
      .sort({ certificateRecipientName: 1 })
      .lean(),
  ]);

  const certifiedBySchool = new Map();
  achievements.forEach((row) => {
    const key = String(row.school?._id || row.school);
    certifiedBySchool.set(key, (certifiedBySchool.get(key) || 0) + 1);
  });

  const schools = registrations
    .filter((row) => row.school)
    .map((row) => ({
      id: String(row.school._id),
      name: row.school.schoolName || "School",
      location: row.school.schoolLocation || "",
      registered: (row.participants || []).length,
      certified: certifiedBySchool.get(String(row.school._id)) || 0,
      stage: row.status === "COMPLETED" ? "CERTIFIED" : row.status === "SUBMITTED" ? "TRAINED" : "REGISTERED",
      trainingDate: row.trainingDate && row.status !== "REGISTERED" ? new Date(row.trainingDate).toISOString() : null,
    }))
    .sort((a, b) => b.certified - a.certified || a.name.localeCompare(b.name));

  const certificates = achievements.map((row) => ({
    id: String(row._id),
    name: row.certificateRecipientName || "Participant",
    schoolId: row.school?._id ? String(row.school._id) : "",
    schoolName: row.school?.schoolName || "School",
    grade: row.recipientType === "TEACHER" ? "Teacher" : row.student?.grade || "",
    url: row.certificateUrl || `/certificates/${row._id}`,
    code: row.certificateCode || "",
    awardedAt: row.awardedAt ? new Date(row.awardedAt).toISOString() : null,
  }));

  return {
    training: serializeTraining(training),
    schools,
    certificates,
    totals: {
      schools: schools.length,
      registered: schools.reduce((sum, row) => sum + row.registered, 0),
      certificates: certificates.length,
    },
  };
}
