"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings,
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

  const [busyId, setBusyId] = useState("");
  const [viewing, setViewing] = useState(null);
  // Publish / unpublish straight from the list, without opening the program.
  const changeResult = async (program, action) => {
    const message = action === "publish"
      ? `Publish the result of “${program.title}”?

${plural(program.performedCount, "certificate")} will be issued. Students and their parents see them straight away and get a notification.`
      : `Unpublish the result of “${program.title}”?

All its certificates are deleted. Students and parents will no longer see them. You can publish again.`;
    if (!window.confirm(message)) return;
    setBusyId(program._id);
    setError("");
    try {
      await api(`/api/programs/${program._id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusyId("");
    }
  };

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
        <>
        {viewing && <CertificatesDialog program={viewing} onClose={() => setViewing(null)} />}
        <ProgramTable programs={programs} isSchool={isSchool} busyId={busyId} onPublish={changeResult}
          onView={setViewing} onOpen={(id) => setView({ name: "detail", id })} />
        </>
      )}
    </div>
  );
}

/* ---------- the list of programs, one row each ---------- */

function inCharge(program) {
  return program.assignedTeachers.map((t) => t.name).join(", ");
}

/** The result control of one row: publish when ready, unpublish when out. */
function ResultAction({ program, busy, onPublish, onView, isSchool }) {
  const stop = (e) => e.stopPropagation();
  if (program.stage === "PUBLISHED") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm inline-flex items-center gap-1 whitespace-nowrap"
          onClick={(e) => { stop(e); onView(program); }}>
          <BadgeCheck aria-hidden size={14} /> View certificates
        </button>
        {isSchool && (
          <button type="button" disabled={busy} className="btn btn-soft-danger btn-sm whitespace-nowrap"
            onClick={(e) => { stop(e); onPublish(program, "unpublish"); }}>
            {busy ? "Working…" : "Unpublish"}
          </button>
        )}
      </span>
    );
  }
  if (!isSchool) return <span className="text-xs text-muted">Not published yet</span>;
  const ready = program.stage === "LOCKED" && program.performedCount > 0;
  const why = program.stage !== "LOCKED"
    ? "Lock every performance's list first"
    : "Mark at least one student as success first";
  return (
    <span className="inline-flex flex-col items-start gap-1" onClick={stop}>
      <button type="button" disabled={busy || !ready} title={ready ? "" : why}
        className="btn btn-primary btn-sm inline-flex items-center gap-1 whitespace-nowrap"
        onClick={(e) => { stop(e); onPublish(program, "publish"); }}>
        <BadgeCheck aria-hidden size={14} /> {busy ? "Publishing…" : "Publish result"}
      </button>
      {!ready && <span className="text-[11px] text-muted">{why}</span>}
    </span>
  );
}

/** Every certificate of one published program, over the list. */
function CertificatesDialog({ program, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="program-certificates-title" onClick={onClose}>
      <div className="modal-panel !max-w-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="program-certificates-title" className="text-lg font-bold text-ink">{program.title}</h2>
            <p className="text-sm text-muted">Certificates of every student marked as success.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon btn-ghost btn-sm -mr-1 -mt-1" aria-label="Close">
            <X aria-hidden size={18} />
          </button>
        </div>
        <IssuedCertificates program={program} />
      </div>
    </div>
  );
}

function ProgramTable({ programs, isSchool, busyId, onPublish, onView, onOpen }) {
  return (
    <div className="card overflow-hidden">
      {/* Wide screens: a real table. */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-4 py-3">Program</th>
            <th scope="col" className="px-4 py-3">Date</th>
            <th scope="col" className="px-4 py-3 text-center">Performances</th>
            <th scope="col" className="px-4 py-3 text-center">Students</th>
            <th scope="col" className="px-4 py-3">In charge</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {programs.map((program) => (
            <tr key={program._id} onClick={() => onOpen(program._id)} className="cursor-pointer align-top transition-colors hover:bg-surface-2">
              <td className="px-4 py-3">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(program._id); }}
                  className="text-left text-base font-bold text-ink hover:text-brand">
                  {program.title}
                </button>
                {program.venue && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin aria-hidden size={12} />{program.venue}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="block text-ink"><AppDate value={program.date} mode="dateTime" /></span>
                <span className="mt-1 inline-block"><ProgramCountdown date={program.date} /></span>
              </td>
              <td className="px-4 py-3 text-center font-semibold tabular-nums text-ink">{program.performances.length}</td>
              <td className="px-4 py-3 text-center tabular-nums text-ink">
                <span className="font-semibold">{program.performerCount}</span>
                {program.stage !== "OPEN" && (
                  <span className="block text-xs text-muted">{program.performedCount} performed</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted">{inCharge(program) || "—"}</td>
              <td className="px-4 py-3">
                <span className={`badge ${STAGE[program.stage].tone} whitespace-nowrap text-xs`}>{STAGE[program.stage].label}</span>
                {program.academicYear && <span className="mt-1 block text-xs text-muted">AY {program.academicYear}</span>}
              </td>
              <td className="px-4 py-3">
                <ResultAction program={program} isSchool={isSchool} busy={busyId === program._id} onPublish={onPublish} onView={onView} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: the same rows, stacked. */}
      <ul className="divide-y divide-line md:hidden">
        {programs.map((program) => (
          <li key={program._id}>
            <button type="button" onClick={() => onOpen(program._id)} className="block w-full px-4 py-3 text-left hover:bg-surface-2">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 text-base font-bold text-ink">{program.title}</span>
                <span className={`badge ${STAGE[program.stage].tone} shrink-0 text-xs`}>{STAGE[program.stage].label}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden size={12} /><AppDate value={program.date} mode="dateTime" /></span>
                <ProgramCountdown date={program.date} />
              </span>
              <span className="mt-1 block text-sm text-ink">
                {plural(program.performances.length, "performance")} · {plural(program.performerCount, "student")}
                {program.stage !== "OPEN" && ` · ${program.performedCount} performed`}
              </span>
              {inCharge(program) && <span className="mt-0.5 block text-xs text-muted">In charge: {inCharge(program)}</span>}
            </button>
            <div className="px-4 pb-3">
              <ResultAction program={program} isSchool={isSchool} busy={busyId === program._id} onPublish={onPublish} onView={onView} />
            </div>
          </li>
        ))}
      </ul>
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

/*
 * The program page always shows ONE step: the one the program is on. A card
 * at the top says what to do now and holds the button that moves it on;
 * below it are only the controls that step needs. Everything occasional —
 * editing details, teachers, unlocking, unpublishing, deleting — sits behind
 * Settings so it never competes with the job at hand.
 */
const STEPS = [
  { stage: "OPEN", title: "Add students" },
  { stage: "LOCKED", title: "Mark success" },
  { stage: "PUBLISHED", title: "Certificates" },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ProgramDetail({ id, teachers, isSchoolMode, onBack }) {
  const [program, setProgram] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    api(`/api/programs/${id}`)
      .then((data) => setProgram(data.program))
      .catch((reason) => setError(reason.message));
  }, [id]);

  const act = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return false;
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
  const published = program.stage === "PUBLISHED";
  const hasSettings = school || !published;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm inline-flex items-center gap-1">
        <ArrowLeft aria-hidden size={16} /> All programs
      </button>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-ink">{program.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden size={14} /><AppDate value={program.date} mode="dateTime" /></span>
              {program.venue && <span className="inline-flex items-center gap-1"><MapPin aria-hidden size={14} />{program.venue}</span>}
              <ProgramCountdown date={program.date} />
            </p>
            {program.assignedTeachers.length > 0 && (
              <p className="mt-1 text-xs text-muted">In charge: {program.assignedTeachers.map((t) => t.name).join(", ")}</p>
            )}
          </div>
          {hasSettings && (
            <button type="button" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}
              className={`btn btn-sm inline-flex items-center gap-1 ${showSettings ? "btn-soft" : "btn-secondary"}`}>
              <Settings aria-hidden size={14} /> Settings
            </button>
          )}
        </div>
        <Stepper stage={program.stage} />
      </section>

      {showSettings && (
        <SettingsPanel
          program={program}
          school={school}
          teachers={teachers}
          busy={busy}
          act={act}
          onEdit={() => setEditing(true)}
          onDelete={remove}
        />
      )}

      {error && <AlertBanner type="error" message={error} />}

      <NextStep program={program} school={school} busy={busy} act={act} />

      {!published && <PerformancesStep program={program} school={school} busy={busy} act={act} />}
      {published && <IssuedCertificates program={program} />}
    </div>
  );
}

function Stepper({ stage }) {
  const current = STEPS.findIndex((step) => step.stage === stage);
  const finished = stage === "PUBLISHED";
  return (
    <ol className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm">
      {STEPS.map((step, index) => {
        const done = index < current || finished;
        const active = index === current && !finished;
        return (
          <li key={step.stage} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? "bg-success text-white" : active ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>
              {done ? <Check aria-hidden size={14} /> : index + 1}
            </span>
            <span className={`truncate ${active ? "font-semibold text-ink" : done ? "text-ink" : "hidden text-muted sm:inline"}`}>
              {step.title}
            </span>
            {index < STEPS.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

/** "What to do now" — one sentence and the one button that moves the program on. */
function NextStep({ program, school, busy, act }) {
  const total = program.performerCount;
  const performed = program.performedCount;
  let title;
  let text;
  let action = null;
  let tone = "border-brand-line bg-brand-soft";

  if (program.stage === "OPEN") {
    const count = program.performances.length;
    const lockedCount = program.performances.filter((p) => p.locked).length;
    const unlocked = program.performances.filter((p) => !p.locked && p.performers.length > 0).length;
    title = "Step 1: Add students, then lock each list";
    text = count === 0
      ? "Add a performance, for example “Group dance on a Deusi song”, then add the students in it."
      : `${lockedCount} of ${plural(count, "performance")} locked. When a performance is done, mark it as success or not success at the bottom of its card (that locks its list).`;
    action = unlocked > 1 ? (
      <button type="button" disabled={busy} className="btn btn-secondary inline-flex items-center gap-2"
        onClick={() => act({ action: "lock" }, `Lock every list?\n\nNo more students can be added or removed in any performance.${school ? " You can unlock each one again." : " Only the school can unlock them."}`)}>
        <Lock aria-hidden size={16} /> Lock all lists
      </button>
    ) : null;
  } else if (program.stage === "LOCKED") {
    title = "Step 2: Mark success, then publish";
    text = `${performed} of ${total} marked as success. Only successful students get a certificate.`;
    action = school ? (
      <button type="button" disabled={busy || performed === 0} className="btn btn-primary inline-flex items-center gap-2"
        onClick={() => act({ action: "publish" }, `Publish the result of “${program.title}”?\n\n${plural(performed, "certificate")} will be issued. Students and their parents see them straight away and get a notification.`)}>
        <BadgeCheck aria-hidden size={16} /> Publish result
      </button>
    ) : (
      <p className="text-sm text-muted">The school publishes the result when marking is done.</p>
    );
  } else {
    tone = "border-success-line bg-success-soft";
    title = "Done: certificates published";
    text = "Each student who performed sees their certificate on their dashboard, and their parents see it under My Child.";
  }

  return (
    <section className={`flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>button]:w-full sm:[&>button]:w-auto [&>button]:justify-center ${tone}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
      </div>
      {action}
    </section>
  );
}

/* ---------- steps 1 and 2: the performances, each with its own lock ---------- */

function PerformancesStep({ program, school, busy, act }) {
  const [adding, setAdding] = useState(program.performances.length === 0);
  const [form, setForm] = useState({ title: "", certificateTitle: "", performanceType: "SOLO" });
  const [students, setStudents] = useState([]);
  const firstOne = program.performances.length === 0;
  const others = performancesByStudent(program);
  const folding = useFolding(program);

  return (
    <section className="space-y-3">
      <FoldBar program={program} folding={folding} />
      {program.performances.map((performance, index) => (
        <PerformanceCard key={performance._id} program={program} performance={performance} number={index + 1} others={others}
          open={folding.isOpen(performance._id)} onToggle={() => folding.toggle(performance._id)} school={school} busy={busy} act={act} />
      ))}

      {adding || firstOne ? (
        <form
          className="card space-y-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "addPerformance", ...form, studentIds: students.map((x) => x._id) })) {
              setForm({ title: "", certificateTitle: "", performanceType: form.performanceType });
              setStudents([]);
              setAdding(false);
            }
          }}
        >
          <p className="text-base font-bold text-ink">
            {firstOne ? "Add the first performance" : `Add performance ${program.performances.length + 1}`}
          </p>
          <PerformanceFields value={form} onChange={setForm} programTitle={program.title} autoFocus={!firstOne} />
          <div>
            <p className="mb-1 text-sm font-medium text-ink">
              Students <span className="font-normal text-muted">(optional, you can add more later)</span>
            </p>
            <StudentSuggest programId={program._id} selected={students} onChange={setStudents} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary flex-1 sm:flex-none">
              {students.length ? `Add performance with ${plural(students.length, "student")}` : "Add performance"}
            </button>
            {!firstOne && (
              <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setStudents([]); }}>Cancel</button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto" onClick={() => setAdding(true)}>
          <Plus aria-hidden size={16} /> Add another performance
        </button>
      )}
    </section>
  );
}

/** What the certificate prints for a performance. */
function printedTitle(performance) {
  return performance.certificateTitle || performance.title;
}

/**
 * The other performances each student is in, so a student who dances and
 * also sings is easy to spot: studentId -> [{ number, title }].
 */
function performancesByStudent(program) {
  const map = new Map();
  program.performances.forEach((performance, index) => {
    performance.performers.forEach((performer) => {
      const list = map.get(performer.studentId) || [];
      list.push({ id: performance._id, number: index + 1, title: performance.title });
      map.set(performer.studentId, list);
    });
  });
  return map;
}

function AlsoIn({ others }) {
  if (!others.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {others.map((other) => (
        <span key={other.id} className="inline-flex max-w-full items-center gap-1 rounded-control bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
          <span className="font-bold text-brand">#{other.number}</span>
          <span className="truncate">Also in {other.title}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The big, numbered heading every performance card shares — the number and
 * the bold title are what staff scan for when one student is in several.
 */
function PerformanceHeading({ performance, number, meta, open, onToggle, children }) {
  const onCertificate = printedTitle(performance);
  const names = performance.performers.map((p) => p.name);
  const hint = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
  return (
    <header className={`flex flex-wrap items-start gap-2 bg-surface-2 px-4 py-3 ${open ? "border-b border-line" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-brand text-base font-bold text-white" aria-hidden>
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold leading-snug text-ink">
            <span className="sr-only">Performance {number}: </span>{performance.title}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-muted">
            {performance.performanceType === "GROUP" ? "Group" : "Solo"} · {meta}
          </span>
          <span className="mt-1 flex items-start gap-1 text-sm text-ink">
            <BadgeCheck aria-hidden size={15} className="mt-0.5 shrink-0 text-success" />
            <span><span className="text-muted">On certificate:</span> <span className="font-semibold">‘{onCertificate}’</span></span>
          </span>
          {!open && hint && <span className="mt-1 block truncate text-xs text-muted">{hint}</span>}
        </span>
        <ChevronDown aria-hidden size={20} className={`mt-2 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {children}
    </header>
  );
}

/**
 * Which performance cards are unfolded. A program with one performance
 * starts open; with several they start folded so the whole list of
 * performances fits on screen. A performance added since starts open.
 */
function useFolding(program) {
  const [state, setState] = useState(() => ({
    known: program.performances.map((p) => p._id),
    open: program.performances.length <= 1 ? program.performances.map((p) => p._id) : [],
  }));
  const fresh = program.performances.map((p) => p._id).filter((id) => !state.known.includes(id));
  const openIds = new Set([...state.open, ...fresh]);
  const commit = (next) => setState({ known: program.performances.map((p) => p._id), open: [...next] });
  return {
    isOpen: (id) => openIds.has(id),
    toggle: (id) => {
      const next = new Set(openIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commit(next);
    },
    allOpen: program.performances.every((p) => openIds.has(p._id)),
    setAll: (value) => commit(value ? program.performances.map((p) => p._id) : []),
  };
}

function FoldBar({ program, folding }) {
  const count = program.performances.length;
  if (count < 2) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold text-ink">{plural(count, "performance")}</p>
      <button type="button" className="btn btn-ghost btn-sm inline-flex items-center gap-1" onClick={() => folding.setAll(!folding.allOpen)}>
        <ChevronDown aria-hidden size={14} className={folding.allOpen ? "rotate-180" : ""} />
        {folding.allOpen ? "Collapse all" : "Expand all"}
      </button>
    </div>
  );
}

/** Name, certificate title and type — shared by "add" and "edit". */
function PerformanceFields({ value, onChange, programTitle, autoFocus = false }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const preview = value.certificateTitle.trim() || value.title.trim();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-sm font-medium text-ink">Performance name</span>
          <input className="input mt-1" value={value.title} required maxLength={160} autoFocus={autoFocus}
            onChange={set("title")} placeholder="e.g. Deusi dance – Grade 4" />
          <span className="mt-1 block text-xs text-muted">What staff and students see in the list.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Title on certificate <span className="font-normal text-muted">(optional)</span></span>
          <input className="input mt-1" value={value.certificateTitle} maxLength={160}
            onChange={set("certificateTitle")} placeholder={value.title.trim() || "Same as performance name"} />
          <span className="mt-1 block text-xs text-muted">Leave empty to print the performance name.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Type</span>
          <select className="input mt-1" value={value.performanceType} onChange={set("performanceType")}>
            <option value="SOLO">Solo</option>
            <option value="GROUP">Group</option>
          </select>
        </label>
      </div>
      {preview && (
        <p className="rounded-control border border-success-line bg-success-soft px-3 py-2 text-sm text-ink">
          <span className="text-muted">The certificate will read:</span> “for performing{" "}
          <span className="font-bold">‘{preview}’</span>
          {value.performanceType === "GROUP" ? " (group performance)" : ""} in <span className="font-semibold">‘{programTitle}’</span>”
        </p>
      )}
    </div>
  );
}

function classLine(person) {
  return [person.grade, person.section && `Sec ${person.section}`, person.rollNumber && `Roll ${person.rollNumber}`]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One performance. While its list is open: add and remove students. Once
 * locked (button at the bottom right): tick who performed. The school or
 * an assigned teacher locks a list; only the school unlocks it.
 */
function PerformanceCard({ program, performance, number, others, open, onToggle, school, busy, act }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState({
    title: performance.title,
    certificateTitle: performance.certificateTitle || "",
    performanceType: performance.performanceType,
  });
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState([]);
  const count = performance.performers.length;
  const locked = performance.locked;
  const ticked = performance.performers.filter((p) => p.status === "PERFORMED").length;
  const failed = performance.performers.filter((p) => p.status === "NOT_PERFORMED").length;

  const meta = locked ? (
    <>
      {ticked} success · {failed} not success ·{" "}
      <span className="inline-flex items-center gap-0.5 font-semibold text-warning"><Lock aria-hidden size={11} /> Locked</span>
    </>
  ) : (
    plural(count, "student")
  );

  const mark = (performer) => act({
    action: "markPerformer",
    performanceId: performance._id,
    studentId: performer.studentId,
    status: performer.status === "PERFORMED" ? "NOT_PERFORMED" : "PERFORMED",
  });

  const markAll = (status) => {
    const word = status === "PERFORMED" ? "success" : "not success";
    const note = status === "PERFORMED"
      ? "Each of them gets a certificate when the result is published."
      : "None of them gets a certificate.";
    act(
      { action: "markPerformer", performanceId: performance._id, status, lock: true },
      `Mark all ${plural(count, "student")} in “${performance.title}” as ${word}?

${note}${locked ? "" : " This also locks the list."} You can still change single students afterwards.`
    );
  };

  const markControls = count > 0 ? (
    <>
      <button type="button" disabled={busy || ticked === count}
        className="btn btn-sm inline-flex min-h-10 items-center justify-center gap-1 border border-success-line bg-success-soft font-semibold text-success hover:brightness-95"
        onClick={() => markAll("PERFORMED")}>
        <Check aria-hidden size={14} /> Mark as success
      </button>
      <button type="button" disabled={busy || failed === count} className="btn btn-soft-danger btn-sm inline-flex min-h-10 items-center justify-center gap-1"
        onClick={() => markAll("NOT_PERFORMED")}>
        <X aria-hidden size={14} /> Mark as not success
      </button>
    </>
  ) : null;

  let lockControl;
  if (!locked) {
    lockControl = (
      <button type="button" disabled={busy || count === 0} title={count === 0 ? "Add students first" : ""}
        className="btn btn-secondary btn-sm col-span-2 inline-flex min-h-10 items-center justify-center gap-1"
        onClick={() => act(
          { action: "lockPerformance", performanceId: performance._id },
          `Lock the list of “${performance.title}”?\n\nStudents can no longer be added or removed in this performance, and you can tick who performed.${school ? " You can unlock it again." : " Only the school can unlock it."}`
        )}>
        <Lock aria-hidden size={14} /> Lock list
      </button>
    );
  } else if (school) {
    lockControl = (
      <button type="button" disabled={busy} className="btn btn-ghost btn-sm col-span-2 inline-flex min-h-10 items-center justify-center gap-1"
        onClick={() => act({ action: "unlockPerformance", performanceId: performance._id })}>
        <Unlock aria-hidden size={14} /> Unlock list
      </button>
    );
  } else {
    lockControl = <span className="col-span-2 text-center text-xs text-muted sm:text-left">Only the school can unlock this list.</span>;
  }

  return (
    <article className={`card overflow-hidden border-l-4 ${locked ? "border-l-warning" : "border-l-brand"}`}>
      {renaming ? (
        <form
          className="space-y-3 border-b border-line bg-surface-2 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "updatePerformance", performanceId: performance._id, ...draft })) setRenaming(false);
          }}
        >
          <p className="text-base font-bold text-ink">Edit performance {number}</p>
          <PerformanceFields value={draft} onChange={setDraft} programTitle={program.title} autoFocus />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary btn-sm">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <PerformanceHeading performance={performance} number={number} meta={meta} open={open} onToggle={onToggle}>
          <div className="flex gap-1">
            <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${performance.title}`} onClick={() => setRenaming(true)}>
              <Pencil aria-hidden size={14} />
            </button>
            {!locked && (
              <button type="button" disabled={busy} className="btn btn-ghost btn-sm text-danger" aria-label={`Delete ${performance.title}`}
                onClick={() => act({ action: "removePerformance", performanceId: performance._id }, `Delete “${performance.title}”${count ? ` and its ${plural(count, "name")}` : ""}?`)}>
                <Trash2 aria-hidden size={14} />
              </button>
            )}
          </div>
        </PerformanceHeading>
      )}

      {open && count > 0 && (locked ? (
        <PerformerTable
          performance={performance}
          others={others}
          busy={busy}
          rowClick={mark}
          lead={(performer, toggle) => (
            <input type="checkbox" className="!h-5 !w-5" checked={performer.status === "PERFORMED"} disabled={busy}
              aria-label={`${performer.name}: success`} onChange={toggle} onClick={(e) => e.stopPropagation()} />
          )}
          leadHeader={<span className="sr-only">Success</span>}
          trailHeader="Result"
          trail={(performer) => <ResultBadge status={performer.status} />}
        />
      ) : (
        <PerformerTable
          performance={performance}
          others={others}
          trail={(performer) => (
            <button type="button" disabled={busy} className="btn btn-ghost btn-sm" aria-label={`Remove ${performer.name}`}
              onClick={() => act({ action: "removePerformer", performanceId: performance._id, studentId: performer.studentId })}>
              <X aria-hidden size={14} />
            </button>
          )}
        />
      ))}

      {open && !locked && picking ? (
        <div className="space-y-2 border-t border-line px-4 py-3">
          <StudentSuggest
            programId={program._id}
            selected={picked}
            onChange={setPicked}
            exclude={new Set(performance.performers.map((p) => p.studentId))}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || picked.length === 0} className="btn btn-primary btn-sm"
              onClick={async () => {
                if (await act({ action: "addPerformers", performanceId: performance._id, studentIds: picked.map((x) => x._id) })) {
                  setPicked([]);
                  setPicking(false);
                }
              }}>
              {picked.length ? `Add ${plural(picked.length, "student")}` : "Add students"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPicked([]); setPicking(false); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {/* footer: what you can do on the left, the list's lock on the right */}
      <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 empty:hidden">
          {open && !locked && !picking && (
            <button type="button" className="btn btn-soft btn-sm inline-flex min-h-10 w-full items-center justify-center gap-1 sm:w-auto" onClick={() => setPicking(true)}>
              <UserPlus aria-hidden size={14} /> {count ? "Add more students" : "Add students"}
            </button>
          )}
          {open && locked && count > 0 && <p className="text-xs text-muted">Tick a student to change just them.</p>}
          {open && count === 0 && locked && <p className="text-xs text-muted">No students in this performance.</p>}
        </div>
        {/* phones: two buttons side by side, the lock full width under them */}
        <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          {markControls}
          {lockControl}
        </div>
      </div>
    </article>
  );
}

const RESULT = {
  PERFORMED: { label: "Success", tone: "badge-success" },
  NOT_PERFORMED: { label: "Not success", tone: "badge-danger" },
  REGISTERED: { label: "Not marked", tone: "badge-neutral" },
};

function ResultBadge({ status }) {
  const result = RESULT[status] || RESULT.REGISTERED;
  return <span className={`badge ${result.tone} whitespace-nowrap text-xs`}>{result.label}</span>;
}

/**
 * The students of one performance as table rows: number, name, grade,
 * section, roll. `lead` adds a first column (the step-2 tick), `trail` a
 * last one (remove, or the status). On phones grade/section/roll fold into
 * a line under the name.
 */
function PerformerTable({ performance, others, lead, leadHeader = null, trail, trailHeader = null, rowClick, busy = false }) {
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-line">
        <tr>
          {lead && <th scope="col" className={`${th} w-10 pl-4`}>{leadHeader}</th>}
          <th scope="col" className={`${th} w-10 ${lead ? "" : "pl-4"}`}>#</th>
          <th scope="col" className={th}>Student</th>
          <th scope="col" className={`${th} hidden sm:table-cell`}>Grade</th>
          <th scope="col" className={`${th} hidden sm:table-cell`}>Section</th>
          <th scope="col" className={`${th} hidden sm:table-cell`}>Roll</th>
          {trail && <th scope="col" className={`${th} pr-4 text-right`}>{trailHeader || <span className="sr-only">Actions</span>}</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {performance.performers.map((performer, index) => {
          const toggle = rowClick ? () => rowClick(performer) : undefined;
          const also = (others.get(performer.studentId) || []).filter((o) => o.id !== performance._id);
          return (
            <tr key={performer.studentId} onClick={busy ? undefined : toggle}
              className={`align-top ${toggle ? "cursor-pointer hover:bg-surface-2" : ""} ${busy && toggle ? "opacity-70" : ""}`}>
              {lead && <td className="py-2.5 pl-4 pr-3">{lead(performer, toggle)}</td>}
              <td className={`py-2.5 pr-3 tabular-nums text-muted ${lead ? "" : "pl-4"}`}>{index + 1}</td>
              <td className="px-3 py-2.5">
                <span className="block font-medium text-ink">{performer.name}</span>
                <span className="block text-xs text-muted sm:hidden">{classLine(performer)}</span>
                {performer.addedByRole === "STUDENT" && <span className="block text-xs text-muted">Joined themselves</span>}
                <AlsoIn others={also} />
              </td>
              <td className="hidden px-3 py-2.5 text-ink sm:table-cell">{performer.grade || "—"}</td>
              <td className="hidden px-3 py-2.5 text-ink sm:table-cell">{performer.section || "—"}</td>
              <td className="hidden px-3 py-2.5 tabular-nums text-ink sm:table-cell">{performer.rollNumber || "—"}</td>
              {trail && <td className="py-1.5 pl-3 pr-4 text-right align-middle">{trail(performer)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ---------- step 3: the issued certificates ---------- */

function IssuedCertificates({ program }) {
  // Loaded per publish: a republish has a new timestamp, so a stale list
  // from the previous one is never shown as current.
  const publishKey = `${program._id}:${program.certificatesPublishedAt}`;
  const [loaded, setLoaded] = useState({ key: "", certificates: [] });
  const certificates = loaded.key === publishKey ? loaded.certificates : null;

  useEffect(() => {
    let live = true;
    api(`/api/programs/${program._id}/certificates`)
      .then((data) => live && setLoaded({ key: publishKey, certificates: data.certificates || [] }))
      .catch(() => live && setLoaded({ key: publishKey, certificates: [] }));
    return () => {
      live = false;
    };
  }, [program._id, publishKey]);

  if (certificates === null) return <LoadingState title="Loading certificates" message="Fetching the issued certificates." />;

  // The bulk print page takes at most 80 certificates per page.
  const batches = [];
  for (let i = 0; i < certificates.length; i += 80) batches.push(certificates.slice(i, i + 80));

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <BadgeCheck aria-hidden size={18} className="text-success" /> {plural(certificates.length, "certificate")}
          </h3>
          {program.certificatesPublishedAt && (
            <p className="text-xs text-muted">Published <AppDate value={program.certificatesPublishedAt} /></p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {batches.map((batch, index) => (
            <a key={index} href={`/certificates/bulk?ids=${batch.map((c) => c._id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm inline-flex items-center gap-1">
              <Printer aria-hidden size={14} />
              {batches.length === 1 ? "Print all" : `Print ${index * 80 + 1}–${index * 80 + batch.length}`}
            </a>
          ))}
        </div>
      </header>
      {groupByPerformance(certificates).map((group, index) => (
        <div key={group.title} className={index ? "border-t-4 border-surface-2" : ""}>
          <h4 className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-base font-bold text-ink">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-brand text-xs font-bold text-white" aria-hidden>{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">‘{group.title}’</span>
            <span className="shrink-0 text-xs font-medium text-muted">{plural(group.items.length, "certificate")}</span>
          </h4>
          <ul className="divide-y divide-line">
            {group.items.map((c) => (
              <li key={c._id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                <a href={c.certificateUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm font-semibold text-brand">View</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function groupByPerformance(certificates) {
  const groups = new Map();
  certificates.forEach((c) => {
    const title = c.performanceTitle || "Performance";
    if (!groups.has(title)) groups.set(title, { title, items: [] });
    groups.get(title).items.push(c);
  });
  return [...groups.values()];
}

/* ---------- settings: everything occasional ---------- */

function SettingsPanel({ program, school, teachers, busy, act, onEdit, onDelete }) {
  const locked = program.stage === "LOCKED";
  const published = program.stage === "PUBLISHED";
  return (
    <section className="card divide-y divide-line">
      {!published && (
        <SettingRow title="Program details" text="Name, date, venue and description.">
          <button type="button" onClick={onEdit} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
            <Pencil aria-hidden size={14} /> Edit
          </button>
        </SettingRow>
      )}
      {school && (
        <TeachersPanel program={program} teachers={teachers} busy={busy} onSave={(teacherIds) => act({ action: "setTeachers", teacherIds })} />
      )}
      {school && locked && (
        <SettingRow title="Change the names" text="Unlock every performance's list to add or remove students. Ticks already made are kept.">
          <button type="button" disabled={busy} onClick={() => act({ action: "unlock" })} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
            <Unlock aria-hidden size={14} /> Unlock all lists
          </button>
        </SettingRow>
      )}
      {school && published && (
        <SettingRow title="Unpublish the result" text="Deletes every certificate of this program. Students and parents stop seeing them. You can publish again.">
          <button type="button" disabled={busy} className="btn btn-soft-danger btn-sm"
            onClick={() => act({ action: "unpublish" }, "Unpublish the result?\n\nAll certificates of this program are deleted. Students and parents will no longer see them. You can publish again after making changes.")}>
            Unpublish
          </button>
        </SettingRow>
      )}
      {school && (
        <SettingRow title="Delete program" text="Removes the program, its names and any certificates.">
          <button type="button" disabled={busy} onClick={onDelete} className="btn btn-soft-danger btn-sm inline-flex items-center gap-1">
            <Trash2 aria-hidden size={14} /> Delete
          </button>
        </SettingRow>
      )}
    </section>
  );
}

function SettingRow({ title, text, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}

function TeachersPanel({ program, teachers, busy, onSave }) {
  const assigned = new Set(program.assignedTeachers.map((t) => t._id));
  const available = teachers.filter((t) => !assigned.has(String(t._id)));
  return (
    <div className="p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Users aria-hidden size={16} className="text-brand" /> Teachers in charge</p>
      <p className="text-sm text-muted">They run this program from their own dashboard: names and marking who performed.</p>
      {program.assignedTeachers.length > 0 && (
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
    </div>
  );
}

/**
 * Pick students by typing: a grade filter and a name box that suggests as
 * you type (↑ ↓ to move, Enter to add, Esc to close). Choosing a grade with
 * no name lists that grade, with "Add all" for whole-class performances.
 * Controlled: `selected` is the list of chosen students.
 */
function StudentSuggest({ programId, selected, onChange, exclude = new Set(), autoFocus = false }) {
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [grades, setGrades] = useState([]);
  const [results, setResults] = useState([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const listId = useId();

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (grade) params.set("grade", grade);
      api(`/api/programs/${programId}/students?${params}`)
        .then((data) => {
          if (!live) return;
          setError("");
          setResults(data.students || []);
          setGrades(data.grades || []);
          setActive(0);
        })
        .catch((reason) => live && setError(reason.message));
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [programId, q, grade]);

  const chosen = new Set(selected.map((s) => s._id));
  const options = results.filter((s) => !chosen.has(s._id) && !exclude.has(s._id));
  const searching = Boolean(q.trim() || grade);
  const showList = focused && searching;

  const add = (student) => {
    onChange([...selected, student]);
    setQ("");
    setActive(0);
  };
  const addAll = () => onChange([...selected, ...options]);
  const removeOne = (id) => onChange(selected.filter((s) => s._id !== id));

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Enter picks a suggestion; it never submits the surrounding form.
      e.preventDefault();
      if (showList && options[active]) add(options[active]);
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className="input sm:w-44" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Filter by grade">
          <option value="">All grades</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <div className="relative flex-1">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            value={q}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Type a student's name"
            placeholder={grade ? `Type a name, or pick from ${grade}` : "Type a student's name"}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          {showList && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-line bg-surface shadow-card">
              {!q.trim() && options.length > 1 && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addAll}
                  className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm font-semibold text-brand hover:bg-surface-2">
                  <Plus aria-hidden size={14} /> Add all {options.length} shown
                </button>
              )}
              <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto">
                {options.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted">{error || "No matching students."}</li>
                ) : (
                  options.map((student, index) => (
                    <li key={student._id} role="option" aria-selected={index === active}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => add(student)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left ${index === active ? "bg-brand-soft" : ""}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{student.name}</span>
                        <span className="shrink-0 text-xs text-muted">{classLine(student)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="overflow-hidden rounded-control border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <p className="text-sm font-semibold text-ink">{plural(selected.length, "student")} chosen</p>
            {selected.length > 1 && (
              <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-muted hover:text-danger">
                Clear all
              </button>
            )}
          </div>
          <ol className="max-h-72 divide-y divide-line overflow-y-auto" aria-label="Chosen students">
            {selected.map((student, index) => (
              <li key={student._id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{index + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{student.name}</span>
                  {classLine(student) && <span className="block truncate text-xs text-muted">{classLine(student)}</span>}
                </span>
                <button type="button" aria-label={`Remove ${student.name}`} onClick={() => removeOne(student._id)}
                  className="btn btn-ghost btn-sm text-muted hover:text-danger">
                  <X aria-hidden size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
