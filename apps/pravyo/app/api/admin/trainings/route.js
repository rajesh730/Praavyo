import { defineRoute } from "@/lib/routeHandler";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import { parseTraining, serializeTraining } from "@/lib/trainings";
import { successResponse } from "@/lib/apiResponse";
import { announceTraining } from "@/lib/trainingNotifications";

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
          // Attendance received, certificates not yet issued.
          awaiting: { $sum: { $cond: [{ $eq: ["$status", "SUBMITTED"] }, 1, 0] } },
          participants: { $sum: { $size: "$participants" } },
          present: {
            $sum: {
              $size: {
                $filter: { input: "$participants", as: "person", cond: { $eq: ["$$person.attendance", "PRESENT"] } },
              },
            },
          },
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
        awaitingCount: count.awaiting || 0,
        participantCount: count.participants || 0,
        presentCount: count.present || 0,
      });
    }),
  });
});

/**
 * POST — create a training. `publish: true` publishes it at once and tells
 * every school; otherwise it is a draft that only Praavyo sees.
 */
export const POST = defineRoute({ roles: ["SUPER_ADMIN"], errorMessage: "Failed to create the training" }, async ({ request, session }) => {
  const body = await request.json().catch(() => ({}));
  const data = parseTraining(body);
  const publish = body?.publish === true;
  const training = await Training.create({
    ...data,
    status: publish ? "PUBLISHED" : "DRAFT",
    publishedAt: publish ? new Date() : null,
    createdBy: session.user.id,
  });
  let schoolsNotified = 0;
  if (publish) {
    try {
      schoolsNotified = await announceTraining(training);
    } catch (error) {
      console.error("[trainings] announcing to schools failed:", error);
    }
  }
  return successResponse(201, "Training created", { training: serializeTraining(training.toObject()), schoolsNotified });
});
