import { defineRoute } from "@/lib/routeHandler";
import { successResponse, validationError } from "@/lib/apiResponse";
import { getWebPushPublicConfig, sendAccountPush, sendPushNotifications } from "@/lib/webPush";

export const dynamic = "force-dynamic";

const HOME = {
  PARENT: "/parent/notifications",
  STUDENT: "/student/notices",
  TEACHER: "/teacher/dashboard",
  SCHOOL_ADMIN: "/school/dashboard?tab=notices&section=received",
  SUPER_ADMIN: "/admin/dashboard",
};

/**
 * Send a test alert to every device of the signed-in account, so anyone can
 * check that their phone or laptop really rings and keeps the notification.
 */
export const POST = defineRoute(
  { roles: Object.keys(HOME), errorMessage: "Failed to send a test notification" },
  async ({ session }) => {
    if (!getWebPushPublicConfig().enabled) return validationError("Notifications are not configured yet");
    const role = session.user.role;
    const delivery = {
      notificationId: `test-${Date.now()}`,
      title: "Praavyo notifications are on",
      body: "This device will ring and keep every new notice here until you open it.",
      href: HOME[role],
    };
    const { sent } =
      role === "PARENT"
        ? await sendPushNotifications([{ ...delivery, parentId: session.user.id }])
        : await sendAccountPush({ role, accountIds: [session.user.id] }, delivery);
    if (!sent) {
      return validationError("No device is turned on for notifications yet. Turn them on first, then try again.");
    }
    return successResponse(200, `Test notification sent to ${sent} device${sent === 1 ? "" : "s"}`, { sent });
  }
);
