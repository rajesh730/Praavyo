"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

const DISMISSED_KEY = "praavyo:iemis-reminder-later";

function dismissedThisVisit() {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Schools registered before the IEMIS number became compulsory are asked for
 * it when they open their dashboard. "Later" hides the reminder until the next
 * visit (this browser session); it keeps coming back until the number is
 * saved. The same field is always in Settings.
 */
export default function IemisReminder() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dismissedThisVisit()) return undefined;
    let active = true;
    fetch("/api/school/settings/iemis", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload && !payload.data?.iemisNumber) setOpen(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const later = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Without storage the reminder simply returns on the next page.
    }
    setOpen(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/school/settings/iemis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iemisNumber: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "The IEMIS number could not be saved.");
      setOpen(false);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="iemis-reminder-title">
      <form onSubmit={save} className="modal-panel max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
            <BadgeCheck aria-hidden size={20} />
          </span>
          <div className="min-w-0">
            <h2 id="iemis-reminder-title" className="text-base font-semibold text-ink">Enter your school&apos;s IEMIS number</h2>
            <p className="mt-1 text-sm text-muted">
              Every school on Praavyo is registered with the IEMIS number issued by the government. It is printed on every report card, so results are authentic.
            </p>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="label">School IEMIS registration number</span>
          <input
            autoFocus
            required
            maxLength={50}
            value={value}
            onChange={(event) => setValue(event.target.value.toUpperCase())}
            placeholder="IEMIS number issued by the government"
            autoComplete="off"
            className="input w-full"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <p className="mt-2 text-xs text-muted">
          Not at hand? Choose Later. You can add it any time in{" "}
          <Link href="/school/dashboard?tab=settings" onClick={later} className="font-semibold text-brand hover:underline">Settings</Link>.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={later} disabled={saving} className="btn btn-secondary">Later</button>
          <button type="submit" disabled={saving || !value.trim()} className="btn btn-primary">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
