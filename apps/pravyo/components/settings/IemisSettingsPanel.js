"use client";

import { useState } from "react";
import { BadgeCheck, Pencil, TriangleAlert } from "lucide-react";

/**
 * The school's IEMIS registration number, on its own in Settings: shown
 * clearly, corrected with Edit → Save, never left empty. Saves straight away
 * through /api/school/settings/iemis (compulsory, unique across schools), so
 * it does not wait for the rest of the settings form.
 */
export default function IemisSettingsPanel({ value = "", onSaved }) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const startEdit = () => {
    setDraft(value);
    setMessage({ type: "", text: "" });
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setMessage({ type: "", text: "" });
    setEditing(false);
  };

  const save = async (event) => {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (!next) {
      setMessage({ type: "error", text: "The IEMIS number cannot be empty." });
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const response = await fetch("/api/school/settings/iemis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iemisNumber: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "The IEMIS number could not be saved.");
      const saved = payload.data?.iemisNumber || next;
      onSaved?.(saved);
      setDraft(saved);
      setEditing(false);
      setMessage({ type: "success", text: "IEMIS number saved. Report cards now show it." });
    } catch (reason) {
      setMessage({ type: "error", text: reason.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`rounded-card border p-4 sm:p-5 ${value ? "border-line-strong bg-surface" : "border-warning-line bg-warning-soft"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
            {value ? <BadgeCheck aria-hidden size={20} /> : <TriangleAlert aria-hidden size={20} />}
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-ink">IEMIS Registration</h2>
            <p className="mt-0.5 text-sm text-muted">
              The registration number the government issued to your school. It is printed on every report card.
            </p>
          </div>
        </div>
        {value && !editing && (
          <button type="button" onClick={startEdit} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Pencil size={14} aria-hidden /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="label">School IEMIS registration number <span className="text-danger">*</span></span>
            <input
              autoFocus
              required
              maxLength={50}
              value={draft}
              onChange={(event) => setDraft(event.target.value.toUpperCase())}
              placeholder="IEMIS number issued by the government"
              autoComplete="off"
              className="input w-full font-mono"
            />
          </label>
          <div className="flex gap-2">
            {value && (
              <button type="button" onClick={cancel} disabled={saving} className="btn btn-secondary">Cancel</button>
            )}
            <button type="submit" disabled={saving || !draft.trim()} className="btn btn-primary">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 break-all font-mono text-2xl font-semibold text-ink">{value}</p>
      )}

      {!value && !message.text && (
        <p className="mt-2 text-sm font-medium text-warning">Not entered yet. Report cards show &quot;—&quot; until you save it.</p>
      )}
      {message.text && (
        <p className={`mt-2 text-sm ${message.type === "error" ? "text-danger" : "text-success"}`}>{message.text}</p>
      )}
    </section>
  );
}
