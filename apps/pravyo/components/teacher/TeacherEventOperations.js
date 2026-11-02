"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays as FaCalendarAlt, LoaderCircle as FaSpinner, Users as FaUsers } from "lucide-react";
import { formatShortDate, getEventStage, getStageClasses } from "@/lib/eventUiStatus";

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

export default function TeacherEventOperations() {
  const [events, setEvents] = useState([]);
  const [roundsByEvent, setRoundsByEvent] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load events");

      const loadedEvents = data.events || [];
      setEvents(loadedEvents);

      const roundResults = await Promise.all(
        loadedEvents.slice(0, 8).map(async (event) => {
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

  if (loading) {
    return (
      <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5 text-ink">
        <FaSpinner className="mr-2 inline animate-spin" />
        Loading assigned events...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {events.length === 0 ? (
          <div className="card px-5 py-10 text-center text-sm text-muted">
            No assigned events yet. Ask the school admin to assign you as a mentor
            on a school event.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {events.map((event) => {
              const stage = getEventStage(event);
              const rounds = roundsByEvent[event._id] || [];
              const activeRound = getActiveRound(rounds);
              return (
                <article
                  key={event._id}
                  className="card p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`badge badge-neutral text-xs ${
                        event.eventScope === "PLATFORM"
                          ? "border-brand-line bg-brand-soft text-brand"
                          : "border-brand-line bg-brand-soft text-brand"
                      }`}
                    >
                      {event.eventScope === "PLATFORM"
                        ? "Platform Competition"
                        : "School Event"}
                    </span>
                    <span className="badge badge-neutral text-xs">
                      {label(event.eventType)}
                    </span>
                  </div>

                  <h3 className="font-semibold text-ink">{event.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-subtle">
                    {event.description}
                  </p>

                  <div
                    className={`mt-4 rounded-card border px-3 py-2 text-sm ${getStageClasses(
                      stage.tone
                    )}`}
                  >
                    <div className="font-semibold">{stage.label}</div>
                    <div className="text-xs opacity-90">{stage.nextAction}</div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-ink">
                    <span className="inline-flex items-center gap-2">
                      <FaCalendarAlt className="text-muted" />
                      {formatShortDate(event.date)}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <FaUsers className="text-muted" />
                      {event.studentCount || event.studentCapacityCount || 0} students
                    </span>
                  </div>

                  {activeRound ? (
                    <div className="mt-4 rounded-card border border-line-strong bg-surface p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Current Round
                          </p>
                          <p className="font-semibold text-ink">
                            Round {activeRound.roundNumber}: {activeRound.title}
                          </p>
                        </div>
                        <span className="badge badge-success text-xs font-semibold">
                          {label(activeRound.status)}
                        </span>
                      </div>
                      <p className="text-sm text-subtle">
                        {nextRoundAction(activeRound)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-card border border-line-strong bg-surface p-4 text-sm text-subtle">
                      No rounds created yet.
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/school/events/${event._id}/manage`}
                      className="btn btn-primary inline-flex items-center gap-2 font-semibold"
                    >
                      Manage Event
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
