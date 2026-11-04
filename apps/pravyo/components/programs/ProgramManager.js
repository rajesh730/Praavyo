"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import AppDate from "@/components/common/AppDate";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import ProgramCountdown from "./ProgramCountdown";

/**
 * Performance programs (no competition): Dashain Program → Group dance on a
 * Deusi song → students. Used by the school (full control) and by assigned
 * teachers (`mode="teacher"`, no lock/publish/assign/delete).
 */

const STAGE = {
  OPEN: { label: "Taking names", tone: "badge-brand" },
  LOCKED: { label: "List locked", tone: "badge-warning" },
  PUBLISHED: { label: "Certificates published", tone: "badge-success" },
};

const STATUS = {
  REGISTERED: { label: "Registered", tone: "badge-neutral" },
  PERFORMED: { label: "Performed", tone: "badge-success" },
  NOT_PERFORMED: { label: "Did not perform", tone: "badge-danger" },
};

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || "Something went wrong. Please try again.");
  return payload.data;
}

export default function ProgramManager({ mode = "school", teachers = [] }) {
  const isSchool = mode === "school";
  const [programs, setPrograms] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState({ name: "list" });
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let live = true;
    api(`/api/programs${year ? `?year=${encodeURIComponent(year)}` : ""}`)
      .then((data) => {
        if (!live) return;
        setError("");
        setPrograms(data.programs || []);
        setYears(data.years || []);
      })
      .catch((reason) => live && setError(reason.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [year, reloadKey]);

  if (view.name === "create") {
    return (
      <ProgramForm
        teachers={teachers}
        onCancel={() => setView({ name: "list" })}
        onSaved={(program) => {
          load();
          setView({ name: "detail", id: program._id });
        }}
      />
    );
  }

  if (view.name === "detail") {
    return (
      <ProgramDetail
        id={view.id}
        teachers={teachers}
        isSchoolMode={isSchool}
        onBack={() => {
          load();
          setView({ name: "list" });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Performance programs</h2>
          <p className="text-sm text-muted">
            {isSchool
              ? "Programs without competition, like Dashain or Tihar. Students who perform get a participation certificate."
              : "Programs your school gave you to run."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {years.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Academic year</span>
              <select className="input py-1.5" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          )}
          {isSchool && (
            <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={() => setView({ name: "create" })}>
              <Plus aria-hidden size={16} /> New program
            </button>
          )}
        </div>
      </div>

      {error && <AlertBanner type="error" message={error} />}

      {loading ? (
        <LoadingState title="Loading programs" message="Fetching your school programs." />
      ) : programs.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-muted">
          {isSchool
            ? "No programs yet. Create one, for example “Dashain Program”."
            : "No programs yet. When your school assigns you a program, it shows here."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {programs.map((program) => (
            <button
              key={program._id}
              type="button"
              onClick={() => setView({ name: "detail", id: program._id })}
              className="card p-4 text-left transition-shadow hover:shadow-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${STAGE[program.stage].tone} text-xs`}>{STAGE[program.stage].label}</span>
                <ProgramCountdown date={program.date} />
                {program.academicYear && <span className="badge badge-neutral text-xs">AY {program.academicYear}</span>}
              </div>
              <h3 className="mt-2 text-base font-semibold text-ink">{program.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden size={14} /><AppDate value={program.date} mode="dateTime" /></span>
                {program.venue && <span className="inline-flex items-center gap-1"><MapPin aria-hidden size={14} />{program.venue}</span>}
              </p>
              <p className="mt-2 text-sm text-ink">
                {program.performances.length} performance{program.performances.length === 1 ? "" : "s"} · {program.performerCount} student{program.performerCount === 1 ? "" : "s"}
                {program.stage !== "OPEN" && ` · ${program.performedCount} performed`}
              </p>
              {program.assignedTeachers.length > 0 && (
                <p className="mt-1 text-xs text-muted">In charge: {program.assignedTeachers.map((t) => t.name).join(", ")}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- create / edit program details ---------- */

function ProgramForm({ program, teachers = [], onCancel, onSaved }) {
  const editing = Boolean(program);
  const [form, setForm] = useState({
    title: program?.title || "",
    date: toLocalInput(program?.date),
    venue: program?.venue || "",
    description: program?.description || "",
    teacherIds: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const date = form.date ? new Date(form.date).toISOString() : "";
      const data = editing
        ? await api(`/api/programs/${program._id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "update", title: form.title, date, venue: form.venue, description: form.description }),
          })
        : await api("/api/programs", {
            method: "POST",
            body: JSON.stringify({ ...form, date }),
          });
      onSaved(data.program);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleTeacher = (id) =>
    setForm((prev) => ({
      ...prev,
      teacherIds: prev.teacherIds.includes(id) ? prev.teacherIds.filter((x) => x !== id) : [...prev.teacherIds, id],
    }));

  return (
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{editing ? "Edit program" : "New performance program"}</h2>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancel</button>
      </div>
      {error && <AlertBanner type="error" message={error} />}
      <label className="block">
        <span className="text-sm font-medium text-ink">Program name</span>
        <input className="input mt-1" value={form.title} onChange={set("title")} placeholder="e.g. Dashain Program" required maxLength={160} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Date and time</span>
          <input type="datetime-local" className="input mt-1" value={form.date} onChange={set("date")} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Venue (optional)</span>
          <input className="input mt-1" value={form.venue} onChange={set("venue")} placeholder="e.g. School hall" maxLength={160} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-ink">Description (optional)</span>
        <textarea className="input mt-1 min-h-20" value={form.description} onChange={set("description")} maxLength={2000} />
      </label>
      {!editing && teachers.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-ink">Teachers in charge (optional)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {teachers.map((teacher) => {
              const id = String(teacher._id);
              const on = form.teacherIds.includes(id);
              return (
                <button key={id} type="button" onClick={() => toggleTeacher(id)} className={`btn btn-sm ${on ? "btn-primary" : "btn-secondary"}`}>
                  {on && <Check aria-hidden size={14} className="mr-1" />}{teacher.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : editing ? "Save changes" : "Create program"}
      </button>
    </form>
  );
}

/* ---------- one program ---------- */

function ProgramDetail({ id, teachers, isSchoolMode, onBack }) {
  const [program, setProgram] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newPerformance, setNewPerformance] = useState({ title: "", performanceType: "SOLO" });

  useEffect(() => {
    api(`/api/programs/${id}`)
      .then((data) => setProgram(data.program))
      .catch((reason) => setError(reason.message));
  }, [id]);

  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/programs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setProgram(data.program);
      return true;
    } catch (reason) {
      setError(reason.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${program.title}”?\n\nAll its performances, names and any published certificates are removed. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/programs/${id}`, { method: "DELETE" });
      onBack();
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  };

  if (!program) {
    return error ? (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="btn btn-secondary btn-sm">Back</button>
        <AlertBanner type="error" message={error} />
      </div>
    ) : (
      <LoadingState title="Opening program" message="Loading performances and students." />
    );
  }

  if (editing) {
    return (
      <ProgramForm
        program={program}
        onCancel={() => setEditing(false)}
        onSaved={(saved) => {
          setProgram(saved);
          setEditing(false);
        }}
      />
    );
  }

  const school = program.isSchool && isSchoolMode;
  const open = program.stage === "OPEN";
  const locked = program.stage === "LOCKED";
  const published = program.stage === "PUBLISHED";

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm inline-flex items-center gap-1">
        <ArrowLeft aria-hidden size={16} /> All programs
      </button>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${STAGE[program.stage].tone} text-xs`}>{STAGE[program.stage].label}</span>
              <ProgramCountdown date={program.date} />
              {program.academicYear && <span className="badge badge-neutral text-xs">AY {program.academicYear}</span>}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-ink">{program.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden size={14} /><AppDate value={program.date} mode="dateTime" /></span>
              {program.venue && <span className="inline-flex items-center gap-1"><MapPin aria-hidden size={14} />{program.venue}</span>}
            </p>
            {program.description && <p className="mt-2 whitespace-pre-line text-sm text-ink">{program.description}</p>}
          </div>
          {!published && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
              <Pencil aria-hidden size={14} /> Edit details
            </button>
          )}
        </div>

        {/* the three steps, in order */}
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <Step n={1} done={!open} active={open} text="Add performances and names" />
          <Step n={2} done={published} active={locked} text="Lock the list, tick who performed" />
          <Step n={3} done={published} active={false} text="Publish certificates" />
        </ol>

        {school && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {open && (
              <button type="button" disabled={busy} className="btn btn-primary btn-sm inline-flex items-center gap-1"
                onClick={() => act({ action: "lock" }, "Lock the participant list?\n\nNobody can add or remove names after this. You can unlock it later if needed.")}>
                <Lock aria-hidden size={14} /> Lock participant list
              </button>
            )}
            {locked && (
              <>
                <button type="button" disabled={busy} className="btn btn-primary btn-sm inline-flex items-center gap-1"
                  onClick={() => act({ action: "publish" }, "Publish certificates?\n\nEvery student ticked as Performed gets a certificate for their performance. They and their parents can see it straight away.")}>
                  <BadgeCheck aria-hidden size={14} /> Publish certificates
                </button>
                <button type="button" disabled={busy} className="btn btn-secondary btn-sm inline-flex items-center gap-1" onClick={() => act({ action: "unlock" })}>
                  <Unlock aria-hidden size={14} /> Unlock list
                </button>
              </>
            )}
            {published && (
              <button type="button" disabled={busy} className="btn btn-soft-danger btn-sm"
                onClick={() => act({ action: "unpublish" }, "Unpublish certificates?\n\nAll certificates of this program are deleted. Students and parents will no longer see them. You can publish again after making changes.")}>
                Unpublish certificates
              </button>
            )}
            <button type="button" disabled={busy} onClick={remove} className="btn btn-ghost btn-sm ml-auto inline-flex items-center gap-1 text-danger">
              <Trash2 aria-hidden size={14} /> Delete program
            </button>
          </div>
        )}
        {!school && locked && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">The list is locked. Tick who performed; the school publishes the certificates.</p>
        )}
      </section>

      {error && <AlertBanner type="error" message={error} />}

      {published && <PublishedCertificates programId={program._id} />}

      {school && (
        <TeachersPanel program={program} teachers={teachers} busy={busy} onSave={(teacherIds) => act({ action: "setTeachers", teacherIds })} />
      )}
      {!school && program.assignedTeachers.length > 0 && (
        <p className="text-sm text-muted">In charge: {program.assignedTeachers.map((t) => t.name).join(", ")}</p>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold text-ink">Performances</h3>
        {program.performances.length === 0 && (
          <p className="card p-4 text-sm text-muted">No performances yet. Add one below, for example “Group dance on a Deusi song”.</p>
        )}
        {program.performances.map((performance) => (
          <PerformanceCard
            key={performance._id}
            program={program}
            performance={performance}
            busy={busy}
            act={act}
          />
        ))}

        {open && (
          <form
            className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "addPerformance", ...newPerformance })) {
                setNewPerformance({ title: "", performanceType: newPerformance.performanceType });
              }
            }}
          >
            <label className="block flex-1">
              <span className="text-sm font-medium text-ink">New performance</span>
              <input className="input mt-1" value={newPerformance.title} required maxLength={160}
                onChange={(e) => setNewPerformance((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Group dance on a Deusi song" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Type</span>
              <select className="input mt-1" value={newPerformance.performanceType}
                onChange={(e) => setNewPerformance((p) => ({ ...p, performanceType: e.target.value }))}>
                <option value="SOLO">Solo</option>
                <option value="GROUP">Group</option>
              </select>
            </label>
            <button type="submit" disabled={busy} className="btn btn-primary inline-flex items-center justify-center gap-1">
              <Plus aria-hidden size={16} /> Add
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function Step({ n, done, active, text }) {
  return (
    <li className={`flex items-center gap-2 rounded-control border px-3 py-2 ${active ? "border-brand bg-brand-soft text-brand-strong" : done ? "border-success-line bg-success-soft text-success" : "border-line text-muted"}`}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold">
        {done ? <Check aria-hidden size={13} /> : n}
      </span>
      {text}
    </li>
  );
}

function TeachersPanel({ program, teachers, busy, onSave }) {
  const assigned = new Set(program.assignedTeachers.map((t) => t._id));
  const available = teachers.filter((t) => !assigned.has(String(t._id)));
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 font-semibold text-ink"><Users aria-hidden size={18} className="text-brand" /> Teachers in charge</h3>
      <p className="mt-1 text-sm text-muted">They run this program from their dashboard: performances, names and ticking who performed.</p>
      {program.assignedTeachers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No teacher yet. Only the school manages it.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {program.assignedTeachers.map((teacher) => (
            <li key={teacher._id} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-sm text-ink">
              {teacher.name}
              <button type="button" disabled={busy} aria-label={`Remove ${teacher.name}`}
                onClick={() => onSave([...assigned].filter((x) => x !== teacher._id))}
                className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger">
                <X aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-3 flex max-w-sm items-center gap-2">
        <UserPlus aria-hidden className="shrink-0 text-muted" size={18} />
        <span className="sr-only">Add a teacher</span>
        <select className="input" value="" disabled={busy || available.length === 0} onChange={(e) => e.target.value && onSave([...assigned, e.target.value])}>
          <option value="">{available.length ? "Add a teacher…" : "All active teachers are added"}</option>
          {available.map((teacher) => (
            <option key={teacher._id} value={String(teacher._id)}>
              {teacher.name}{teacher.designation ? ` · ${teacher.designation}` : ""}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function PerformanceCard({ program, performance, busy, act }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(performance.title);
  const [type, setType] = useState(performance.performanceType);
  const [picking, setPicking] = useState(false);
  const open = program.stage === "OPEN";
  const locked = program.stage === "LOCKED";
  const published = program.stage === "PUBLISHED";

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {renaming ? (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ action: "updatePerformance", performanceId: performance._id, title, performanceType: type })) setRenaming(false);
            }}
          >
            <input className="input flex-1 py-1.5" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
            <select className="input w-auto py-1.5" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="SOLO">Solo</option>
              <option value="GROUP">Group</option>
            </select>
            <button type="submit" disabled={busy} className="btn btn-primary btn-sm">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <h4 className="min-w-0 flex-1 font-semibold text-ink">{performance.title}</h4>
            <span className="badge badge-neutral text-xs">{performance.performanceType === "GROUP" ? "Group" : "Solo"}</span>
            <span className="text-xs text-muted">{performance.performers.length} student{performance.performers.length === 1 ? "" : "s"}</span>
            {!published && (
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Edit performance" onClick={() => setRenaming(true)}>
                <Pencil aria-hidden size={14} />
              </button>
            )}
            {open && (
              <button type="button" disabled={busy} className="btn btn-ghost btn-sm text-danger" aria-label="Delete performance"
                onClick={() => act({ action: "removePerformance", performanceId: performance._id }, `Delete “${performance.title}” and its ${performance.performers.length} name(s)?`)}>
                <Trash2 aria-hidden size={14} />
              </button>
            )}
          </>
        )}
      </header>

      {performance.performers.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">No students yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {performance.performers.map((performer) => (
            <li key={performer.studentId} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{performer.name}</span>
                <span className="block truncate text-xs text-muted">
                  {[performer.grade, performer.section && `Sec ${performer.section}`, performer.rollNumber && `Roll ${performer.rollNumber}`].filter(Boolean).join(" · ")}
                  {performer.addedByRole === "STUDENT" ? " · joined by student" : ""}
                </span>
              </span>
              <span className={`badge ${STATUS[performer.status].tone} text-xs`}>{STATUS[performer.status].label}</span>
              {locked && (
                <>
                  <button type="button" disabled={busy || performer.status === "PERFORMED"} className="btn btn-soft btn-sm inline-flex items-center gap-1"
                    onClick={() => act({ action: "markPerformer", performanceId: performance._id, studentId: performer.studentId, status: "PERFORMED" })}>
                    <Check aria-hidden size={14} /> Performed
                  </button>
                  <button type="button" disabled={busy || performer.status === "NOT_PERFORMED"} className="btn btn-ghost btn-sm"
                    onClick={() => act({ action: "markPerformer", performanceId: performance._id, studentId: performer.studentId, status: "NOT_PERFORMED" })}>
                    Absent
                  </button>
                </>
              )}
              {open && (
                <button type="button" disabled={busy} className="btn btn-ghost btn-sm" aria-label={`Remove ${performer.name}`}
                  onClick={() => act({ action: "removePerformer", performanceId: performance._id, studentId: performer.studentId })}>
                  <X aria-hidden size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {locked && performance.performers.length > 1 && (
        <div className="border-t border-line px-4 py-2.5">
          <button type="button" disabled={busy} className="btn btn-secondary btn-sm inline-flex items-center gap-1"
            onClick={() => act({ action: "markPerformer", performanceId: performance._id, status: "PERFORMED" })}>
            <Check aria-hidden size={14} /> Mark everyone performed
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-line px-4 py-2.5">
          {picking ? (
            <StudentPicker
              programId={program._id}
              exclude={new Set(performance.performers.map((p) => p.studentId))}
              busy={busy}
              onAdd={(studentIds) => act({ action: "addPerformers", performanceId: performance._id, studentIds })}
              onClose={() => setPicking(false)}
            />
          ) : (
            <button type="button" className="btn btn-soft btn-sm inline-flex items-center gap-1" onClick={() => setPicking(true)}>
              <UserPlus aria-hidden size={14} /> Add students
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function StudentPicker({ programId, exclude, busy, onAdd, onClose }) {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (grade) params.set("grade", grade);
      api(`/api/programs/${programId}/students?${params}`)
        .then((data) => {
          setStudents(data.students || []);
          setGrades(data.grades || []);
        })
        .catch((reason) => setError(reason.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [programId, q, grade]);

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const visible = students.filter((s) => !exclude.has(s._id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <span className="sr-only">Search students</span>
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" autoFocus />
        </label>
        <select className="input w-auto" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
          <option value="">All grades</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {visible.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted">No students found.</li>
        ) : (
          visible.map((student) => (
            <li key={student._id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" checked={picked.includes(student._id)} onChange={() => toggle(student._id)} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{student.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {[student.grade, student.section && `Sec ${student.section}`, student.rollNumber && `Roll ${student.rollNumber}`].filter(Boolean).join(" · ")}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-2">
        <button type="button" disabled={busy || picked.length === 0} className="btn btn-primary btn-sm"
          onClick={async () => {
            if (await onAdd(picked)) {
              setPicked([]);
              onClose();
            }
          }}>
          Add {picked.length || ""} student{picked.length === 1 ? "" : "s"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function PublishedCertificates({ programId }) {
  const [certificates, setCertificates] = useState(null);

  useEffect(() => {
    api(`/api/programs/${programId}/certificates`)
      .then((data) => setCertificates(data.certificates || []))
      .catch(() => setCertificates([]));
  }, [programId]);

  if (!certificates?.length) return null;
  // The bulk print page takes at most 80 certificates per page.
  const batches = [];
  for (let i = 0; i < certificates.length; i += 80) batches.push(certificates.slice(i, i + 80));

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          <BadgeCheck aria-hidden size={18} className="text-success" /> {certificates.length} certificate{certificates.length === 1 ? "" : "s"} issued
        </h3>
        <div className="flex flex-wrap gap-2">
          {batches.map((batch, index) => (
            <a key={index} href={`/certificates/bulk?ids=${batch.map((c) => c._id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm inline-flex items-center gap-1">
              <Printer aria-hidden size={14} />
              {batches.length === 1 ? "Print all" : `Print ${index * 80 + 1}–${index * 80 + batch.length}`}
            </a>
          ))}
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {certificates.map((c) => (
          <li key={c._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{c.name} · <span className="text-muted">{c.performanceTitle}</span></span>
            <a href={c.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand hover:underline">Open</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
