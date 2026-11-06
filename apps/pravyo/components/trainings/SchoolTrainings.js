"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  CheckSquare,
  GraduationCap,
  Presentation,
  Printer,
  Search,
  Square,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate } from "@/lib/nepaliDate";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Praavyo trainings, school side (Platform Events → Trainings): register
 * students (whole school, grades or chosen students) or teachers for a
 * published training. Praavyo trains at the school and marks it completed;
 * the participants' certificates then appear here, in the school's
 * Certificates section and on each participant's dashboard.
 */
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Something went wrong. Please try again.");
  return json.data || {};
}

export default function SchoolTrainings() {
  const { calendar } = useCalendarPreference();
  const nepali = calendar === "BS";
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [registeringId, setRegisteringId] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/api/school/trainings");
      setTrainings(data.trainings || []);
    } catch (error) {
      setFeedback({ type: "error", title: "Trainings could not be loaded", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (registeringId) {
    return (
      <RegistrationForm
        trainingId={registeringId}
        onClose={(message) => {
          setRegisteringId("");
          if (message) setFeedback({ type: "success", title: message });
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {feedback && <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />}

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-ink">Trainings</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Courses Praavyo runs at your school — AI, Canva and more. Register your students or teachers, Praavyo
          comes to train them, and every participant gets a certificate from Praavyo and your school.
        </p>
      </div>

      {loading ? (
        <div className="card space-y-2 p-4"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-3 w-2/3" /></div>
      ) : trainings.length === 0 ? (
        <div className="card p-4">
          <EmptyState icon={Presentation} title="No trainings right now" description="When Praavyo announces a training, it appears here for you to register." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {trainings.map((training) => {
            const registration = training.registration;
            const completed = registration?.status === "COMPLETED";
            const forTeachers = training.audience === "TEACHERS";
            const Icon = forTeachers ? Presentation : GraduationCap;
            return (
              <article key={training.id} className={`card flex flex-col p-4 sm:p-5 ${completed ? "border-success-line" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-strong"><Icon aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="badge badge-brand">For {forTeachers ? "teachers" : "students"}</span>
                      {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
                      {completed ? (
                        <span className="badge badge-success"><BadgeCheck /> Completed</span>
                      ) : registration ? (
                        <span className="badge badge-success">Registered</span>
                      ) : !training.registrationOpen ? (
                        <span className="badge badge-warning">Registration closed</span>
                      ) : null}
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-ink">{training.title}</h3>
                  </div>
                </div>

                {training.description && <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-body">{training.description}</p>}

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {!forTeachers && <span>{training.grades.length ? training.grades.join(", ") : "All grades"}</span>}
                  {training.registrationDeadline && training.registrationOpen && !completed && (
                    <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden /> Register by <span lang={nepali ? "ne" : undefined}>{formatDate(training.registrationDeadline, calendar)}</span></span>
                  )}
                </div>

                <div className="mt-auto pt-4">
                  {completed ? (
                    <div className="rounded-card border border-success-line bg-success-soft p-3">
                      <p className="text-sm font-semibold text-success">
                        {registration.certificates.length} certificate{registration.certificates.length === 1 ? "" : "s"} issued
                        {registration.trainingDate && <> · trained on <span lang={nepali ? "ne" : undefined}>{formatDate(registration.trainingDate, calendar)}</span></>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`/certificates/bulk?ids=${registration.certificates.map((row) => row.id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Printer aria-hidden /> Print all</a>
                        <a href="/school/certificates" className="btn btn-ghost btn-sm">Open Certificates</a>
                      </div>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                        {registration.certificates.map((row) => (
                          <li key={row.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-ink">{row.name}</span>
                            <a href={row.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-brand hover:underline">Certificate</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : registration ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-2 px-3 py-2.5">
                      <span className="text-sm text-ink">
                        <Users className="mr-1 inline text-muted" aria-hidden />
                        {registration.participantCount} {forTeachers ? "teacher" : "student"}{registration.participantCount === 1 ? "" : "s"} registered
                      </span>
                      {training.registrationOpen && (
                        <button type="button" onClick={() => setRegisteringId(training.id)} className="btn btn-secondary btn-sm">Change list</button>
                      )}
                    </div>
                  ) : training.registrationOpen ? (
                    <button type="button" onClick={() => setRegisteringId(training.id)} className="btn btn-primary w-full sm:w-auto">
                      <UserPlus aria-hidden /> Register {forTeachers ? "teachers" : "students"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RegistrationForm({ trainingId, onClose }) {
  const [state, setState] = useState({ loading: true, training: null, roster: [], registration: null });
  const [mode, setMode] = useState("CHOSEN");
  const [grades, setGrades] = useState([]);
  const [chosen, setChosen] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let active = true;
    api(`/api/school/trainings/${trainingId}`)
      .then((data) => {
        if (!active) return;
        setState({ loading: false, training: data.training, roster: data.roster || [], registration: data.registration });
        const saved = data.registration;
        if (saved) {
          setMode(saved.selection.mode);
          setGrades(saved.selection.grades);
          setChosen(new Set(saved.participants.map((person) => person.id)));
        } else {
          setMode(data.training.audience === "TEACHERS" ? "ALL" : "GRADES");
        }
      })
      .catch((loadError) => {
        if (!active) return;
        setState((current) => ({ ...current, loading: false }));
        setError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [trainingId]);

  const { training, roster, registration } = state;
  const forTeachers = training?.audience === "TEACHERS";
  const rosterGrades = useMemo(
    () => [...new Set(roster.map((person) => person.grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [roster]
  );
  const selected = useMemo(() => {
    if (mode === "ALL") return roster;
    if (mode === "GRADES") return roster.filter((person) => grades.includes(person.grade));
    return roster.filter((person) => chosen.has(person.id));
  }, [mode, grades, chosen, roster]);
  const query = search.trim().toLowerCase();
  const visibleRoster = roster.filter((person) => !query || `${person.name} ${person.grade} ${person.detail}`.toLowerCase().includes(query));

  const toggle = (id) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(`/api/school/trainings/${trainingId}`, {
        method: "PUT",
        body: { mode, grades: mode === "GRADES" ? grades : [], participants: mode === "CHOSEN" ? [...chosen] : [] },
      });
      onClose(registration ? "Registration updated" : `Registered ${selected.length} ${forTeachers ? "teacher" : "student"}${selected.length === 1 ? "" : "s"}`);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  if (state.loading) return <div className="card space-y-2 p-5"><div className="skeleton h-5 w-1/3" /><div className="skeleton h-3 w-2/3" /></div>;
  if (!training) return <div className="card p-4"><AlertBanner type="error" title="Training unavailable" message={error} /><button type="button" onClick={() => onClose()} className="btn btn-ghost mt-3">Back</button></div>;

  const modes = forTeachers
    ? [["ALL", "All teachers", `${roster.length} active teachers`], ["CHOSEN", "Choose teachers", "Pick who attends"]]
    : [
        ["ALL", training.grades.length ? "Every eligible student" : "Whole school", `${roster.length} students`],
        ["GRADES", "Choose grades", "Everyone in the grades you pick"],
        ["CHOSEN", "Choose students", "Pick students one by one"],
      ];

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="eyebrow">Register for training</p>
          <h2 className="truncate font-semibold text-ink">{training.title}</h2>
        </div>
        <button type="button" className="btn-icon btn-ghost btn-sm" aria-label="Close" onClick={() => onClose()}><X aria-hidden /></button>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {error && <AlertBanner type="error" title="Not saved" message={error} />}

        <fieldset>
          <legend className="label">Who attends?</legend>
          <div className={`grid gap-2 ${modes.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {modes.map(([value, label, note]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${mode === value ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand-line"}`}>
                <input type="radio" name="training-mode" className="mt-0.5" checked={mode === value} onChange={() => setMode(value)} />
                <span>
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-muted">{note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "GRADES" && (
          <fieldset>
            <legend className="label">Grades</legend>
            {rosterGrades.length === 0 ? (
              <p className="text-sm text-muted">No eligible students on your roster.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rosterGrades.map((grade) => {
                  const active = grades.includes(grade);
                  const count = roster.filter((person) => person.grade === grade).length;
                  return (
                    <button key={grade} type="button" aria-pressed={active} onClick={() => setGrades(active ? grades.filter((item) => item !== grade) : [...grades, grade])} className={`btn btn-sm rounded-full border ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-body"}`}>
                      {grade} <span className="text-muted">· {count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}

        {mode === "CHOSEN" && (
          <div>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="label mb-0">{forTeachers ? "Teachers" : "Students"} <span className="font-normal text-muted">({chosen.size} chosen)</span></span>
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={forTeachers ? "Search teachers" : "Search name or grade"} className="input w-full pl-9" aria-label="Search" />
              </div>
            </div>
            <div className="mb-2 flex gap-2 text-xs">
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setChosen((current) => new Set([...current, ...visibleRoster.map((person) => person.id)]))}>Select all shown</button>
              <span className="text-subtle">·</span>
              <button type="button" className="font-semibold text-muted hover:underline" onClick={() => setChosen(new Set())}>Clear</button>
            </div>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line">
              {visibleRoster.length === 0 ? (
                <li className="p-3 text-sm text-muted">Nobody matches.</li>
              ) : visibleRoster.map((person) => {
                const active = chosen.has(person.id);
                return (
                  <li key={person.id}>
                    <button type="button" onClick={() => toggle(person.id)} aria-pressed={active} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 ${active ? "bg-brand-soft/50" : ""}`}>
                      {active ? <CheckSquare className="shrink-0 text-brand" aria-hidden /> : <Square className="shrink-0 text-subtle" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{person.name}</span>
                      <span className="shrink-0 text-xs text-muted">{[person.grade, person.detail].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink"><span className="font-semibold tabular-nums">{selected.length}</span> {forTeachers ? "teacher" : "student"}{selected.length === 1 ? "" : "s"} will be registered</p>
          <div className="flex flex-wrap gap-2">
            {registration && <button type="button" onClick={() => setConfirmCancel(true)} className="btn btn-ghost text-danger">Cancel registration</button>}
            <button type="button" onClick={() => onClose()} className="btn btn-ghost">Back</button>
            <button type="button" disabled={saving || selected.length === 0} onClick={save} className="btn btn-primary">
              <UserPlus aria-hidden /> {saving ? "Saving…" : registration ? "Save changes" : "Register"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this registration?"
        message="Your school is taken off this training. You can register again while registration is open."
        confirmLabel="Cancel registration"
        tone="danger"
        busy={saving}
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await api(`/api/school/trainings/${trainingId}`, { method: "DELETE" });
            onClose("Registration cancelled");
          } catch (cancelError) {
            setError(cancelError.message);
            setSaving(false);
            setConfirmCancel(false);
          }
        }}
      />
    </section>
  );
}
