"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus as FaPlus, CircleCheck as FaCheckCircle, Ban as FaBan, Eye as FaEye, Copy as FaCopy, Send as FaPaperPlane } from "lucide-react";
import ParentAccessPanel from "./ParentAccessPanel";
import AssistedAccessDialog from "./AssistedAccessDialog";
import MessageGuardianDialog from "./MessageGuardianDialog";

/**
 * Manage one student's guardians (§19, §20, §27).
 *
 * Two things this UI has to make unmissable to a school administrator:
 *
 *  1. **An invitation code is shown ONCE.** It is stored hashed, so it cannot be
 *     retrieved later. The panel says so plainly and offers a copy button.
 *
 *  2. **Guardians of the same child can have different rights.** The permission
 *     checkboxes are visible on every row, not hidden behind an "advanced"
 *     disclosure, because the separated-family case (§20) is common and getting
 *     it wrong means a non-custodial parent can consent on the child's behalf.
 */

const ACCESS_LEVELS = [
  {
    value: "FULL",
    label: "Full access",
    hint: "Portfolio, notices, consent, registration, messaging.",
  },
  {
    value: "VIEW_AND_NOTICES",
    label: "View and notices",
    hint: "Sees everything and receives notices, but cannot consent or register.",
  },
  {
    value: "VIEW_ONLY",
    label: "View only",
    hint: "Portfolio only. No notices, no messaging.",
  },
];

const RELATIONSHIPS = [
  "MOTHER",
  "FATHER",
  "GRANDPARENT",
  "LEGAL_GUARDIAN",
  "UNCLE",
  "AUNT",
  "SIBLING",
  "OTHER",
];

const PERMISSION_LABELS = {
  canViewPortfolio: "View portfolio",
  canReceiveNotices: "Receive notices",
  canRegisterEvents: "Register for events",
  canGiveConsent: "Give permission",
  canMessageSchool: "Message the school",
};

export default function GuardianManager({
  student,
  // Parent details captured at student registration but never turned into a
  // guardian account. Passed in by the roster so the panel can offer a
  // one-click conversion instead of making staff retype what is already there.
  registrationParent = null,
  // Set when the roster's row-level "add guardian" button was used, so the
  // form opens straight away instead of making staff find it a second time.
  openAddForm = false,
  onAddFormOpened,
  onChanged,
}) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [inviting, setInviting] = useState(false);
  const [issuedCode, setIssuedCode] = useState(null);
  const [assisting, setAssisting] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [messagingGuardian, setMessagingGuardian] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/school/guardians?studentId=${encodeURIComponent(student.id)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not load guardians");
      setState({ loading: false, error: "", data: json.data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [student.id]);

  // `load` defers its first setState past an await, so calling it here does not
  // trigger the cascading-render that a synchronous setState in an effect would.
  useEffect(() => {
    load();
  }, [load]);

  // Honour the roster's request to open the add form, then clear the flag so
  // collapsing and reopening the row does not reopen the form unexpectedly.
  useEffect(() => {
    if (!openAddForm) return;
    setInviting(true);
    onAddFormOpened?.();
  }, [openAddForm, onAddFormOpened]);

  // Keep the roster's coverage column in step with anything done in here.
  const refresh = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  const updateGuardian = async (payload) => {
    await fetch("/api/school/guardians", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refresh();
  };

  if (state.loading) {
    return <div className="h-64 animate-pulse rounded-card bg-surface-2" />;
  }

  if (state.error) {
    return (
      <div className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
        {state.error}
      </div>
    );
  }

  const { guardians, pendingInvitations } = state.data;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">
            {student.name}
          </h2>
          <p className="text-sm text-muted">
            {[student.grade, (state.data.student?.iemisNumber || student.iemisNumber) && `IEMIS ${state.data.student?.iemisNumber || student.iemisNumber}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviting((value) => !value)}
          className="btn btn-primary flex items-center gap-2"
        >
          <FaPlus aria-hidden="true" className="h-3.5 w-3.5" />
          {guardians.length === 0 ? "Add guardian" : "Add another guardian"}
        </button>
      </header>

      {issuedCode ? (
        <div className="rounded-card border border-success-line bg-success-soft p-4">
          <p className="text-sm font-semibold text-success">
            Invitation code — copy it now
          </p>
          <p className="mt-1 text-xs text-success">
            This code is stored securely and cannot be shown again. Send it to
            the guardian; if it is lost, issue a new invitation.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-card bg-surface px-4 py-3 font-mono text-xl text-ink">
              {issuedCode}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(issuedCode)}
              aria-label="Copy code"
              className="btn-icon btn-primary flex items-center justify-center"
            >
              <FaCopy aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Registration captured a parent but nobody was ever connected. Offer
          the conversion inline rather than making staff retype it. */}
      {registrationParent && guardians.length === 0 ? (
        <section className="rounded-card border border-warning-line bg-warning-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            From the student record
          </p>
          <p className="mt-1 text-base font-semibold text-ink">
            {registrationParent.name}
          </p>
          <p className="text-sm text-warning">
            {[
              relationshipLabel(registrationParent.relationshipType),
              registrationParent.phone,
              registrationParent.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-warning">
            These details were entered when {student.name.split(" ")[0]} was
            registered, but no guardian account exists yet, so this family
            cannot use the Parent App.
          </p>
          <button
            type="button"
            onClick={() => {
              setPrefill(registrationParent);
              setInviting(true);
            }}
            className="btn btn-primary mt-3 w-full"
          >
            Add {registrationParent.name} as guardian
          </button>
        </section>
      ) : null}

      {inviting ? (
        <InviteForm
          studentId={student.id}
          prefill={prefill}
          isFirstGuardian={guardians.length === 0}
          onCancel={() => {
            setInviting(false);
            setPrefill(null);
          }}
          onCreated={() => {
            setInviting(false);
            refresh();
          }}
          onCardIssued={(linkId) => {
            setInviting(false);
            // The card renders from the guardian's stored Parent ID, so this
            // page can be reopened later from the access panel if the tab is
            // closed or the print fails.
            window.open(
              `/school/guardians/card?link=${encodeURIComponent(linkId)}`,
              "_blank",
              "noopener"
            );
            refresh();
          }}
          onLegacyCode={(code) => {
            setIssuedCode(code);
            setInviting(false);
            refresh();
          }}
        />
      ) : null}

      {messagingGuardian ? (
        <MessageGuardianDialog
          linkId={messagingGuardian.linkId}
          guardianName={messagingGuardian.guardianName}
          studentName={student.name}
          canReply={messagingGuardian.canReply}
          onClose={() => setMessagingGuardian(null)}
        />
      ) : null}

      {assisting ? (
        <AssistedAccessDialog
          studentId={student.id}
          studentName={student.name}
          linkId={assisting.linkId}
          guardianName={assisting.guardianName}
          onClose={() => setAssisting(null)}
        />
      ) : null}

      {pendingInvitations.length > 0 ? (
        <section className="rounded-card border border-warning-line bg-warning-soft p-4">
          <h3 className="font-semibold uppercase tracking-wide text-warning">
            Waiting to be accepted
          </h3>
          <ul className="mt-2 space-y-2">
            {pendingInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-ink">
                  {invitation.guardianName || invitation.email || invitation.phone}
                  <span className="ml-2 text-xs text-muted">
                    {relationshipLabel(invitation.relationshipType)}
                  </span>
                </span>
                <span className="font-mono text-xs text-muted">
                  …{invitation.codeHint}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {guardians.length === 0 ? (
        <div className="card border-dashed px-6 py-7 text-center">
          <p className="font-semibold text-ink">
            No guardians connected yet
          </p>
          <p className="mt-1 text-sm text-muted">
            Invite a parent so they can follow {student.name}&apos;s journey.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {guardians.map((guardian) => (
            <li
              key={guardian.id}
              className={[
                "card p-4",
                guardian.status === "REVOKED"
                  ? "border-line bg-surface-2 opacity-70"
                  : "border-line bg-surface",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {guardian.name}
                    {guardian.isPrimaryGuardian ? (
                      <span className="badge badge-brand ml-2 font-semibold">
                        Primary
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {relationshipLabel(guardian.relationshipType)}
                    {guardian.email ? ` · ${guardian.email}` : ""}
                    {guardian.phone ? ` · ${guardian.phone}` : ""}
                  </p>
                </div>

                <span
                  className={[
                    "badge badge-neutral flex shrink-0 items-center gap-1.5",
                    guardian.status === "ACTIVE"
                      ? "bg-success-soft text-success"
                      : "bg-line text-ink",
                  ].join(" ")}
                >
                  {guardian.status === "ACTIVE" ? (
                    <FaCheckCircle aria-hidden="true" className="h-3 w-3" />
                  ) : (
                    <FaBan aria-hidden="true" className="h-3 w-3" />
                  )}
                  {guardian.status}
                </span>
              </div>

              {/* Per-guardian permissions, always visible (§20). */}
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={guardian.status !== "ACTIVE"}
                    onClick={() =>
                      updateGuardian({
                        linkId: guardian.id,
                        [key]: !guardian.permissions[key],
                      })
                    }
                    aria-pressed={guardian.permissions[key]}
                    className={[
                      "btn btn-secondary btn-sm font-semibold transition-colors",
                      guardian.permissions[key]
                        ? "border-success-line bg-success-soft text-success"
                        : "border-line bg-surface text-muted",
                    ].join(" ")}
                  >
                    {guardian.permissions[key] ? "✓ " : "○ "}
                    {label}
                  </button>
                ))}
              </div>

              {/* Parent Access: card, PIN, reachability (§4, §58). */}
              {guardian.status === "ACTIVE" ? (
                <div className="mt-3">
                  <ParentAccessPanel
                    linkId={guardian.id}
                    guardianName={guardian.name}
                    studentName={student.name}
                    onChanged={refresh}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {/* Message THIS guardian only. Messaging the student would
                    reach every guardian, which is exactly wrong when the
                    school needs a private word with one of them (§19). */}
                {guardian.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setMessagingGuardian({
                        linkId: guardian.id,
                        guardianName: guardian.name,
                        canReply: guardian.permissions.canMessageSchool,
                      })
                    }
                    className="btn btn-ghost flex items-center gap-2 font-semibold"
                  >
                    <FaPaperPlane aria-hidden="true" className="h-3.5 w-3.5" />
                    Message
                  </button>
                ) : null}

                {guardian.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAssisting({
                        linkId: guardian.id,
                        guardianName: guardian.name,
                      })
                    }
                    className="btn btn-ghost flex items-center gap-2 font-semibold"
                  >
                    <FaEye aria-hidden="true" className="h-3.5 w-3.5" />
                    Assisted view
                  </button>
                ) : null}

                {guardian.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateGuardian({ linkId: guardian.id, action: "REVOKE" })
                    }
                    // Removes THIS child only. The guardian keeps any other
                    // children they are linked to (§44).
                    title="Removes this child only"
                    className="btn btn-ghost font-semibold"
                  >
                    Remove from {student.name.split(" ")[0]}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      updateGuardian({ linkId: guardian.id, action: "REACTIVATE" })
                    }
                    className="btn btn-ghost font-semibold"
                  >
                    Restore access
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Add a guardian.
 *
 * Three modes, and the DEFAULT is the one that works for everyone:
 *
 *  - **NEW** — create the guardian and print a Parent Access Card. Phone and
 *    email are optional and clearly labelled as such (§3, §50): a guardian with
 *    neither is completely normal and the form must not imply otherwise.
 *  - **EXISTING** — connect a guardian who already holds a Parent ID to this
 *    child too, instead of creating a duplicate account (§17).
 *  - **CODE** — the legacy invitation-code flow, kept available but no longer
 *    the default (§57).
 */
function InviteForm({
  studentId,
  prefill,
  isFirstGuardian = true,
  onCancel,
  onCreated,
  onCardIssued,
  onLegacyCode,
}) {
  const [mode, setMode] = useState("NEW");
  const [form, setForm] = useState({
    // Seeded from the student record when converting registration details,
    // so staff confirm rather than retype.
    guardianName: prefill?.name || "",
    email: prefill?.email || "",
    phone: prefill?.phone || "",
    relationshipType: RELATIONSHIPS.includes(prefill?.relationshipType)
      ? prefill.relationshipType
      : "MOTHER",
    // A second guardian defaults to view + notices, not full rights, and never
    // to primary — those are decisions the school makes deliberately (§20).
    accessLevel: prefill || isFirstGuardian ? "FULL" : "VIEW_AND_NOTICES",
    isPrimaryGuardian: Boolean(prefill) || isFirstGuardian,
    isHousehold: false,
    householdName: "",
    existingParentIdentifier: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (key) => (event) =>
    setForm((prev) => ({
      ...prev,
      [key]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        studentId,
        ...form,
        mode: mode === "CODE" ? "INVITATION" : "DIRECT",
      };
      if (mode !== "EXISTING") delete payload.existingParentIdentifier;

      const res = await fetch("/api/school/guardians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not add guardian");

      if (mode === "CODE") {
        onLegacyCode(json.data.code);
      } else if (!json.data.alreadyActivated) {
        onCardIssued(json.data.linkId);
      } else {
        // An already-connected guardian gaining a second child keeps the Parent
        // ID they are signing in with — no card needs printing.
        onCreated();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="card space-y-4 p-4"
    >
      <div className="flex flex-wrap gap-2">
        {[
          { key: "NEW", label: "New guardian" },
          { key: "EXISTING", label: "Existing Parent ID" },
          { key: "CODE", label: "Use invitation code" },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            aria-pressed={mode === option.key}
            className={[
              "btn btn-ghost btn-sm font-semibold transition-colors",
              mode === option.key
                ? "bg-brand text-white"
                : "bg-surface-2 text-muted",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "EXISTING" ? (
        <div>
          <Field
            label="Parent ID"
            value={form.existingParentIdentifier}
            onChange={update("existingParentIdentifier")}
            placeholder="PRV-P-XXXXXX"
            required
          />
          <p className="mt-1 text-xs text-muted">
            Ask the guardian to read the Parent ID from their card. They keep
            the same ID — no new card is needed.
          </p>
        </div>
      ) : null}

      {mode === "CODE" ? (
        <p className="badge badge-warning text-xs">
          Legacy flow: the guardian must register themselves and type an
          8-character code. Prefer &quot;New guardian&quot;, which prints a card
          and needs no email or phone.
        </p>
      ) : null}

      <div className={mode === "EXISTING" ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
        <Field
          label="Guardian name"
          value={form.guardianName}
          onChange={update("guardianName")}
          required={mode !== "EXISTING"}
        />
        <div>
          <label className="block text-sm font-semibold text-ink">
            Relationship
          </label>
          <select
            value={form.relationshipType}
            onChange={update("relationshipType")}
            className="input mt-1.5 w-full"
          >
            {RELATIONSHIPS.map((value) => (
              <option key={value} value={value}>
                {relationshipLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Email (optional)"
          type="email"
          value={form.email}
          onChange={update("email")}
        />
        <Field
          label="Phone (optional)"
          type="tel"
          value={form.phone}
          onChange={update("phone")}
        />
      </div>

      {mode === "NEW" ? (
        <p className="badge badge-brand text-xs">
          A phone number and email are <strong>not required</strong>. The
          guardian signs in by scanning their printed card, or by typing the
          Parent ID on it.
        </p>
      ) : null}

      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          What may this guardian do?
        </legend>
        <div className="mt-2 space-y-2">
          {ACCESS_LEVELS.map((level) => (
            <label
              key={level.value}
              className="btn btn-secondary flex cursor-pointer items-start gap-3"
            >
              <input
                type="radio"
                name="accessLevel"
                value={level.value}
                checked={form.accessLevel === level.value}
                onChange={update("accessLevel")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  {level.label}
                </span>
                <span className="block text-xs text-muted">
                  {level.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.isPrimaryGuardian}
          onChange={update("isPrimaryGuardian")}
        />
        Primary guardian
      </label>

      {/* Household mode (§20). Consent is withheld by default because a shared
          account cannot evidence WHICH guardian decided. */}
      {mode === "NEW" ? (
        <div className="card p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isHousehold}
              onChange={update("isHousehold")}
            />
            This is a shared family account
          </label>
          {form.isHousehold ? (
            <>
              <input
                type="text"
                placeholder="Family name, e.g. Sharma Family"
                value={form.householdName}
                onChange={update("householdName")}
                className="input mt-2 w-full"
              />
              <p className="mt-2 text-xs text-muted">
                Actions will be recorded as the family, not as one person.
                Permission decisions stay switched off unless you enable them
                above.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary"
        >
          {submitting
            ? "Working…"
            : mode === "CODE"
              ? "Create invitation code"
              : mode === "EXISTING"
                ? "Connect guardian"
                : "Add guardian & print card"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        {...props}
        className="input mt-1.5 w-full"
      />
    </div>
  );
}

function relationshipLabel(value) {
  return String(value || "Guardian")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
