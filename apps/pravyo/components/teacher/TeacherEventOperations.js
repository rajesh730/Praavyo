"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Circle as FaCircle, Clock as FaClock, Trophy as FaTrophy, UserCheck as FaUserCheck, Users as FaUsers } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import EventFilterBar from "@/components/events/EventFilterBar";
import EventListCard from "@/components/events/EventListCard";
import { formatShortDate, getEventPublicStatus, getEventStage, getStageClasses } from "@/lib/eventUiStatus";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";

function label(value) {
  return String(value || "").replaceAll("_", " ");
}

function roundStats(round) {
  const participants = round.participants || [];
  return {
    total: participants.length,
    submitted: participants.filter(
      (participant) =>
        participant.status === "SUBMITTED" ||
        Boolean(participant.submission?.submissionUrl)
    ).length,
    selected: participants.filter((participant) =>
      ["SELECTED", "FINALIST", "WINNER", "RUNNER_UP", "THIRD_PLACE"].includes(
        participant.status
      )
    ).length,
  };
}

function getActiveRound(rounds) {
  return (
    rounds.find((round) =>
      ["OPEN_FOR_SUBMISSION", "IN_PROGRESS", "JUDGING"].includes(round.status)
    ) ||
    rounds.find((round) => round.status !== "COMPLETED") ||
    rounds[rounds.length - 1]
  );
}

function nextRoundAction(round) {
  if (!round) return "Create rounds from the event management workspace.";
  const stats = roundStats(round);
  if (stats.total === 0) return "Generate participants for this round.";
  if (round.mode === "ONLINE_SUBMISSION" && stats.submitted === 0) {
    return "Watch for submissions.";
  }
  if (["OPEN_FOR_SUBMISSION", "IN_PROGRESS", "JUDGING"].includes(round.status)) {
    return "Review submissions or attendance and mark selected students.";
  }
  if (round.status === "SHORTLIST_PUBLISHED") {
    return "Move selected students forward or prepare final results.";
  }
  return "Check notices, participants, and upcoming schedule.";
}

/**
 * Live / Upcoming / Completed for the tabs. Not getEventPublicStatus: that one
 * only calls PLATFORM events with public results "completed", so a school
 * event with published results would sit under Live.
 */
function statusKey(event) {
  const workflow = String(event.eventWorkflowStatus || "").toUpperCase();
  const lifecycle = String(event.lifecycleStatus || "ACTIVE").toUpperCase();
  if (
    event.resultsPublished ||
    ["RESULTS_PUBLISHED", "COMPLETED"].includes(workflow) ||
    ["COMPLETED", "ARCHIVED"].includes(lifecycle)
  ) {
    return "completed";
  }
  if (["ROUND_ACTIVE", "RESULTS_DRAFT"].includes(workflow)) return "live";
  // Not started yet: its date (or registration) is still ahead.
  return getEventPublicStatus(event).key === "registration-open" ? "registration-open" : "live";
}

export default function TeacherEventOperations() {
  const [events, setEvents] = useState([]);
  const [roundsByEvent, setRoundsByEvent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useRememberedState("teacher-events:filter", "MINE");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useRememberedState("teacher-events:type", "");
  const [gradeFilter, setGradeFilter] = useRememberedState("teacher-events:grade", "");
  const [showFilters, setShowFilters] = useRememberedState("teacher-events:show-filters", true);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load events");

      // Events the school gave this teacher come first; the rest are listed
      // for information only.
      const loadedEvents = [...(data.events || [])].sort(
        (a, b) => Number(Boolean(b.canManage)) - Number(Boolean(a.canManage))
      );
      setEvents(loadedEvents);

      // Round details are only readable by the teachers managing the event.
      const roundResults = await Promise.all(
        loadedEvents.filter((event) => event.canManage).slice(0, 8).map(async (event) => {
          try {
            const roundRes = await fetch(`/api/events/${event._id}/rounds`, {
              cache: "no-store",
            });
            const roundData = await roundRes.json();
            return [
              event._id,
              roundRes.ok && Array.isArray(roundData.rounds)
                ? roundData.rounds
                : [],
            ];
          } catch {
            return [event._id, []];
          }
        })
      );

      setRoundsByEvent(Object.fromEntries(roundResults));
    } catch (loadError) {
      setError(loadError.message);
      setEvents([]);
      setRoundsByEvent({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // The school can add or remove this teacher from an event at any time; the
  // Manage Event button follows without a reload.
  useRealtimeChannel("events", loadEvents);

  const counts = useMemo(() => ({
    MINE: events.filter((event) => event.canManage).length,
    live: events.filter((event) => statusKey(event) === "live").length,
    "registration-open": events.filter((event) => statusKey(event) === "registration-open").length,
    completed: events.filter((event) => statusKey(event) === "completed").length,
    ALL: events.length,
  }), [events]);
  const typeOptions = useMemo(() => [...new Set(events.map((event) => event.eventType).filter(Boolean))].sort(), [events]);
  const gradeOptions = useMemo(
    () => [...new Set(events.flatMap((event) => event.eligibleGrades || []).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    [events]
  );

  // With nothing assigned, "Managed by me" would only ever be empty.
  const filter = activeFilter === "MINE" && counts.MINE === 0 && !loading ? "ALL" : activeFilter;
  const needle = search.trim().toLowerCase();
  const filteredEvents = events.filter((event) =>
    (filter === "ALL" || (filter === "MINE" ? event.canManage : statusKey(event) === filter))
    && (!typeFilter || event.eventType === typeFilter)
    && (!gradeFilter || !(event.eligibleGrades?.length) || event.eligibleGrades.includes(gradeFilter))
    && (!needle || [event.title, event.description, event.eventType].some((value) => String(value || "").toLowerCase().includes(needle))));

  const tabs = [
    { key: "MINE", label: "Managed by Me", icon: FaUserCheck, count: counts.MINE },
    { key: "live", label: "Live", icon: FaCircle, count: counts.live },
    { key: "registration-open", label: "Upcoming", icon: FaClock, count: counts["registration-open"] },
    { key: "completed", label: "Completed", icon: FaCheckCircle, count: counts.completed },
    { key: "ALL", label: "All Events", icon: FaCalendarAlt, count: counts.ALL },
  ];

  return (
    <div className="space-y-4">
      {error && <AlertBanner type="error" title="Events unavailable" message={error} />}

      <section className="card overflow-hidden">
        <EventFilterBar
          tabs={tabs}
          activeFilter={filter}
          onFilterChange={setActiveFilter}
          search={search}
          onSearchChange={setSearch}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          gradeFilter={gradeFilter}
          onGradeChange={setGradeFilter}
          gradeOptions={gradeOptions}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((value) => !value)}
          onClear={() => {
            setSearch("");
            setTypeFilter("");
            setGradeFilter("");
          }}
        />

        <div className="p-4">
          {loading ? (
            <LoadingState title="Loading assigned events" message="Checking the events your school gave you to run." />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={FaCalendarAlt}
              title={events.length === 0 ? "No events yet" : "No events match these filters"}
              description={
                events.length === 0
                  ? "When your school picks you to manage an event, it appears here with a Manage Event button."
                  : "Try another tab or clear the filters to see more events."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => {
                const stage = getEventStage(event);
                const rounds = roundsByEvent[event._id] || [];
                const activeRound = getActiveRound(rounds);
                const gradeSummary = event.eligibleGrades?.length ? event.eligibleGrades.join(", ") : "All grades";
                return (
                  <EventListCard key={event._id}>
                    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px] lg:items-start">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-lg text-brand-strong">
                          {event.resultsPublished ? <FaTrophy aria-hidden /> : <FaCalendarAlt aria-hidden />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate font-semibold text-ink">{event.title}</h3>
                            <span className="badge badge-brand text-xs uppercase">
                              {event.eventScope === "PLATFORM" ? "Platform Competition" : "School Event"}
                            </span>
                            <span className="badge badge-neutral text-xs uppercase">{label(event.eventType)}</span>
                            {event.canManage && <span className="badge badge-success text-xs">You manage this</span>}
                          </div>
                          {event.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted">{event.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted">
                            <span className="inline-flex items-center gap-1.5"><FaCalendarAlt aria-hidden size={13} /> {formatShortDate(event.date)}</span>
                            <span className="inline-flex items-center gap-1.5"><FaUsers aria-hidden size={13} /> {event.studentCount || event.studentCapacityCount || 0} students</span>
                            <span className="truncate" title={gradeSummary}>{gradeSummary}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className={`rounded-card border px-3 py-2 text-sm ${getStageClasses(stage.tone)}`}>
                          <div className="font-semibold">{stage.label}</div>
                          <div className="text-xs opacity-90">{stage.nextAction}</div>
                        </div>
                        {event.canManage && (activeRound ? (
                          <div className="rounded-card border border-line-strong bg-surface px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="min-w-0 truncate text-sm font-semibold text-ink">
                                Round {activeRound.roundNumber}: {activeRound.title}
                              </p>
                              <span className="badge badge-success shrink-0 text-xs">{label(activeRound.status)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted">{nextRoundAction(activeRound)}</p>
                          </div>
                        ) : (
                          <p className="rounded-card border border-line-strong bg-surface px-3 py-2 text-xs text-muted">No rounds created yet.</p>
                        ))}
                      </div>

                      <div className="flex lg:justify-end">
                        {event.canManage ? (
                          <Link
                            href={`/school/events/${event._id}/manage`}
                            className="btn btn-primary inline-flex w-full items-center justify-center gap-2 font-semibold lg:w-auto"
                          >
                            Manage Event
                          </Link>
                        ) : (
                          <p className="text-xs text-muted lg:text-right">
                            Managed by your school. Ask the school office if you should help run it.
                          </p>
                        )}
                      </div>
                    </div>
                  </EventListCard>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
