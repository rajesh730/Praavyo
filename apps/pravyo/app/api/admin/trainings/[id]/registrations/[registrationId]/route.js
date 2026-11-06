import { defineRoute } from "@/lib/routeHandler";
import TrainingRegistration from "@/models/TrainingRegistration";
import {
  completeRegistration,
  isId,
  loadTraining,
  registrationCertificates,
  reopenRegistration,
  returnAttendance,
  serializeRegistration,
} from "@/lib/trainings";
import { APIError, successResponse } from "@/lib/apiResponse";
import {
  notifyAttendanceReturned,
  notifyTrainingCompleted,
  remindAttendance,
  withdrawTrainingCompletion,
} from "@/lib/trainingNotifications";

export const dynamic = "force-dynamic";

/**
 * POST — Praavyo acts on one school's registration:
 *   `{ action: "complete", trainingDate? }` issue certificates to those the
 *       school marked present (needs its attendance; the date defaults to the
 *       school's);
 *   `{ action: "return", reason }` send the attendance back to correct;
 *   `{ action: "remind" }` ask the school for its attendance;
 *   `{ action: "reopen" }` undo a completion — certificates are withdrawn.
 */
export const POST = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to update the registration" }, async ({ request, params, session }) => {
  const training = await loadTraining(params.id);
  if (!isId(params.registrationId)) throw new APIError("Registration not found", 404, "NOT_FOUND");
  const registration = await TrainingRegistration.findOne({ _id: params.registrationId, training: training._id }).populate("school", "schoolName");
  if (!registration) throw new APIError("Registration not found", 404, "NOT_FOUND");

  const body = await request.json().catch(() => ({}));
  let message;
  // Each change is committed before its notice; a failed notice is only logged.
  let notice = null;

  if (body.action === "complete") {
    const issued = await completeRegistration(training, registration, { trainingDate: body.trainingDate, actorId: session.user.id });
    message = `${issued} certificate${issued === 1 ? "" : "s"} issued`;
    notice = async () => {
      const certificates = (await registrationCertificates([registration._id])).get(String(registration._id)) || [];
      return notifyTrainingCompleted(
        training,
        registration,
        certificates.map((row) => ({ _id: row.id, student: row.personId, certificateUrl: row.url }))
      );
    };
  } else if (body.action === "return") {
    await returnAttendance(registration, body.reason);
    message = "Attendance sent back to the school";
    notice = () => notifyAttendanceReturned(training, registration);
  } else if (body.action === "remind") {
    if (registration.status !== "REGISTERED") throw new APIError("This school has already sent its attendance.", 409, "INVALID_STATE");
    const sent = await remindAttendance(training, registration).catch((error) => {
      console.error("[trainings] reminder failed:", error);
      throw new APIError("The reminder could not be sent. Please try again.", 500, "NOTIFY_FAILED");
    });
    message = sent ? "Reminder sent to the school" : "Already reminded today";
  } else if (body.action === "reopen") {
    if (registration.status !== "COMPLETED") throw new APIError("This school's certificates are not issued yet.", 409, "INVALID_STATE");
    await reopenRegistration(registration);
    message = "Certificates withdrawn";
    notice = () => withdrawTrainingCompletion(training, registration);
  } else {
    throw new APIError("Choose complete, return, remind or reopen.", 400, "VALIDATION_ERROR");
  }

  if (notice) await Promise.resolve().then(notice).catch((error) => console.error(`[trainings] ${body.action} notices failed:`, error));

  const certificates = await registrationCertificates([registration._id]);
  return successResponse(200, message, {
    registration: serializeRegistration(registration.toObject(), {
      certificates: certificates.get(String(registration._id)) || [],
    }),
  });
});
