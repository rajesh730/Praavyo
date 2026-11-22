"use client";

/**
 * Phone / laptop notifications for this browser (every role).
 *
 * Parents register through /api/parent/push-subscription (it enforces the
 * shared-phone rule); students, teachers and schools through
 * /api/me/push-subscription. Signing out forgets the device on both.
 */

export function pushApiFor(role) {
  return role === "PARENT" ? "/api/parent/push-subscription" : "/api/me/push-subscription";
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad Safari only allows web push once Praavyo is on the Home Screen. */
export function needsHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  return ios && !standalone;
}

function applicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

async function serviceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function loadPushStatus(role) {
  const response = await fetch(pushApiFor(role), { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || "Could not load notification settings");
  return json.data || {};
}

/**
 * Subscribe this browser (permission must already be granted) and bind it to
 * the signed-in account. Safe to call on every page load: it re-binds the
 * same endpoint, which also moves a shared laptop to whoever is signed in.
 */
export async function subscribeThisDevice(role, publicKey) {
  if (!publicKey) throw new Error("Notifications are not configured yet");
  const registration = await serviceWorkerRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(publicKey),
    }));
  const response = await fetch(pushApiFor(role), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || "Could not turn on notifications");
  return subscription;
}

export async function sendTestNotification() {
  const response = await fetch("/api/me/push-subscription/test", { method: "POST" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.message || "Could not send a test notification");
  return json.message || "Test notification sent";
}

/** Whether this device gets system notifications (they ring on their own). */
export async function deviceRingsForPush() {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager?.getSubscription());
}

/**
 * Forget this browser for the signed-in account, then drop the endpoint, so a
 * shared phone or laptop stops ringing for someone who signed out.
 */
export async function forgetThisDevice() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try {
    await fetch("/api/me/push-subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      keepalive: true,
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}
