"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Globe,
  GraduationCap,
  Presentation,
  Printer,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate } from "@/lib/nepaliDate";
import DatePickerField from "@pravyo/cas/components/ui/DatePickerField";
import { isoOfDate } from "@pravyo/cas/components/ui/NepaliCalendar";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PeoplePicker, { groupByGrade } from "@/components/trainings/PeoplePicker";
import ParticipantTable from "@/components/trainings/ParticipantTable";

/**
 * Praavyo trainings, school side (Platform Events → Trainings).
 *
 *   1 Register   whole grades, or students inside a grade (only the grades the
 *                training is for), or teachers.
 *   2 Attendance after Praavyo trains here: Present/Absent for each person,
 *                then "Send to Praavyo".
 *   3 Certificates Praavyo issues them to everyone marked present.
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

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default function SchoolTrainings() {
  const { calendar } = useCalendarPreference();
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [screen, setScreen] = useState(null); // { kind: "register" | "attendance", id }

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

  const close = (message) => {
    setScreen(null);
    if (message) setFeedback({ type: "success", title: message });
    load();
  };

  if (screen?.kind === "register") return <RegistrationForm trainingId={screen.id} onClose={close} />;
  if (screen?.kind === "attendance") return <AttendanceForm trainingId={screen.id} calendar={calendar} onClose={close} />;

  return (
    <div className="space-y-4">
      {feedback && <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />}

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-ink">Trainings</h2>
        <p className="mt-0.5 max-w-2xl text-sm text-muted">
          Courses Praavyo runs at your school — AI, Canva and more. Register your students or teachers; after Praavyo
          trains them, mark who was present and send it. Everyone present gets a certificate from Praavyo and your school.
        </p>
      </div>

      {loading ? (
        <div className="card space-y-2 p-4"><div className="skeleton h-4 w-1/3" /><div className="skeleton h-3 w-2/3" /></div>
      ) : trainings.length === 0 ? (
        <div className="card p-4">
          <EmptyState icon={Presentation} title="No trainings right now" description="When Praavyo announces a training, it appears here for you to register." />
        </div>
      ) : (
        <div className="space-y-3">
          {trainings.map((training) => (
            <TrainingCard
              key={training.id}
              training={training}
              calendar={calendar}
              onRegister={() => setScreen({ kind: "register", id: training.id })}
              onAttendance={() => setScreen({ kind: "attendance", id: training.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STEPS = ["Registered", "Attendance sent", "Certificates issued"];
const stepOf = (registration) =>
  !registration ? -1 : registration.status === "COMPLETED" ? 2 : registration.status === "SUBMITTED" ? 1 : 0;

function Steps({ current }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {STEPS.map((label, index) => {
        const done = index <= current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-semibold ${done ? "bg-success text-white" : "border border-line-strong bg-surface text-muted"}`}>
              {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
            </span>
            <span className={`truncate text-xs ${done ? "font-semibold text-ink" : "text-muted"}`}>{label}</span>
            {index < STEPS.length - 1 && <span className={`h-px min-w-3 flex-1 ${index < current ? "bg-success" : "bg-line"}`} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function TrainingCard({ training, calendar, onRegister, onAttendance }) {
  const nepali = calendar === "BS";
  const registration = training.registration;
  const status = registration?.status;
  const forTeachers = training.audience === "TEACHERS";
  const people = forTeachers ? "teacher" : "student";
  const Icon = forTeachers ? Presentation : GraduationCap;
  const marked = registration ? registration.presentCount + registration.absentCount : 0;
  const certificates = registration?.certificates || [];
  const [showCertificates, setShowCertificates] = useState(false);

  // What the school sees next to the actions: where it stands, in one line.
  const standing =
    status === "COMPLETED" ? (
      <span className="text-success">
        <BadgeCheck className="mr-1 inline" aria-hidden />
        {plural(certificates.length, "certificate")} issued
        {registration.absentCount > 0 && <span className="text-muted"> · {registration.absentCount} absent</span>}
      </span>
    ) : status === "SUBMITTED" ? (
      <span>
        <Clock className="mr-1 inline text-muted" aria-hidden />
        Sent · {registration.presentCount} present · {registration.absentCount} absent
      </span>
    ) : status === "REGISTERED" ? (
      <span>
        <Users className="mr-1 inline text-muted" aria-hidden />
        {plural(registration.participantCount, people)} registered
        {marked > 0 && <span className="text-muted"> · {marked} marked</span>}
      </span>
    ) : null;

  return (
    <article className={`card p-4 sm:p-5 ${status === "COMPLETED" ? "border-success-line" : ""}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* The training */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-strong"><Icon aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge badge-brand">For {forTeachers ? "teachers" : "students"}</span>
              {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
              {!registration && !training.registrationOpen && <span className="badge badge-warning">Registration closed</span>}
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-ink">{training.title}</h3>
            {training.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-body">{training.description}</p>}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {!forTeachers && <span>{training.grades.length ? training.grades.join(", ") : "All grades"}</span>}
              {training.registrationDeadline && training.registrationOpen && !registration && (
                <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden /> Register by <span lang={nepali ? "ne" : undefined}>{formatDate(training.registrationDeadline, calendar)}</span></span>
              )}
              {registration?.trainingDate && status !== "REGISTERED" && (
                <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden /> Trained on <span lang={nepali ? "ne" : undefined}>{formatDate(registration.trainingDate, calendar)}</span></span>
              )}
            </div>
          </div>
        </div>

        {/* Where the school stands, and its next step */}
        <div className="flex shrink-0 flex-col gap-2 lg:items-end">
          {standing && <p className="text-sm text-ink">{standing}</p>}
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {registration && (
              <button type="button" onClick={() => setShowCertificates((value) => !value)} aria-expanded={showCertificates} className="btn btn-ghost btn-sm">
                <Users aria-hidden /> {showCertificates ? "Hide students" : `${forTeachers ? "Teachers" : "Students"} (${registration.participantCount})`}
              </button>
            )}
            <a href={`/trainings/${training.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm"><Globe aria-hidden /> Public page</a>
            {status === "COMPLETED" ? (
              <a href={`/certificates/bulk?ids=${certificates.map((row) => row.id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm"><Printer aria-hidden /> Print all</a>
            ) : status === "SUBMITTED" ? (
              <button type="button" onClick={onAttendance} className="btn btn-secondary btn-sm">View attendance</button>
            ) : status === "REGISTERED" ? (
              <>
                {training.registrationOpen && <button type="button" onClick={onRegister} className="btn btn-ghost btn-sm">Change list</button>}
                <button type="button" onClick={onAttendance} className="btn btn-primary btn-sm"><ClipboardCheck aria-hidden /> Mark attendance</button>
              </>
            ) : training.registrationOpen ? (
              <button type="button" onClick={onRegister} className="btn btn-primary">
                <UserPlus aria-hidden /> Register {forTeachers ? "teachers" : "students"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {registration && (
        <div className="mt-4 border-t border-line pt-3">
          <Steps current={stepOf(registration)} />
        </div>
      )}

      {status === "REGISTERED" && registration.returnReason && (
        <div className="mt-3 flex gap-2 rounded-card border border-warning-line bg-warning-soft p-3 text-sm">
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span className="text-ink"><span className="font-semibold">Praavyo sent the attendance back:</span> {registration.returnReason}</span>
        </div>
      )}
      {status === "SUBMITTED" && <p className="mt-3 text-xs text-muted">Praavyo will issue the certificates to everyone marked present.</p>}

      {registration && showCertificates && (
        <div className="mt-3">
          <ParticipantTable participants={registration.participants} certificates={certificates} teachers={forTeachers} />
        </div>
      )}
    </article>
  );
}

function ScreenHeader({ eyebrow, title, onClose }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="truncate font-semibold text-ink">{title}</h2>
      </div>
      <button type="button" className="btn-icon btn-ghost btn-sm" aria-label="Close" onClick={() => onClose()}><X aria-hidden /></button>
    </div>
  );
}

function useTraining(trainingId) {
  const [state, setState] = useState({ loading: true, training: null, roster: [], registration: null, error: "" });
  useEffect(() => {
    let active = true;
    api(`/api/school/trainings/${trainingId}`)
      .then((data) => active && setState({ loading: false, training: data.training, roster: data.roster || [], registration: data.registration, error: "" }))
      .catch((error) => active && setState((current) => ({ ...current, loading: false, error: error.message })));
    return () => {
      active = false;
    };
  }, [trainingId]);
  return state;
}

function Loading() {
  return <div className="card space-y-2 p-5"><div className="skeleton h-5 w-1/3" /><div className="skeleton h-3 w-2/3" /></div>;
}

function Unavailable({ error, onClose }) {
  return <div className="card p-4"><AlertBanner type="error" title="Training unavailable" message={error} /><button type="button" onClick={() => onClose()} className="btn btn-ghost mt-3">Back</button></div>;
}

// ------------------------------------------------------------- register

function RegistrationForm({ trainingId, onClose }) {
  const { loading, training, roster, registration, error: loadError } = useTraining(trainingId);
  const [chosen, setChosen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Until the school changes it: its saved list, or — registering for the
  // first time — everyone the training's criteria cover, ready to untick.
  const picked = useMemo(
    () => chosen || new Set((registration ? registration.participants : roster).map((person) => person.id)),
    [chosen, registration, roster]
  );
  const forTeachers = training?.audience === "TEACHERS";
  const noun = forTeachers ? "teachers" : "students";

  const choose = (ids, on) =>
    setChosen(() => {
      const next = new Set(picked);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  // "Grade 8 (whole) + 5 from Grade 9"
  const summary = useMemo(() => {
    if (forTeachers) return "";
    return groupByGrade(roster)
      .map(({ grade, rows }) => {
        const count = rows.filter((person) => picked.has(person.id)).length;
        if (!count) return "";
        return count === rows.length ? `${grade} (whole)` : `${count} from ${grade}`;
      })
      .filter(Boolean)
      .join(" + ");
  }, [forTeachers, roster, picked]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(`/api/school/trainings/${trainingId}`, { method: "PUT", body: { mode: "CHOSEN", participants: [...picked] } });
      onClose(registration ? "Registration updated" : `Registered ${plural(picked.size, forTeachers ? "teacher" : "student")}`);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!training) return <Unavailable error={loadError} onClose={onClose} />;

  return (
    <section className="card overflow-hidden">
      <ScreenHeader eyebrow="Register for training" title={training.title} onClose={onClose} />
      <div className="space-y-4 p-4 sm:p-5">
        {error && <AlertBanner type="error" title="Not saved" message={error} />}
        <p className="text-sm text-muted">
          {forTeachers
            ? "Choose the teachers who will attend."
            : <>For <span className="font-semibold text-ink">{training.grades.length ? training.grades.join(", ") : "all grades"}</span>.{" "}
              {registration ? "Tick a grade to take all of it, or pick students inside it." : "Everyone eligible is already ticked — untick the grades or students who will not attend."}</>}
        </p>
        {roster.length === 0 ? (
          <EmptyState icon={Users} title={`No eligible ${noun}`} description={forTeachers ? "Your school has no active teachers." : "None of your active students are in this training's grades."} />
        ) : (
          <PeoplePicker people={roster} chosen={picked} onChoose={choose} noun={noun} />
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="min-w-0 text-sm text-ink">
          <span className="font-semibold tabular-nums">{plural(picked.size, forTeachers ? "teacher" : "student")}</span>
          {summary && <span className="text-muted"> · {summary}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {registration && <button type="button" onClick={() => setConfirmCancel(true)} className="btn btn-ghost text-danger">Cancel registration</button>}
          <button type="button" onClick={() => onClose()} className="btn btn-ghost">Back</button>
          <button type="button" disabled={saving || picked.size === 0} onClick={save} className="btn btn-primary">
            <UserPlus aria-hidden /> {saving ? "Saving…" : registration ? "Save changes" : "Register"}
          </button>
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

// ------------------------------------------------------------- attendance

/**
 * Attendance, the way a teacher takes a register: everyone starts PRESENT and
 * the school only taps who was absent. Three numbered steps — the day, the
 * absent ones, send — so nothing is left "not marked".
 */
function StepTitle({ number, title, hint }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{number}</span>
      <div className="min-w-0">
        <h3 className="font-semibold text-ink">{title}</h3>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function AttendanceForm({ trainingId, calendar, onClose }) {
  const { loading, training, registration, error: loadError } = useTraining(trainingId);
  const [absentIds, setAbsentIds] = useState(null); // Set, once the school taps
  const [day, setDay] = useState(null);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  const people = useMemo(() => registration?.participants || [], [registration]);
  // Saved absences, until the school changes something. Not marked = present.
  const absent = useMemo(
    () => absentIds || new Set(people.filter((person) => person.attendance === "ABSENT").map((person) => person.id)),
    [absentIds, people]
  );
  const trainingDay = day ?? (registration?.trainingDate ? isoOfDate(new Date(registration.trainingDate)) : "");
  const readOnly = registration?.status !== "REGISTERED";
  const forTeachers = training?.audience === "TEACHERS";
  const noun = forTeachers ? "teacher" : "student";
  const presentCount = people.length - absent.size;
  const absentPeople = people.filter((person) => absent.has(person.id));

  const toggle = (id) => {
    if (readOnly) return;
    const next = new Set(absent);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAbsentIds(next);
  };

  const groups = useMemo(() => groupByGrade(people), [people]);
  const term = query.trim().toLowerCase();
  const shownGroups = groups
    .filter((group) => !grade || group.grade === grade)
    .map((group) => ({ ...group, shown: group.rows.filter((person) => !term || person.name.toLowerCase().includes(term)) }))
    .filter((group) => group.shown.length);

  async function save(submit) {
    setSaving(submit ? "send" : "draft");
    setError("");
    try {
      const marks = Object.fromEntries(people.map((person) => [person.id, absent.has(person.id) ? "ABSENT" : "PRESENT"]));
      await api(`/api/school/trainings/${trainingId}`, { method: "PATCH", body: { marks, trainingDate: trainingDay, submit } });
      onClose(submit ? "Attendance sent to Praavyo" : "Attendance saved — send it when you are ready");
    } catch (saveError) {
      setError(saveError.message);
      setSaving("");
      setConfirmSend(false);
    }
  }

  if (loading) return <Loading />;
  if (!training || !registration) return <Unavailable error={loadError || "Your school is not registered for this training."} onClose={onClose} />;

  const nepali = calendar === "BS";

  return (
    <section className="card overflow-hidden">
      <ScreenHeader eyebrow={readOnly ? "Attendance sent to Praavyo" : "Attendance"} title={training.title} onClose={onClose} />

      <div className="space-y-6 p-4 sm:p-5">
        {error && <AlertBanner type="error" title="Not saved" message={error} />}
        {!readOnly && registration.returnReason && (
          <AlertBanner type="warning" title="Praavyo asked you to check this" message={registration.returnReason} />
        )}

        {/* 1 — the day */}
        <div className="space-y-3">
          <StepTitle number={1} title="When was the training held?" hint={readOnly ? null : "The date printed on the certificates."} />
          <div className="pl-10">
            {readOnly ? (
              <p className="text-sm font-semibold text-ink" lang={nepali ? "ne" : undefined}>{registration.trainingDate ? formatDate(registration.trainingDate, calendar) : "—"}</p>
            ) : (
              <div className="max-w-xs">
                <DatePickerField value={trainingDay} onChange={setDay} calendar={calendar} max={isoOfDate(new Date())} placeholder="Choose the day" />
              </div>
            )}
          </div>
        </div>

        {/* 2 — who was absent */}
        <div className="space-y-3">
          <StepTitle
            number={2}
            title={readOnly ? "Who attended" : `Tap the ${noun}s who were absent`}
            hint={readOnly ? null : `Everyone is marked present. Tap a name to mark them absent; tap again to undo.`}
          />
          <div className="space-y-3 sm:pl-10">
            {/* Live totals, and the absent ones by name */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-success tabular-nums"><Check aria-hidden /> {presentCount} present</span>
              <span className={`badge tabular-nums ${absent.size ? "badge-danger" : "badge-neutral"}`}><X aria-hidden /> {absent.size} absent</span>
              {absentPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(person.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-danger-line bg-danger-soft px-2.5 text-xs font-semibold text-danger disabled:cursor-default"
                  title={readOnly ? undefined : "Mark present again"}
                >
                  {person.name}{!readOnly && <X className="h-3 w-3" aria-hidden />}
                </button>
              ))}
            </div>

            {/* Find someone quickly in a long list */}
            {people.length > 8 && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find a ${noun}`} className="input w-full pl-9" aria-label={`Find a ${noun}`} />
                </label>
                {groups.length > 1 && (
                  <select value={grade} onChange={(event) => setGrade(event.target.value)} className="input sm:w-44" aria-label="Grade">
                    <option value="">All grades</option>
                    {groups.map((group) => <option key={group.grade} value={group.grade}>{group.grade} ({group.rows.length})</option>)}
                  </select>
                )}
              </div>
            )}

            <div className="max-h-[30rem] overflow-y-auto rounded-card border border-line">
              {shownGroups.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">Nobody matches.</p>
              ) : (
                shownGroups.map((group) => (
                  <div key={group.grade || "_"}>
                    {groups.length > 1 && (
                      <p className="sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {group.grade} · {group.rows.filter((person) => !absent.has(person.id)).length} of {group.rows.length} present
                      </p>
                    )}
                    <ul className="grid gap-px bg-line sm:grid-cols-2">
                      {group.shown.map((person) => {
                        const isAbsent = absent.has(person.id);
                        return (
                          <li key={person.id} className="bg-surface">
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => toggle(person.id)}
                              aria-pressed={isAbsent}
                              aria-label={`${person.name}: ${isAbsent ? "absent" : "present"}`}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-default ${isAbsent ? "bg-danger-soft" : "hover:bg-surface-2"}`}
                            >
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${isAbsent ? "bg-danger text-white" : "bg-success-soft text-success"}`}>
                                {isAbsent ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate text-sm font-medium ${isAbsent ? "text-danger line-through" : "text-ink"}`}>{person.name}</span>
                                {person.section && <span className="block text-xs text-muted">Section {person.section}</span>}
                              </span>
                              <span className={`shrink-0 text-xs font-semibold ${isAbsent ? "text-danger" : "text-success"}`}>{isAbsent ? "Absent" : "Present"}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 3 — send */}
        {!readOnly && (
          <div className="space-y-3">
            <StepTitle number={3} title="Send it to Praavyo" hint="Praavyo checks it and issues the certificates." />
            <div className="rounded-card border border-line bg-surface-2 p-3 text-sm sm:ml-10">
              <p className="text-ink">
                <span className="font-semibold text-success">{presentCount} {presentCount === 1 ? noun : `${noun}s`}</span> will get a certificate
                {absent.size > 0 && <>; <span className="font-semibold text-danger">{absent.size} absent</span> will not</>}.
              </p>
              {!trainingDay && <p className="mt-1 text-warning">Choose the training day in step 1 first.</p>}
            </div>
          </div>
        )}
        {readOnly && (
          <AlertBanner type="info" title="Sent to Praavyo" message="It can no longer be changed unless Praavyo sends it back to you." />
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 sm:px-5">
        <button type="button" onClick={() => onClose()} className="btn btn-ghost">Back</button>
        {!readOnly && (
          <>
            <button type="button" disabled={Boolean(saving)} onClick={() => save(false)} className="btn btn-secondary">{saving === "draft" ? "Saving…" : "Save for later"}</button>
            <button type="button" disabled={Boolean(saving) || !trainingDay || presentCount === 0} onClick={() => setConfirmSend(true)} className="btn btn-primary">
              <Send aria-hidden /> Send to Praavyo
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmSend}
        title="Send the attendance to Praavyo?"
        message={`${presentCount} present ${presentCount === 1 ? "gets a certificate" : "get certificates"}.${absentPeople.length ? ` Absent: ${absentPeople.map((person) => person.name).join(", ")}.` : " Nobody was absent."} After sending you cannot change it.`}
        confirmLabel="Send to Praavyo"
        tone="info"
        busy={saving === "send"}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => save(true)}
      />
    </section>
  );
}
