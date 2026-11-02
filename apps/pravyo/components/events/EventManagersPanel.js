"use client";

import { useState } from "react";
import { UserPlus, UsersRound, X } from "lucide-react";

/**
 * Who runs a school event. The school adds or removes teachers here at any
 * point in the event's life — each change saves immediately — and every
 * teacher listed gets Manage Event on their own dashboard. Teachers see the
 * same list read-only, so they know who they are running it with.
 */
export default function EventManagersPanel({ event, teachers = [], canEdit, onChanged }) {
  const [managers, setManagers] = useState(() =>
    (event.assignedMentors || []).map((teacher) => ({
      _id: String(teacher?._id || teacher),
      name: teacher?.name || "Teacher",
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const assignedIds = new Set(managers.map((teacher) => teacher._id));
  const available = teachers.filter((teacher) => !assignedIds.has(String(teacher._id)));

  const save = async (teacherIds) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${event._id}/managers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherIds }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Could not update the teachers.");
      setManagers(payload.data.managers);
      onChanged?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (teacherId) => {
    if (teacherId) save([...assignedIds, teacherId]);
  };

  const remove = (teacher) => {
    if (!window.confirm(`Remove ${teacher.name} from managing this event?\n\nThey lose the Manage Event button straight away. You can add them back at any time.`)) return;
    save([...assignedIds].filter((id) => id !== teacher._id));
  };

  return (
    <section className="card mb-5 p-4">
      <div className="flex items-center gap-2">
        <UsersRound aria-hidden className="text-brand" />
        <h2 className="font-semibold text-ink">Teachers managing this event</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        {canEdit
          ? "These teachers can run rounds, participants and results from their dashboard. Add or remove them at any time."
          : "Your school gave this event to these teachers."}
      </p>

      {managers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No teacher yet. Only the school admin manages it.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {managers.map((teacher) => (
            <li key={teacher._id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm text-ink">
              {teacher.name}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => remove(teacher)}
                  disabled={busy}
                  aria-label={`Remove ${teacher.name}`}
                  className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <X aria-hidden size={14} />
                </button>
              ) : (
                <span className="pr-2" />
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <label className="mt-3 flex max-w-sm items-center gap-2">
          <UserPlus aria-hidden className="shrink-0 text-muted" size={18} />
          <span className="sr-only">Add a teacher</span>
          <select
            className="input"
            value=""
            disabled={busy || available.length === 0}
            onChange={(event) => add(event.target.value)}
          >
            <option value="">
              {busy ? "Saving…" : available.length ? "Add a teacher…" : "All active teachers are added"}
            </option>
            {available.map((teacher) => (
              <option key={teacher._id} value={String(teacher._id)}>
                {teacher.name}{teacher.designation ? ` · ${teacher.designation}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
