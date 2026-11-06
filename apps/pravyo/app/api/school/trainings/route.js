import { defineRoute } from "@/lib/routeHandler";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import { registrationCertificates, serializeRegistration, serializeTraining } from "@/lib/trainings";
import { successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET — trainings the school can see: every published or closed training,
 * each with this school's registration (and certificates once completed).
 * Drafts are Praavyo's own and never shown.
 */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load trainings" }, async ({ session }) => {
  const school = session.user.id;
  const [trainings, registrations] = await Promise.all([
    Training.find({ status: { $in: ["PUBLISHED", "CLOSED"] } }).sort({ publishedAt: -1, createdAt: -1 }).lean(),
    TrainingRegistration.find({ school }).lean(),
  ]);
  const certificates = await registrationCertificates(registrations.map((row) => row._id));
  const registrationBy = new Map(registrations.map((row) => [String(row.training), row]));

  return successResponse(200, "Trainings loaded", {
    trainings: trainings
      .map((training) => {
        const registration = registrationBy.get(String(training._id));
        return serializeTraining(training, {
          registration: registration
            ? serializeRegistration(registration, { certificates: certificates.get(String(registration._id)) || [] })
            : null,
        });
      })
      // A closed training stays listed only for schools that took part.
      .filter((training) => training.status === "PUBLISHED" || training.registration),
  });
});
