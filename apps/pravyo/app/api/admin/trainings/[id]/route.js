import { defineRoute } from "@/lib/routeHandler";
import TrainingRegistration from "@/models/TrainingRegistration";
import Achievement from "@/models/Achievement";
import "@/models/User";
import {
  loadTraining,
  parseTraining,
  registrationCertificates,
  serializeRegistration,
  serializeTraining,
} from "@/lib/trainings";
import { APIError, successResponse } from "@/lib/apiResponse";
import { announceTraining, notifyRegistrationClosed } from "@/lib/trainingNotifications";

export const dynamic = "force-dynamic";

/** GET — one training with every school's registration and its certificates. */
export const GET = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to load the training" }, async ({ params }) => {
  const training = await loadTraining(params.id);
  const registrations = await TrainingRegistration.find({ training: training._id })
    .populate("school", "schoolName")
    .sort({ registeredAt: 1 })
    .lean();
  const certificates = await registrationCertificates(registrations.map((row) => row._id));
  return successResponse(200, "Training loaded", {
    training: serializeTraining(training.toObject()),
    registrations: registrations.map((row) =>
      serializeRegistration(row, { certificates: certificates.get(String(row._id)) || [] })
    ),
  });
});

/**
 * PATCH — `{ action: "publish" | "close" | "reopen" }` changes the status;
 * anything else edits the details. The audience is fixed once any school has
 * registered, since their lists are of students or of teachers.
 */
export const PATCH = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to update the training" }, async ({ request, params }) => {
  const training = await loadTraining(params.id);
  const body = await request.json().catch(() => ({}));

  let announce = false;
  if (body.action === "publish" || body.action === "reopen") {
    // First publish tells every school (bell + Received Notices).
    announce = training.status === "DRAFT";
    training.status = "PUBLISHED";
    training.publishedAt = training.publishedAt || new Date();
  } else if (body.action === "close") {
    if (training.status !== "PUBLISHED") throw new APIError("Only a published training can close registration.", 409, "INVALID_STATE");
    training.status = "CLOSED";
  } else {
    const data = parseTraining(body);
    if (data.audience !== training.audience && (await TrainingRegistration.exists({ training: training._id }))) {
      throw new APIError("Schools have already registered, so the audience can no longer change.", 409, "AUDIENCE_LOCKED");
    }
    Object.assign(training, data);
  }
  await training.save();
  let schoolsNotified = 0;
  if (announce) schoolsNotified = await quietly(announceTraining(training), "announcing to schools");
  // Registered schools learn the next step: attendance after the training.
  if (body.action === "close") schoolsNotified = await quietly(notifyRegistrationClosed(training), "closing notices");
  return successResponse(200, "Training updated", { training: serializeTraining(training.toObject()), schoolsNotified });
});

// The status change is saved; a failed notice must not undo it.
async function quietly(task, label) {
  try {
    return await task;
  } catch (error) {
    console.error(`[trainings] ${label} failed:`, error);
    return 0;
  }
}

/** DELETE — only while nobody has been certified; registrations go with it. */
export const DELETE = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to delete the training" }, async ({ params }) => {
  const training = await loadTraining(params.id);
  if (await Achievement.exists({ training: training._id })) {
    throw new APIError("Certificates were issued for this training, so it cannot be deleted.", 409, "HAS_CERTIFICATES");
  }
  await TrainingRegistration.deleteMany({ training: training._id });
  await training.deleteOne();
  return successResponse(200, "Training deleted", { id: params.id });
});
