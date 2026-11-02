import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import { getSessionSchoolId, sameId } from "@/lib/authz";
import { activeSchoolTeacherIds } from "@/lib/eventManagers";
import { publishEventRealtimeUpdate } from "@/lib/eventRealtime";
import Event from "@/models/Event";

/**
 * PUT /api/events/[id]/managers — set which teachers manage a school event.
 *
 * Body: `{ teacherIds: [...] }`, the complete new list. Several teachers may
 * manage one event, and the school can add or remove them at any point in the
 * event's life; a removed teacher loses the Manage Event button and the manage
 * page on their next request. Only teachers ACTIVE at the school are kept.
 */
export const PUT = defineRoute({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] }, async ({ request, params, session }) => {
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.teacherIds)) {
    throw new APIError("teacherIds must be a list", 400, "VALIDATION_ERROR");
  }

  const event = await Event.findById(params.id).catch(() => null);
  if (!event) throw new APIError("Event not found", 404, "NOT_FOUND");
  if (event.eventScope !== "SCHOOL" || !event.school) {
    throw new APIError("Only school events can be given to teachers", 400, "VALIDATION_ERROR");
  }
  if (session.user.role === "SCHOOL_ADMIN" && !sameId(getSessionSchoolId(session), event.school)) {
    throw new APIError("Forbidden", 403, "FORBIDDEN");
  }

  // Only this field changes, so an older event is never re-validated (and
  // possibly rejected) just because a teacher was added.
  const managerIds = await activeSchoolTeacherIds(body.teacherIds, event.school);
  const updated = await Event.findByIdAndUpdate(
    event._id,
    { $set: { assignedMentors: managerIds } },
    { new: true }
  ).populate("assignedMentors", "name email subject roles");

  // Open manage pages and teacher dashboards refresh on this.
  publishEventRealtimeUpdate("event-updated", { event: updated });

  return successResponse(200, "Event managers updated", {
    managers: updated.assignedMentors.map((teacher) => ({
      _id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
    })),
  });
});
