import { defineRoute } from "@/lib/routeHandler";
import { getSessionSchoolId } from "@/lib/authz";
import { successResponse, validationError } from "@/lib/apiResponse";
import { getWebPushPublicConfig } from "@/lib/webPush";
import PushSubscription from "@/models/PushSubscription";

export const dynamic = "force-dynamic";

// Parents register through /api/parent/push-subscription (shared-phone rules).
const ROLES = ["STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"];
const ANY_ROLE = [...ROLES, "PARENT"];

/** This device's phone/laptop alerts for the signed-in student, teacher or school. */
export const GET = defineRoute({ roles: ROLES, errorMessage: "Failed to load notification settings" }, async ({ session }) => {
  const count = await PushSubscription.countDocuments({ accountRole: session.user.role, account: session.user.id });
  return successResponse(200, "Push status loaded", {
    ...getWebPushPublicConfig(),
    subscribed: count > 0,
    subscriptionCount: count,
  });
});

/**
 * Bind this browser's push endpoint to the signed-in account. An endpoint is
 * one browser profile, so binding it again from another account moves it:
 * a shared laptop only ever rings for whoever is signed in now.
 */
export const POST = defineRoute({ roles: ROLES, errorMessage: "Failed to turn on notifications" }, async ({ request, session }) => {
  if (session.error) return validationError("Sign in again to turn on notifications");
  if (!getWebPushPublicConfig().enabled) return validationError("Notifications are not configured yet");

  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint || "").trim();
  const p256dh = String(body?.keys?.p256dh || "").trim();
  const auth = String(body?.keys?.auth || "").trim();
  const expirationTime = Number(body?.expirationTime);

  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return validationError("Invalid push subscription");
  }
  if (endpointUrl.protocol !== "https:" || !p256dh || !auth || endpoint.length > 2048) {
    return validationError("Invalid push subscription");
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        account: session.user.id,
        accountRole: session.user.role,
        school: getSessionSchoolId(session),
        keys: { p256dh, auth },
        authVersion: Number(session.user.authVersion || 0),
        expirationTime:
          Number.isFinite(expirationTime) && expirationTime > Date.now() ? new Date(expirationTime) : null,
        userAgent: String(request.headers.get("user-agent") || "").slice(0, 500),
        lastUsedAt: new Date(),
      },
      // Taken over from a parent account on the same browser.
      $unset: { parent: "" },
    },
    { upsert: true, new: true, runValidators: true }
  );

  return successResponse(200, "Notifications turned on for this device", { subscribed: true });
});

/** Forget this device for the signed-in account (sign-out, or turned off). */
export const DELETE = defineRoute({ roles: ANY_ROLE, errorMessage: "Failed to turn off notifications" }, async ({ request, session }) => {
  const body = await request.json().catch(() => ({}));
  const endpoint = String(body?.endpoint || "").trim();
  if (!endpoint) return validationError("A device subscription is required");
  await PushSubscription.deleteOne({
    endpoint,
    $or: [{ account: session.user.id }, { parent: session.user.id }],
  });
  return successResponse(200, "Notifications turned off for this device", { subscribed: false });
});
