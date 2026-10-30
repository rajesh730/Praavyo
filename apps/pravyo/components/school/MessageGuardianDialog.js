"use client";

import { useState } from "react";
import Link from "next/link";
import { X as FaTimes, Send as FaPaperPlane, UserLock as FaUserLock } from "lucide-react";
import Glyph from "@/components/ui/Glyph";

/**
 * Message ONE specific guardian.
 *
 * Distinct from the bulk composer on purpose. Selecting a student there reaches
 * every guardian of that child — right for "sports day is Friday", wrong for a
 * private word with one parent. In a separated-family arrangement sending to
 * both can be actively harmful, so this path targets a single
 * ParentStudentLink.
 */
export default function MessageGuardianDialog({
  linkId,
  guardianName,
  studentName,
  canReply = true,
  onClose,
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/school/guardians/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not send");
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Message ${guardianName}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4"
    >
      <div className="mt-6 w-full max-w-md rounded-card bg-surface shadow-pop">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <FaPaperPlane className="text-brand-strong" />
          <h2 className="flex-1 font-semibold text-ink">
            Message {guardianName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-icon btn-ghost flex items-center justify-center"
          >
            <FaTimes />
          </button>
        </header>

        <div className="px-5 py-5">
          {sent ? (
            <div className="text-center">
              <p className="text-2xl" aria-hidden="true">
                <Glyph emoji="✓" />
              </p>
              <p className="mt-3 font-semibold text-ink">
                Sent to {guardianName}
              </p>
              <p className="mt-1 text-sm text-muted">
                Their reply will appear in{" "}
                <Link
                  href="/school/messages"
                  className="font-semibold text-brand-strong underline"
                >
                  Parent Messages
                </Link>
                .
              </p>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary mt-5 w-full"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="rounded-card bg-brand-soft px-4 py-3 text-sm text-brand-strong">
                Only <strong>{guardianName}</strong> will see this. Other
                guardians of {studentName} will not.
              </p>

              {!canReply ? (
                <p className="mt-3 flex items-start gap-2 rounded-card bg-warning-soft px-4 py-3 text-xs text-warning">
                  <FaUserLock className="mt-0.5 shrink-0" />
                  <span>
                    Messaging is switched off for this guardian, so they will
                    receive this but <strong>cannot reply</strong>. Turn on
                    &quot;Message the school&quot; in their permissions if you
                    want an answer.
                  </span>
                </p>
              ) : null}

              <textarea
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={`Write to ${guardianName} about ${studentName}...`}
                className="input mt-4 w-full leading-relaxed"
              />

              {error ? (
                <p className="mt-3 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !message.trim()}
                  className="btn btn-primary"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
