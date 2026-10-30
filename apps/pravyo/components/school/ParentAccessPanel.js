"use client";

import { useCallback, useEffect, useState } from "react";
import { IdCard as FaIdCard, RotateCw as FaRedo, Ban as FaBan, LockOpen as FaUnlock } from "lucide-react";
import ParentCardDialog from "./ParentCardDialog";
import Glyph from "@/components/ui/Glyph";

/**
 * Parent Access management for one guardian (§4, §58, §59).
 *
 * Shows the three states §59 insists on keeping separate, because conflating
 * them is how a school ends up revoking the wrong thing:
 *
 *   - **Access**       — can this guardian sign in at all?
 *   - **Relationship** — is this guardian still linked to THIS child?
 *   - **Reachability** — which channels can actually deliver to them?
 *
 * "Revoke this child" and "Revoke all access" are deliberately separate
 * actions with different wording, because §44 turns on the distinction: a
 * father who loses access to Child A must keep Child B.
 */

const ACCESS_STATES = {
  NOT_CREATED: { emoji: "⚪", label: "No card yet", tone: "bg-surface-2 text-ink" },
  PENDING_ACTIVATION: { emoji: "🟡", label: "Card issued", tone: "bg-warning-soft text-warning" },
  ACTIVATED: { emoji: "🟢", label: "Activated", tone: "bg-success-soft text-success" },
  LOCKED: { emoji: "🔒", label: "Locked", tone: "bg-danger-soft text-danger" },
  REVOKED: { emoji: "⛔", label: "Revoked", tone: "bg-line text-ink" },
};

export default function ParentAccessPanel({
  linkId,
  guardianName,
  studentName,
  onChanged,
}) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [busy, setBusy] = useState("");
  const [card, setCard] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/school/guardians/access?linkId=${encodeURIComponent(linkId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not load access");
      setState({ loading: false, data: json.data, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  }, [linkId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Issue a card and SHOW it.
   *
   * `INITIAL` is idempotent — it allocates a Parent ID only if the guardian has
   * none — so "Show card" is safe to press at any time. `REISSUE` rotates the
   * ID and is the one action here that can lock a guardian out, which is why it
   * is confirmed first and worded as "the old card stops working".
   */
  const issue = async (purpose) => {
    if (
      purpose === "REISSUE" &&
      !window.confirm(
        `Reset ${guardianName}'s Parent ID?\n\n` +
          "Their current ID and QR code will stop working immediately. " +
          "You will need to give them the newly generated ID or QR code."
      )
    ) {
      return;
    }

    setBusy(purpose);
    try {
      const res = await fetch("/api/school/guardians/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, purpose }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not create access");

      setCard(json.data);
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    } finally {
      setBusy("");
    }
  };

  const act = async (action, extra = {}) => {
    setBusy(action);
    try {
      const res = await fetch("/api/school/guardians/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not update access");
      await load();
      onChanged?.();
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    } finally {
      setBusy("");
    }
  };

  if (state.loading) {
    return <div className="h-32 animate-pulse rounded-card bg-surface-2" />;
  }

  if (!state.data) {
    return (
      <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }

  const data = state.data;
  const accessState = ACCESS_STATES[data.accessState] || ACCESS_STATES.NOT_CREATED;
  const hasCard = data.accessState !== "NOT_CREATED";

  return (
    <section className="card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Parent Access
        </span>
        <span
          className={`badge badge-neutral ${accessState.tone}`}
        >
          <Glyph emoji={accessState.emoji} className="mr-1 inline align-[-2px]" /> {accessState.label}
        </span>
        {data.parentIdentifier ? (
          <code className="rounded-control bg-surface px-2 py-0.5 font-mono text-2xs text-ink">
            {data.parentIdentifier}
          </code>
        ) : null}
      </div>

      {/* Reachability — never says "unreachable" just because there is no
          email or phone (§36). */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-2xs">
        <Chip
          on={data.accessState === "ACTIVATED"}
          onLabel="🟢 Praavyo"
          offLabel="⚪ Not in app yet"
        />
        <Chip
          on={Boolean(data.contact.email)}
          onLabel="🔵 Email"
          offLabel="⚪ No email"
        />
        <Chip
          on={Boolean(data.contact.phone)}
          onLabel="🟡 Phone"
          offLabel="⚪ No phone"
        />
        <span className="rounded-full bg-line px-2 py-0.5 text-muted">
          ⚪ SMS not configured
        </span>
      </div>

      {data.accessState === "PENDING_ACTIVATION" ? (
        <p className="badge badge-warning mt-2">
          Card issued. Waiting for the guardian to sign in for the first time.
        </p>
      ) : null}

      {state.error ? (
        <p className="badge badge-danger mt-2">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!hasCard ? (
          <Action
            icon={FaIdCard}
            label="Create access card"
            busy={busy === "INITIAL"}
            onClick={() => issue("INITIAL")}
            primary
          />
        ) : (
          <>
            {/* Safe and repeatable — the card can be shown as often as the
                office needs it. */}
            <Action
              icon={FaIdCard}
              label="Show card"
              hint="Print, share, or scan from the screen"
              busy={busy === "INITIAL"}
              onClick={() => issue("INITIAL")}
              primary
            />
            <Action
              icon={FaRedo}
              label="Reset Parent ID"
              hint="Manual reset — current ID and QR stop working"
              danger
              busy={busy === "REISSUE"}
              onClick={() => issue("REISSUE")}
            />
          </>
        )}

        {data.accessState === "REVOKED" ? (
          <Action
            icon={FaUnlock}
            label="Restore access"
            busy={busy === "RESTORE_ACCESS"}
            onClick={() => act("RESTORE_ACCESS")}
          />
        ) : hasCard ? (
          <Action
            icon={FaBan}
            label="Revoke all access"
            hint="Signs them out of every child"
            danger
            busy={busy === "REVOKE_ACCESS"}
            onClick={() => {
              if (window.confirm(`Turn off ${guardianName}'s Parent App access?\n\nThey will be signed out and cannot sign in until access is restored.`)) act("REVOKE_ACCESS");
            }}
          />
        ) : null}
      </div>

      {card ? (
        <ParentCardDialog
          parentIdentifier={card.parentIdentifier}
          linkId={linkId}
          rotated={Boolean(card.rotated)}
          schoolName={card.schoolName || "Your school"}
          studentName={studentName || "your child"}
          guardianName={guardianName}
          onClose={async () => {
            setCard(null);
            await load();
            onChanged?.();
          }}
        />
      ) : null}

      <ContactEditor
        email={data.contact.email}
        phone={data.contact.phone}
        onSave={(contact) => act("SET_CONTACT", contact)}
        busy={busy === "SET_CONTACT"}
      />
    </section>
  );
}

function Chip({ on, onLabel, offLabel }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        on ? "bg-surface text-ink" : "bg-line text-muted"
      }`}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}

function Action({ icon: Icon, label, hint, onClick, busy, primary, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={hint}
      className={[
        "btn btn-ghost btn-sm flex items-center gap-2 transition-colors",
        primary
          ? "bg-brand text-white"
          : danger
            ? "border border-danger-line bg-surface text-danger"
            : "border border-line bg-surface text-ink",
      ].join(" ")}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {busy ? "Working…" : label}
    </button>
  );
}

/**
 * Optional contact details. Framed as an addition, never as a missing field —
 * §50 is explicit that empty phone/email must not look like an error.
 */
function ContactEditor({ email, phone, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: email || "", phone: phone || "" });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-2xs font-semibold text-brand"
      >
        {email || phone ? "Edit contact details" : "Add contact details (optional)"}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-control bg-surface p-2.5">
      <p className="text-2xs text-muted">
        Optional. Praavyo access works without either of these.
      </p>
      <input
        type="email"
        placeholder="Email (optional)"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
        className="input w-full"
      />
      <input
        type="tel"
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
        className="input w-full"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onSave(form);
            setOpen(false);
          }}
          className="btn btn-primary btn-sm flex-1"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost btn-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
