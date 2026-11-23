"use client";

import { ShieldCheck } from "lucide-react";
import DevicePushBanner from "@/components/notifications/DevicePushBanner";

/**
 * "Permissions" in every role's settings (owner, 2026-11-23): what Praavyo may
 * use on this device. Today that is phone/laptop notifications — the same
 * control as the banner, always visible here with a test button, so it can be
 * turned on after "Not now" or checked at any time.
 *
 * Pass `children` to show a role's own control instead (parents use theirs,
 * which enforces the shared-phone rule).
 */
export default function PermissionsSection({ role, title = "Permissions", description, children, className = "" }) {
  return (
    <section className={className} aria-labelledby="settings-permissions-title">
      <h2 id="settings-permissions-title" className="flex items-center gap-2 font-semibold text-ink">
        <ShieldCheck size={18} className="text-brand" aria-hidden />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {description || "What Praavyo may use on this device. Each phone, tablet or laptop is set separately."}
      </p>
      <div className="mt-3">
        {children ?? <DevicePushBanner role={role} variant="card" />}
      </div>
    </section>
  );
}
