import { defineRoute } from "@/lib/routeHandler";
import TrainingRegistration from "@/models/TrainingRegistration";
import {
  cancelRegistration,
  loadTraining,
  saveRegistration,
  schoolRoster,
  serializeRegistration,
  serializeTraining,
} from "@/lib/trainings";
import { APIError, successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

async function visibleTraining(id) {
  const training = await loadTraining(id);
  if (training.status === "DRAFT") throw new APIError("Training not found", 404, "NOT_FOUND");
  return training;
}

/** GET — the training, who the school can register, and its current registration. */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load the training" }, async ({ params, session }) => {
  const training = await visibleTraining(params.id);
  const [roster, registration] = await Promise.all([
    schoolRoster(training, session.user.id),
    TrainingRegistration.findOne({ training: training._id, school: session.user.id }).lean(),
  ]);
  return successResponse(200, "Training loaded", {
    training: serializeTraining(training.toObject()),
    roster,
    registration: registration ? serializeRegistration(registration) : null,
  });
});

/** PUT `{ mode, grades, participants }` — register, or change who is registered. */
export const PUT = defineRoute({ roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to register" }, async ({ request, params, session }) => {
  const training = await visibleTraining(params.id);
  const registration = await saveRegistration(training, session.user.id, await request.json().catch(() => ({})));
  return successResponse(200, "Registration saved", { registration: serializeRegistration(registration.toObject()) });
});

/** DELETE — withdraw the school's registration (not once completed). */
export const DELETE = defineRoute({ roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to cancel the registration" }, async ({ params, session }) => {
  const training = await visibleTraining(params.id);
  await cancelRegistration(training, session.user.id);
  return successResponse(200, "Registration cancelled", {});
});
