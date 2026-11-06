import { defineRoute } from "@/lib/routeHandler";
import TrainingRegistration from "@/models/TrainingRegistration";
import {
  completeRegistration,
  isId,
  loadTraining,
  registrationCertificates,
  reopenRegistration,
  serializeRegistration,
} from "@/lib/trainings";
import { APIError, successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST `{ action: "complete", trainingDate: "YYYY-MM-DD" }` — Praavyo trained
 * at this school: issue every registered participant's certificate.
 * POST `{ action: "reopen" }` — undo a mistaken completion; the certificates
 * are withdrawn and the school can edit its list again.
 */
export const POST = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to update the registration" }, async ({ request, params, session }) => {
  const training = await loadTraining(params.id);
  if (!isId(params.registrationId)) throw new APIError("Registration not found", 404, "NOT_FOUND");
  const registration = await TrainingRegistration.findOne({ _id: params.registrationId, training: training._id }).populate("school", "schoolName");
  if (!registration) throw new APIError("Registration not found", 404, "NOT_FOUND");

  const body = await request.json().catch(() => ({}));
  let issued = 0;
  if (body.action === "complete") {
    issued = await completeRegistration(training, registration, { trainingDate: body.trainingDate, actorId: session.user.id });
  } else if (body.action === "reopen") {
    if (registration.status !== "COMPLETED") throw new APIError("This school's training is not completed yet.", 409, "INVALID_STATE");
    await reopenRegistration(registration);
  } else {
    throw new APIError("Choose complete or reopen.", 400, "VALIDATION_ERROR");
  }

  const certificates = await registrationCertificates([registration._id]);
  return successResponse(200, body.action === "complete" ? `${issued} certificates issued` : "Training reopened", {
    registration: serializeRegistration(registration.toObject(), {
      certificates: certificates.get(String(registration._id)) || [],
    }),
  });
});
