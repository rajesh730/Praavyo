import { publishRealtimeEvent } from "@/lib/realtimeBus";

export function publishNoticeRealtimeEvent({
  scope = "",
  targetAudience = null,
  isDeleted = false,
} = {}) {
  const normalizedScope = String(scope || "").toUpperCase();

  if (normalizedScope === "PLATFORM") {
    publishRealtimeEvent("school-notifications", {
      kind: isDeleted ? "platform-notice-removed" : "platform-notice-updated",
    });
    return;
  }

  // Teachers' bells refresh for notices addressed to teachers or events.
  if (targetAudience?.teachers || normalizedScope === "SCHOOL") {
    publishRealtimeEvent("teacher-notifications", {
      kind: isDeleted ? "teacher-notice-removed" : "teacher-notice-updated",
    });
  }

  if (targetAudience?.students && !isDeleted) {
    publishRealtimeEvent("student-notifications", {
      kind: "student-notice-updated",
    });
    return;
  }

  if (targetAudience?.students && isDeleted) {
    publishRealtimeEvent("student-notifications", {
      kind: "student-notice-removed",
    });
  }
}
