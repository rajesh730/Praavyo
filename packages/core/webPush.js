import webPush from "web-push";
import connectDB from "@pravyo/db";
import PushSubscription from "@pravyo/db/models/PushSubscription";
import Parent from "@pravyo/db/models/Parent";
import User from "@pravyo/db/models/User";
import Student from "@pravyo/db/models/Student";
import Teacher from "@pravyo/db/models/Teacher";

const PUSH_CONCURRENCY = 20;

// Where a tap opens when a delivery names no page (or an unsafe one).
const HOME_BY_ROLE = {
  PARENT: "/parent/notifications",
  STUDENT: "/student/notices",
  TEACHER: "/teacher/dashboard",
  SCHOOL_ADMIN: "/school/dashboard?tab=notices",
  SUPER_ADMIN: "/admin/dashboard",
};

function configuration() {
  // Read on the server only — the browser receives it through
  // getWebPushPublicConfig(), so it needs no NEXT_PUBLIC_ prefix. The old
  // NEXT_PUBLIC_ name is still accepted so a deployment that has not renamed
  // the variable yet keeps sending push.
  const publicKey = String(
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
  ).trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(
    process.env.VAPID_SUBJECT ||
      `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "contact@praavyo.com"}`
  ).trim();

  return { publicKey, privateKey, subject };
}

function safeHref(value, role = "PARENT") {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//")
    ? path.slice(0, 300)
    : HOME_BY_ROLE[role] || "/";
}

export function getWebPushPublicConfig() {
  const { publicKey, privateKey } = configuration();
  return { enabled: Boolean(publicKey && privateKey), publicKey };
}

/**
 * The picture beside a notification: the school's own logo when the alert
 * comes from a school (its staff, students or families), the Praavyo logo for
 * platform messages (owner, 2026-11-23). A delivery sets `schoolId` to show
 * that school's logo, or `schoolId: null` to force the Praavyo logo.
 */
function safeIcon(value) {
  const url = String(value || "").trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url.slice(0, 300);
  return /^https:\/\//i.test(url) ? url.slice(0, 500) : "";
}

async function schoolLogos(schoolIds) {
  if (!schoolIds.length) return new Map();
  // A logo is decoration: any failure here just means the Praavyo logo.
  try {
    const ObjectId = PushSubscription.base?.Types?.ObjectId;
    const collection = PushSubscription.db?.collection?.("schoolshowcaseprofiles");
    if (!ObjectId || !collection) return new Map();
    const ids = [...new Set(schoolIds.map((id) => String(id || "")))].filter((id) => ObjectId.isValid(id));
    if (!ids.length) return new Map();
    const rows = await collection
      .find({ school: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { school: 1, logoUrl: 1, coverImageUrl: 1 } })
      .toArray();
    return new Map(
      rows
        .map((row) => [String(row.school), safeIcon(row.logoUrl || row.coverImageUrl)])
        .filter(([, icon]) => icon)
    );
  } catch (error) {
    console.error("[webPush] school logo lookup failed:", error.message);
    return new Map();
  }
}

function payloadFor(delivery, role, icon = "") {
  const id = String(delivery.notificationId || "");
  return JSON.stringify({
    notificationId: id,
    // Empty means the Praavyo logo (public/sw.js).
    icon: safeIcon(delivery.icon) || icon,
    title: String(delivery.title || "Praavyo").slice(0, 180),
    body: String(delivery.body || "You have a new update.").slice(0, 500),
    href: safeHref(delivery.href, role),
    createdAt: delivery.createdAt || new Date().toISOString(),
    // A unique tag keeps every notice as its own entry in the notification
    // tray, so a later one never replaces an earlier one.
    tag: `pravyo-${id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`.slice(0, 120),
    urgent: Boolean(delivery.urgent),
  });
}

/**
 * Send `jobs` ({ subscription, delivery, role }) in small batches. Endpoints
 * the browser has permanently dropped (404/410) are deleted.
 */
async function deliver(jobs) {
  const { publicKey, privateKey, subject } = configuration();
  webPush.setVapidDetails(subject, publicKey, privateKey);

  const logos = await schoolLogos(
    jobs.filter(({ delivery }) => !delivery.icon && delivery.schoolId).map(({ delivery }) => delivery.schoolId)
  );

  let sent = 0;
  for (let index = 0; index < jobs.length; index += PUSH_CONCURRENCY) {
    const batch = jobs.slice(index, index + PUSH_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ subscription, delivery, role }) => {
        try {
          await webPush.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            payloadFor(delivery, role, delivery.schoolId ? logos.get(String(delivery.schoolId)) || "" : ""),
            // High urgency for everything: a notice is the reason the app
            // exists, and "normal" lets Android hold it while the phone dozes.
            { TTL: 60 * 60 * 24 * 3, urgency: "high" }
          );
          sent += 1;
        } catch (error) {
          // 404/410 means the browser permanently invalidated this endpoint.
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
            return;
          }
          console.error("[webPush] delivery failed:", error.message);
        }
      })
    );
  }
  return sent;
}

/** Send each durable notification to every current device for its parent. */
export async function sendPushNotifications(deliveries = []) {
  const normalized = (Array.isArray(deliveries) ? deliveries : [])
    .map((delivery) => ({
      ...delivery,
      parentId: String(delivery?.parentId || "").trim(),
    }))
    .filter((delivery) => delivery.parentId);
  const { publicKey, privateKey } = configuration();

  if (normalized.length === 0 || !publicKey || !privateKey) {
    return { sent: 0 };
  }

  await connectDB();

  const parentIds = Array.from(
    new Set(normalized.map((delivery) => delivery.parentId))
  );
  const [parents, subscriptions] = await Promise.all([
    Parent.find({
      _id: { $in: parentIds },
      status: "ACTIVE",
      accessState: "ACTIVATED",
      isDeleted: { $ne: true },
    })
      .select("_id authVersion")
      .lean(),
    PushSubscription.find({ parent: { $in: parentIds } })
      .select("parent endpoint keys authVersion expirationTime")
      .lean(),
  ]);

  const authVersionByParent = new Map(
    parents.map((parent) => [String(parent._id), Number(parent.authVersion || 0)])
  );
  const deliveriesByParent = new Map();
  normalized.forEach((delivery) => {
    if (!deliveriesByParent.has(delivery.parentId)) {
      deliveriesByParent.set(delivery.parentId, []);
    }
    deliveriesByParent.get(delivery.parentId).push(delivery);
  });

  const now = Date.now();
  const jobs = [];
  const staleEndpoints = [];

  subscriptions.forEach((subscription) => {
    const parentId = String(subscription.parent);
    const currentAuthVersion = authVersionByParent.get(parentId);
    const expired =
      subscription.expirationTime &&
      new Date(subscription.expirationTime).getTime() <= now;

    if (
      currentAuthVersion === undefined ||
      Number(subscription.authVersion || 0) !== currentAuthVersion ||
      expired
    ) {
      staleEndpoints.push(subscription.endpoint);
      return;
    }

    (deliveriesByParent.get(parentId) || []).forEach((delivery) => {
      jobs.push({ subscription, delivery, role: "PARENT" });
    });
  });

  if (staleEndpoints.length > 0) {
    await PushSubscription.deleteMany({ endpoint: { $in: staleEndpoints } });
  }

  return { sent: await deliver(jobs) };
}

/**
 * Which of `ids` still belong to a working account of `role`, with the
 * credential generation a device must match (null = not versioned).
 */
async function liveAccounts(role, ids) {
  if (!ids.length) return new Map();
  if (role === "STUDENT") {
    const rows = await Student.find({ _id: { $in: ids }, status: "ACTIVE", isDeleted: { $ne: true } })
      .select("_id")
      .lean();
    return new Map(rows.map((row) => [String(row._id), null]));
  }
  if (role === "TEACHER") {
    const rows = await Teacher.find({ _id: { $in: ids }, isDeleted: { $ne: true } }).select("_id").lean();
    return new Map(rows.map((row) => [String(row._id), null]));
  }
  // School and super admin accounts; a suspended or pending school gets none.
  const rows = await User.find({
    _id: { $in: ids },
    role,
    ...(role === "SCHOOL_ADMIN" ? { status: { $in: ["APPROVED", "SUBSCRIBED"] } } : {}),
  })
    .select("_id authVersion")
    .lean();
  return new Map(rows.map((row) => [String(row._id), Number(row.authVersion || 0)]));
}

/**
 * Push one message to signed-in accounts other than parents.
 *
 *   audience.role       STUDENT | TEACHER | SCHOOL_ADMIN | SUPER_ADMIN
 *   audience.accountIds only these accounts (omit for everyone of the role)
 *   audience.school     only devices registered at this school
 *   audience.excludeIds never these accounts (e.g. whoever published it)
 *
 * Never throws: an alert failure must not undo the action that caused it.
 */
export async function sendAccountPush(audience = {}, delivery = {}) {
  try {
    const role = String(audience.role || "").toUpperCase();
    const { publicKey, privateKey } = configuration();
    if (!publicKey || !privateKey || !role || role === "PARENT") return { sent: 0 };

    const accountIds = Array.isArray(audience.accountIds)
      ? [...new Set(audience.accountIds.map((id) => String(id || "")).filter(Boolean))]
      : null;
    if (accountIds && accountIds.length === 0) return { sent: 0 };

    await connectDB();
    const filter = { accountRole: role };
    if (accountIds) filter.account = { $in: accountIds };
    if (audience.school) filter.school = audience.school;
    const subscriptions = await PushSubscription.find(filter)
      .select("account endpoint keys authVersion expirationTime")
      .lean();
    if (!subscriptions.length) return { sent: 0 };

    const excluded = new Set((audience.excludeIds || []).map(String));
    const live = await liveAccounts(role, [...new Set(subscriptions.map((row) => String(row.account)))]);
    const now = Date.now();
    const stale = [];
    const jobs = [];
    subscriptions.forEach((subscription) => {
      const accountId = String(subscription.account);
      if (excluded.has(accountId)) return;
      const expired = subscription.expirationTime && new Date(subscription.expirationTime).getTime() <= now;
      const version = live.get(accountId);
      const revoked = !live.has(accountId) || (version !== null && Number(subscription.authVersion || 0) !== version);
      if (expired || revoked) {
        stale.push(subscription.endpoint);
        return;
      }
      // A school audience shows that school's logo unless the delivery says otherwise.
      jobs.push({
        subscription,
        delivery: delivery.schoolId === undefined ? { ...delivery, schoolId: audience.school || null } : delivery,
        role,
      });
    });

    if (stale.length) await PushSubscription.deleteMany({ endpoint: { $in: stale } });
    return { sent: await deliver(jobs) };
  } catch (error) {
    console.error("[webPush] account push failed:", error.message);
    return { sent: 0 };
  }
}
