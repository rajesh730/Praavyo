import { defineRoute } from "@/lib/routeHandler";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import { parseTraining, serializeTraining } from "@/lib/trainings";
import { successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/** GET — every training, newest first, with how many schools and people registered. */
export const GET = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to load trainings" }, async () => {
  const [trainings, counts] = await Promise.all([
    Training.find({}).sort({ createdAt: -1 }).lean(),
    TrainingRegistration.aggregate([
      {
        $group: {
          _id: "$training",
          schools: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
          participants: { $sum: { $size: "$participants" } },
        },
      },
    ]),
  ]);
  const countBy = new Map(counts.map((row) => [String(row._id), row]));
  return successResponse(200, "Trainings loaded", {
    trainings: trainings.map((training) => {
      const count = countBy.get(String(training._id)) || {};
      return serializeTraining(training, {
        schoolCount: count.schools || 0,
        completedCount: count.completed || 0,
        participantCount: count.participants || 0,
      });
    }),
  });
});

/** POST — create a training as a draft. Schools see it once it is published. */
export const POST = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to create the training" }, async ({ request, session }) => {
  const data = parseTraining(await request.json().catch(() => ({})));
  const training = await Training.create({ ...data, status: "DRAFT", createdBy: session.user.id });
  return successResponse(201, "Training created", { training: serializeTraining(training.toObject()) });
});
