"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, X } from "lucide-react";
import {
  isPushSupported,
  loadPushStatus,
  needsHomeScreenInstall,
  sendTestNotification,
  subscribeThisDevice,
} from "@pravyo/ui/devicePush";

const DISMISS_KEY = "praavyo:device-push-dismissed";

function readDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Turns on phone/laptop notifications for the signed-in account (owner,
 * 2026-11-22: every notice must ring the device and stay in its tray).
 *
 * - Permission already granted: silently (re)binds this device on every load.
 * - Not asked yet: a banner with "Turn on" (the browser only shows its prompt
 *   after a tap) and "Not now" (hidden until the browser is reopened).
 * - Blocked: how to allow it again in the browser's site settings.
 * - iPhone Safari: Add to Home Screen first, the only way iOS allows it.
 *
 * `variant="card"` is the always-visible version for settings pages, with a
 * test button so anyone can check their device really rings.
 */
export default function DevicePushBanner({ role, variant = "banner" }) {
  const [state, setState] = useState({ phase: "loading", message: "", busy: false });
  // Nothing renders until the status loads, so reading storage here cannot
  // make the server and browser markup differ.
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && readDismissed());
  const [publicKey, setPublicKey] = useState("");

  const set = (patch) => setState((current) => ({ ...current, ...patch }));

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isPushSupported()) {
        if (active) set({ phase: needsHomeScreenInstall() ? "ios" : "unsupported" });
        return;
      }
      try {
        const status = await loadPushStatus(role);
        if (!active) return;
        // Shared family phones never get push (parent privacy rule).
        if (!status.enabled || status.allowedOnDevice === false) return set({ phase: "unconfigured" });
        setPublicKey(status.publicKey || "");
        if (Notification.permission === "denied") return set({ phase: "blocked" });
        if (Notification.permission === "granted") {
          await subscribeThisDevice(role, status.publicKey);
          if (active) set({ phase: "on" });
          return;
        }
        set({ phase: "ask" });
      } catch (error) {
        if (active) set({ phase: "error", message: error.message });
      }
    })();
    return () => {
      active = false;
    };
  }, [role]);

  const turnOn = useCallback(async () => {
    set({ busy: true, message: "" });
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") return set({ phase: "blocked", busy: false });
      if (permission !== "granted") return set({ busy: false });
      await subscribeThisDevice(role, publicKey);
      const message = await sendTestNotification().catch(() => "");
      set({ phase: "on", busy: false, message: message ? "Notifications are on. A test notification was sent to this device." : "" });
    } catch (error) {
      set({ busy: false, message: error.message });
    }
  }, [publicKey, role]);

  const test = useCallback(async () => {
    set({ busy: true, message: "" });
    try {
      set({ busy: false, message: await sendTestNotification() });
    } catch (error) {
      set({ busy: false, message: error.message });
    }
  }, []);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: hidden for this page view only.
    }
    setDismissed(true);
  };

  const { phase, message, busy } = state;
  if (phase === "loading" || phase === "unconfigured") return null;

  if (variant === "banner") {
    // The banner only asks; once on (or unsupported) it gets out of the way,
    // apart from the confirmation right after turning it on.
    const asking = phase === "ask" || phase === "blocked" || phase === "ios";
    if (!(asking && !dismissed) && !(phase === "on" && message)) return null;
  }

  const copy = {
    ask: {
      icon: BellRing,
      title: "Turn on notifications on this device",
      text: "Get a sound and a notification that stays on this phone or laptop for every new notice.",
    },
    on: {
      icon: BellRing,
      title: "Notifications are on for this device",
      text: "Every new notice rings this device and stays in its notifications until you open it.",
    },
    blocked: {
      icon: BellOff,
      title: "Notifications are blocked in this browser",
      text: "Tap the lock icon next to the web address, set Notifications to Allow, then reload the page.",
    },
    ios: {
      icon: BellRing,
      title: "Add Praavyo to your Home Screen for notifications",
      text: "On iPhone and iPad, tap Share, then Add to Home Screen, open Praavyo from there and turn notifications on.",
    },
    unsupported: {
      icon: BellOff,
      title: "This browser cannot show notifications",
      text: "Open Praavyo in Chrome, Edge or Firefox to get notifications on this device.",
    },
    error: {
      icon: BellOff,
      title: "Notifications could not be checked",
      text: message || "Reload the page to try again.",
    },
  }[phase];
  const Icon = copy.icon;

  return (
    <div className={variant === "banner" ? "mb-4" : ""}>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{copy.title}</p>
          <p className="mt-0.5 text-sm text-muted">{copy.text}</p>
          {message && phase !== "error" && <p className="mt-1 text-sm font-semibold text-brand-strong">{message}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {phase === "ask" && (
            <button type="button" onClick={turnOn} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Turning on…" : "Turn on"}
            </button>
          )}
          {phase === "on" && (
            <button type="button" onClick={test} disabled={busy} className="btn btn-secondary btn-sm">
              {busy ? "Sending…" : "Send a test"}
            </button>
          )}
          {variant === "banner" && (
            <button type="button" onClick={phase === "on" ? () => set({ message: "" }) : dismiss} className="btn btn-ghost btn-sm" aria-label="Close">
              {phase === "on" ? <X size={16} aria-hidden /> : "Not now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
