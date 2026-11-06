import UserNotification from "@/models/UserNotification";
import User from "@/models/User";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import { publishRealtimeEvent } from "@/lib/realtimeBus";
import { notifyGuardians } from "@/lib/parentNotifications";

/**
 * Every message a Praavyo training sends, in one place.
 *
 *   published  → every active school (bell + Received Notices, which read the
 *                same feed), linking to Platform Events → Trainings.
 *   registered → each registered student, and their guardians.
 *   completed  → the school; each student and their guardians get
 *                "your certificate is ready".
 *
 * Writes are upserts keyed on `dedupeKey`, never insertMany: Mongoose's
 * unordered insertMany silently drops any row that fails validation, which is
 * how the first version "sent" notifications nobody received. An upsert either
 * lands or throws, and a retry, a double click or a backfill never doubles a row.
 *
 * Nothing here may undo the action that triggered it — callers catch and log.
 */
const ACTIVE_SCHOOL_STATUSES = ["APPROVED", "SUBSCRIBED"];
export const SCHOOL_TRAININGS_HREF = "/school/dashboard?tab=platform-events&kind=trainings";
const STUDENT_HREF = "/student/dashboard";
const PARENT_CHILD_HREF = "/parent/child";
const PARENT_CERTIFICATES_HREF = "/parent/child?tab=certificates";

const keys = {
  published: (trainingId, schoolId) => `training:${trainingId}:published:${schoolId}`,
  closed: (trainingId, schoolId) => `training:${trainingId}:closed:${schoolId}`,
  returned: (trainingId, schoolId, at) => `training:${trainingId}:returned:${schoolId}:${at}`,
  // At most one reminder per school per day.
  remind: (trainingId, schoolId, day) => `training:${trainingId}:remind:${schoolId}:${day}`,
  registered: (trainingId, studentId) => `training:${trainingId}:registered:${studentId}`,
  completed: (trainingId, schoolId) => `training:${trainingId}:completed:${schoolId}`,
  certificate: (trainingId, personId) => `training:${trainingId}:certificate:${personId}`,
};

const idOf = (value) => String(value?._id || value || "");
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isDuplicate = (error) =>
  error?.code === 11000 || (Array.isArray(error?.writeErrors) && error.writeErrors.every((row) => (row.code ?? row.err?.code) === 11000));

/** Upsert each doc by its dedupeKey; returns the docs that were newly created. */
async function upsertNotifications(docs) {
  if (!docs.length) return [];
  const operations = docs.map((doc) => ({
    updateOne: {
      filter: { dedupeKey: doc.dedupeKey },
      update: {
        $setOnInsert: {
          status: "UNREAD",
          isDeleted: false,
          readBy: [],
          publishedAt: new Date(),
          type: doc.category,
          actionUrl: doc.href,
          ...doc,
        },
      },
      upsert: true,
    },
  }));
  let result;
  try {
    result = await UserNotification.bulkWrite(operations, { ordered: false });
  } catch (error) {
    // Two requests raced for the same key: the other one created the row.
    if (!isDuplicate(error)) throw error;
    result = error.result;
  }
  const created = Object.keys(result?.upsertedIds || result?.result?.upsertedIds || {}).map(Number);
  return created.map((index) => docs[index]).filter(Boolean);
}

function audienceText(training) {
  if (training.audience === "TEACHERS") return "your teachers";
  return training.grades?.length ? `your ${training.grades.join(", ")} students` : "your students";
}

function schoolAnnouncement(training, schoolId) {
  const trainingId = idOf(training);
  const parts = [`Praavyo will run “${training.title}” for ${audienceText(training)} at your school.`];
  if (training.duration) parts.push(`Duration: ${training.duration}.`);
  if (training.registrationDeadline) parts.push("Register before the deadline shown on the training.");
  parts.push("Open Platform Events → Trainings to register; every participant gets a certificate.");
  return {
    targetRole: "SCHOOL_ADMIN",
    recipientUser: schoolId,
    school: schoolId,
    category: "TRAINING",
    priority: "ACTION",
    title: `New training: ${training.title}`.slice(0, 180),
    message: parts.join(" ").slice(0, 1000),
    href: SCHOOL_TRAININGS_HREF,
    entityId: trainingId,
    dedupeKey: keys.published(trainingId, schoolId),
    metadata: { trainingId, kind: "published", audience: training.audience },
  };
}

// ------------------------------------------------------------- published

/** Tell every active school about a newly published training. */
export async function announceTraining(training) {
  if (!training || training.status !== "PUBLISHED") return 0;
  const schools = await User.find({ role: "SCHOOL_ADMIN", status: { $in: ACTIVE_SCHOOL_STATUSES } }).select("_id").lean();
  const created = await upsertNotifications(schools.map((school) => schoolAnnouncement(training, school._id)));
  if (created.length) publishRealtimeEvent("school-notifications", { kind: "training-published", trainingId: idOf(training) });
  return created.length;
}

/**
 * Make sure this school has heard of every training it can still register
 * for. Runs when the school's notifications load, so a school approved after
 * the training was published, or one a failed send missed, is still told.
 */
export async function ensureSchoolTrainingNotices(schoolId) {
  if (!schoolId) return 0;
  const now = new Date();
  const open = await Training.find({
    status: "PUBLISHED",
    $or: [{ registrationDeadline: null }, { registrationDeadline: { $gte: now } }],
  })
    .select("title audience grades duration registrationDeadline status")
    .lean();
  if (!open.length) return 0;

  const wanted = open.map((training) => keys.published(idOf(training), schoolId));
  const existing = await UserNotification.find({ dedupeKey: { $in: wanted } }).select("dedupeKey").lean();
  const have = new Set(existing.map((row) => row.dedupeKey));
  const missing = open.filter((training) => !have.has(keys.published(idOf(training), schoolId)));
  if (!missing.length) return 0;

  const created = await upsertNotifications(missing.map((training) => schoolAnnouncement(training, schoolId)));
  return created.length;
}

// ------------------------------------------------------------- attendance

function schoolNotice(training, schoolId, { title, message, priority = "ACTION", dedupeKey, kind, registrationId = "" }) {
  const trainingId = idOf(training);
  return {
    targetRole: "SCHOOL_ADMIN",
    recipientUser: schoolId,
    school: schoolId,
    category: "TRAINING",
    priority,
    title: title.slice(0, 180),
    message: message.slice(0, 1000),
    href: SCHOOL_TRAININGS_HREF,
    entityId: trainingId,
    dedupeKey,
    metadata: { trainingId, registrationId, kind },
  };
}

/** Registration closed: every school still marking is told what comes next. */
export async function notifyRegistrationClosed(training) {
  const trainingId = idOf(training);
  const registrations = await TrainingRegistration.find({ training: training._id, status: "REGISTERED" }).select("school").lean();
  const created = await upsertNotifications(
    registrations.map((row) =>
      schoolNotice(training, idOf(row.school), {
        title: `Registration closed: ${training.title}`,
        message: `Registration for “${training.title}” is closed. After Praavyo trains at your school, mark who was present and send the attendance to Praavyo — certificates are issued from it.`,
        dedupeKey: keys.closed(trainingId, idOf(row.school)),
        kind: "closed",
        registrationId: idOf(row),
      })
    )
  );
  if (created.length) publishRealtimeEvent("school-notifications", { kind: "training-closed", trainingId });
  return created.length;
}

/** Praavyo sent the attendance back; the school sees why. */
export async function notifyAttendanceReturned(training, registration) {
  const schoolId = idOf(registration.school);
  const at = new Date(registration.returnedAt || Date.now()).getTime();
  const created = await upsertNotifications([
    schoolNotice(training, schoolId, {
      title: `Check the attendance: ${training.title}`,
      message: `Praavyo sent the attendance for “${training.title}” back: ${registration.returnReason || "please check it"}. Correct it and send it again.`,
      priority: "URGENT",
      dedupeKey: keys.returned(idOf(training), schoolId, at),
      kind: "returned",
      registrationId: idOf(registration),
    }),
  ]);
  if (created.length) publishRealtimeEvent("school-notifications", { kind: "training-returned", trainingId: idOf(training) });
  return created.length;
}

/** Praavyo asks a school for its attendance — once a day at most. */
export async function remindAttendance(training, registration, now = new Date()) {
  const schoolId = idOf(registration.school);
  const day = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000).toISOString().slice(0, 10);
  const created = await upsertNotifications([
    schoolNotice(training, schoolId, {
      title: `Attendance needed: ${training.title}`,
      message: `Praavyo is waiting for the attendance of “${training.title}”. Mark who was present and send it, so your participants get their certificates.`,
      dedupeKey: keys.remind(idOf(training), schoolId, day),
      kind: "remind",
      registrationId: idOf(registration),
    }),
  ]);
  if (created.length) publishRealtimeEvent("school-notifications", { kind: "training-remind", trainingId: idOf(training) });
  return created.length;
}

// ------------------------------------------------------------- registered

async function withdrawRegistrationNotices(trainingId, studentIds) {
  if (!studentIds.length) return;
  const own = studentIds.map((id) => keys.registered(trainingId, id));
  await UserNotification.deleteMany({
    $or: [
      { dedupeKey: { $in: own } },
      // Guardian copies carry the student's key plus ":PARENT:…".
      ...own.map((key) => ({ dedupeKey: { $regex: `^${escapeRegex(key)}:PARENT:` } })),
    ],
  });
}

/**
 * The school saved its list: newly registered students (and their guardians)
 * are told; students taken off the list lose the notice.
 */
export async function notifyTrainingRegistration(training, registration) {
  if (training.audience !== "STUDENTS") return 0;
  const trainingId = idOf(training);
  const schoolId = idOf(registration.school);

  const previous = await UserNotification.find({
    targetRole: "STUDENT",
    school: schoolId,
    "metadata.trainingId": trainingId,
    "metadata.kind": "registered",
  })
    .select("recipientStudent")
    .lean();
  const current = new Set((registration.participants || []).map((row) => idOf(row.student)));
  await withdrawRegistrationNotices(
    trainingId,
    previous.map((row) => idOf(row.recipientStudent)).filter((id) => id && !current.has(id))
  );

  const message = [
    `Your school registered you for the Praavyo training “${training.title}”.`,
    training.duration ? `Duration: ${training.duration}.` : "",
    "Your school will share the date. You get a certificate when it is done.",
  ]
    .filter(Boolean)
    .join(" ");
  const docs = (registration.participants || []).map((row) => ({
    targetRole: "STUDENT",
    recipientStudent: idOf(row.student),
    school: schoolId,
    category: "TRAINING",
    priority: "INFO",
    title: `Registered: ${training.title}`.slice(0, 180),
    message: message.slice(0, 1000),
    href: STUDENT_HREF,
    entityId: trainingId,
    dedupeKey: keys.registered(trainingId, idOf(row.student)),
    metadata: { trainingId, registrationId: idOf(registration), kind: "registered" },
  }));
  const created = await upsertNotifications(docs);

  await Promise.all(
    created.map((doc) =>
      notifyGuardians({
        studentId: doc.recipientStudent,
        category: "EVENT",
        priority: "INFO",
        title: doc.title,
        message: `${doc.message.replace(/^Your school registered you/, "Your child's school registered them")}`,
        href: PARENT_CHILD_HREF,
        entityId: trainingId,
        dedupeKey: doc.dedupeKey,
        metadata: doc.metadata,
      }).catch((error) => console.error("[trainingNotifications] guardian delivery failed:", error.message))
    )
  );
  if (created.length) publishRealtimeEvent("student-notifications", { kind: "training-registered", trainingId });
  return created.length;
}

/** The school withdrew: its students' registration notices go too. */
export async function withdrawTrainingRegistration(training, schoolId) {
  const trainingId = idOf(training);
  const rows = await UserNotification.find({
    targetRole: "STUDENT",
    school: idOf(schoolId),
    "metadata.trainingId": trainingId,
    "metadata.kind": "registered",
  })
    .select("recipientStudent")
    .lean();
  await withdrawRegistrationNotices(trainingId, rows.map((row) => idOf(row.recipientStudent)).filter(Boolean));
}

// ------------------------------------------------------------- completed

/** Praavyo marked the school's training done and issued certificates. */
export async function notifyTrainingCompleted(training, registration, certificates = []) {
  const trainingId = idOf(training);
  const schoolId = idOf(registration.school);
  const registrationId = idOf(registration);
  const teachers = training.audience === "TEACHERS";
  const count = certificates.length || (registration.participants || []).filter((row) => row.attendance !== "ABSENT").length;
  const absent = (registration.participants || []).filter((row) => row.attendance === "ABSENT").length;

  // Completing again reissues the certificates under new links, so the old
  // notices (pointing at withdrawn certificates) are replaced, not kept.
  await withdrawTrainingCompletion(training, registration);

  const docs = [
    {
      targetRole: "SCHOOL_ADMIN",
      recipientUser: schoolId,
      school: schoolId,
      category: "TRAINING",
      priority: "POSITIVE",
      title: `Certificates issued: ${training.title}`.slice(0, 180),
      message: `Praavyo issued the certificates for “${training.title}”: ${count} present ${teachers ? "teacher" : "student"}${count === 1 ? "" : "s"}${absent ? `, ${absent} absent (no certificate)` : ""}. View and print them in Platform Events → Trainings.`.slice(0, 1000),
      href: SCHOOL_TRAININGS_HREF,
      entityId: trainingId,
      dedupeKey: keys.completed(trainingId, schoolId),
      metadata: { trainingId, registrationId, kind: "completed" },
    },
  ];

  if (!teachers) {
    for (const certificate of certificates) {
      const studentId = idOf(certificate.student);
      if (!studentId) continue;
      docs.push({
        targetRole: "STUDENT",
        recipientStudent: studentId,
        school: schoolId,
        category: "ACHIEVEMENT",
        priority: "POSITIVE",
        title: "Your certificate is ready",
        message: `Your participation certificate for the Praavyo training “${training.title}” is ready to view, download and share.`.slice(0, 1000),
        href: certificate.certificateUrl || STUDENT_HREF,
        entityId: trainingId,
        dedupeKey: keys.certificate(trainingId, studentId),
        metadata: { trainingId, registrationId, kind: "certificate", achievementId: idOf(certificate) },
      });
    }
  }

  const created = await upsertNotifications(docs);
  await Promise.all(
    created
      .filter((doc) => doc.targetRole === "STUDENT")
      .map((doc) =>
        notifyGuardians({
          studentId: doc.recipientStudent,
          category: "ACHIEVEMENT",
          priority: "POSITIVE",
          title: "Certificate ready",
          message: `Your child's participation certificate for the Praavyo training “${training.title}” is ready.`,
          href: PARENT_CERTIFICATES_HREF,
          entityId: trainingId,
          dedupeKey: doc.dedupeKey,
          metadata: doc.metadata,
        }).catch((error) => console.error("[trainingNotifications] guardian delivery failed:", error.message))
      )
  );
  publishRealtimeEvent("school-notifications", { kind: "training-completed", trainingId });
  if (!teachers) publishRealtimeEvent("student-notifications", { kind: "training-completed", trainingId });
  return created.length;
}

/** A completion was undone: its certificates are gone, so are their notices. */
export async function withdrawTrainingCompletion(training, registration) {
  await UserNotification.deleteMany({
    "metadata.trainingId": idOf(training),
    "metadata.registrationId": idOf(registration),
    "metadata.kind": { $in: ["completed", "certificate"] },
  });
}
