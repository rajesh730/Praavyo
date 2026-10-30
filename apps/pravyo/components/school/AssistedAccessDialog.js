"use client";

import { useState } from "react";
import { X as FaTimes, Printer as FaPrint } from "lucide-react";
import Glyph from "@/components/ui/Glyph";

/**
 * School-Assisted Parent View (§22, §55).
 *
 * For the guardian who comes to the office because they have no device. Staff
 * verify them in person, record why, and show the child's record on the school
 * screen.
 *
 * The reason field is required and the in-person verification is an explicit
 * checkbox, not a formality — both are what turn this from "a button that
 * shows any parent's data" into an auditable, deliberate act. The API refuses
 * without a reason.
 *
 * The staff member is never signed in as the parent. This renders a read-only
 * projection returned by the server.
 */
export default function AssistedAccessDialog({
  studentId,
  studentName,
  linkId,
  guardianName,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [state, setState] = useState({ loading: false, data: null, error: "" });

  const open = async () => {
    setState({ loading: true, data: null, error: "" });
    try {
      const res = await fetch("/api/school/assisted-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, linkId, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not open view");
      setState({ loading: false, data: json.data, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assisted parent view"
      className="fixed inset-0 z-50 overflow-y-auto bg-surface"
    >
      <header className="no-print sticky top-0 flex items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-icon btn-ghost flex items-center justify-center"
        >
          <FaTimes aria-hidden="true" className="h-5 w-5" />
        </button>
        <p className="flex-1 font-semibold text-ink">
          Assisted Parent View
        </p>
        {state.data ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-primary flex items-center gap-2"
          >
            <FaPrint aria-hidden="true" className="h-3.5 w-3.5" />
            Print
          </button>
        ) : null}
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {!state.data ? (
          <div className="space-y-4">
            <div className="rounded-card border border-warning-line bg-warning-soft p-4">
              <p className="text-sm font-semibold text-warning">
                Before you continue
              </p>
              <p className="mt-1 text-sm text-warning">
                Only open this view for <strong>{guardianName}</strong> after you
                have confirmed their identity in person. This access is recorded.
              </p>
            </div>

            <div>
              <label
                htmlFor="reason"
                className="block text-sm font-semibold text-ink"
              >
                Why are you opening this view?
              </label>
              <input
                id="reason"
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Guardian visited the office, no smartphone"
                className="input mt-1.5 w-full"
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
                className="mt-1 h-5 w-5"
              />
              I have checked this guardian&apos;s identity in person.
            </label>

            {state.error ? (
              <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
                {state.error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!reason.trim() || !verified || state.loading}
              onClick={open}
              className="btn btn-primary w-full"
            >
              {state.loading ? "Opening…" : `Open ${studentName}'s record`}
            </button>
          </div>
        ) : (
          <AssistedView data={state.data} />
        )}
      </div>
    </div>
  );
}

function AssistedView({ data }) {
  return (
    <article className="">
      <header className="">
        <p className="">{data.child.name}</p>
        <p className="">
          {[data.child.grade, data.child.rollNumber && `Roll ${data.child.rollNumber}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="">
          Shown to {data.guardian.name} ({relationshipLabel(data.guardian.relationshipType)})
        </p>
      </header>

      {!data.journey ? (
        <p className="mt-4 rounded-card bg-surface-2 px-4 py-3 text-sm">
          This guardian is not permitted to view the portfolio.
        </p>
      ) : (
        <>
          <h2 className="">Journey</h2>
          {data.journey.entries.length === 0 ? (
            <p className="text-sm">Nothing recorded yet.</p>
          ) : (
            data.journey.entries.map((entry) => (
              <div key={entry.id} className="">
                <p className="">
                  <Glyph emoji={entry.emoji} className="mr-1 inline align-[-2px]" /> {entry.title}
                </p>
                <p className="">
                  {entry.date
                    ? new Date(entry.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : ""}
                  {entry.school?.name ? ` · ${entry.school.name}` : ""}
                </p>
              </div>
            ))
          )}
        </>
      )}

      <footer className="">
        <p>
          Shown by {data.viewedBy} on{" "}
          {new Date(data.viewedAt).toLocaleString("en-GB")}. This view is
          recorded in the school&apos;s records.
        </p>
      </footer>
    </article>
  );
}

function relationshipLabel(value) {
  if (!value) return "Guardian";
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
