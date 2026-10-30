"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import Link from "next/link";
import { Bell as FaBell, CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Circle as FaCircle, ClipboardCheck as FaClipboardCheck, ListFilter as FaFilter, Globe as FaGlobe, Search as FaSearch, CircleX as FaTimesCircle, ToggleLeft as FaToggleOff, ToggleRight as FaToggleOn, Trophy as FaTrophy, UserPlus as FaUserPlus, Users as FaUsers } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AppDate from "@/components/common/AppDate";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import { isTeamEventLike } from "@/lib/eventParticipationFormat";
import {
  formatEventWorkflowStatus,
  getEventWorkflowStatus,
  isRegistrationOpen,
} from "@/lib/eventWorkflow";

function formatType(value) {
  return String(value || "EVENT").replaceAll("_", " ");
}

function formatGradeSummary(grades = []) {
  const visible = grades.filter(Boolean);
  if (visible.length === 0) return "All grades";
  if (visible.length <= 2) return visible.join(", ");
  return `${visible.length} grades`;
}

// The per-school invitation drives the school-side state of a platform event.
// A missing invitation behaves like a fresh, actionable one.
function getInvitationStatus(event) {
  return String(event.schoolInvitationStatus || "PENDING").toUpperCase();
}

function getSchoolRegistrationCount(event) {
  return Number(event.myParticipation?.studentCount || 0) || 0;
}

function getUnitLabel(event) {
  return isTeamEventLike(event) ? "Teams" : "Students";
}

function isArchivedEvent(event) {
  return String(event.lifecycleStatus || "ACTIVE").toUpperCase() === "ARCHIVED";
}

function isCompletedEvent(event) {
  return Boolean(event.resultsPublished);
}

function isLiveEvent(event) {
  return (
    !isArchivedEvent(event) &&
    !isCompletedEvent(event) &&
    ["REGISTRATION_CLOSED", "ROUND_ACTIVE", "RESULTS_DRAFT"].includes(
      getEventWorkflowStatus(event)
    )
  );
}

// "Joinable" means the school can still accept/decline and add students: the
// event is open for registration and has not started. Once it starts or the
// deadline passes, the invitation is no longer actionable.
function isJoinable(event) {
  return (
    !isArchivedEvent(event) &&
    !isCompletedEvent(event) &&
    isRegistrationOpen(event)
  );
}

// A single label that blends the school's invitation decision with the
// event stage, so a stale (started) invitation never looks actionable.
function getDisplayStatus(event) {
  if (String(event.lifecycleStatus || "").toUpperCase() === "CANCELLED") {
    return { label: "Cancelled", classes: "bg-danger-soft text-danger" };
  }
  const status = getInvitationStatus(event);
  if (status === "APPROVED") {
    return { label: "Joined", classes: "bg-success-soft text-success" };
  }
  if (status === "DISAPPROVED") {
    return { label: "Declined", classes: "bg-danger-soft text-danger" };
  }
  if (status === "WITHDRAWN") {
    return { label: "Closed", classes: "bg-surface-2 text-muted" };
  }
  // PENDING
  if (isJoinable(event)) {
    return { label: "Invitation", classes: "bg-warning-soft text-warning" };
  }
  return { label: "Missed", classes: "bg-surface-2 text-muted" };
}

function isOpenInvitation(event) {
  return getInvitationStatus(event) === "PENDING" && isJoinable(event);
}

// Each sub-tab that carries a "new activity" red dot maps to a seen-surface;
// clicking the tab clears that surface.
const TAB_SEEN_SURFACE = {
  INVITATIONS: "school.eventInvitations",
  COMPLETED: "school.eventResults",
};

export default function PlatformEventsManager() {
  const { markSurfaceSeen, getIndicator } = useWorkIndicators();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useRememberedState("platform-events:status", "ALL");
  const [search, setSearch] = useRememberedState("platform-events:search", "");
  const [typeFilter, setTypeFilter] = useRememberedState("platform-events:type", "");
  const [gradeFilter, setGradeFilter] = useRememberedState("platform-events:grade", "");
  const [showFilters, setShowFilters] = useRememberedState("platform-events:show-filters", true);
  const [feedback, setFeedback] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [declineTarget, setDeclineTarget] = useState(null);

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) {
        setEvents([]);
        return;
      }
      const data = await res.json();
      const platformEvents = (data.events || []).filter(
        (event) => event.eventScope === "PLATFORM"
      );
      setEvents(platformEvents);
    } catch (error) {
      console.error("Failed to load platform events", error);
      setFeedback({
        type: "error",
        title: "Platform events could not be loaded",
        message: "Please retry or check the server connection.",
      });
      setEvents([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Clear the "new invitations" badge once the school opens this surface.
  useEffect(() => {
    void markSurfaceSeen("school.platformEvents");
  }, [markSurfaceSeen]);

  useRealtimeChannel(
    "events",
    useCallback(
      (message) => {
        const payload = message?.payload || {};
        if (payload.eventScope && payload.eventScope !== "PLATFORM") return;
        void loadEvents({ silent: true });
      },
      [loadEvents]
    )
  );

  const decideInvitation = useCallback(
    async (event, action) => {
      try {
        setBusyId(event._id);
        setFeedback(null);
        const res = await fetch(`/api/events/${event._id}/school-invitation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Could not update this event.");
        }
        setFeedback({
          type: "success",
          title: action === "approve" ? "Event joined" : "Event left",
          message: data.message || "Your school decision was saved.",
        });
        await loadEvents({ silent: true });
      } catch (error) {
        setFeedback({
          type: "error",
          title: "Action failed",
          message: error.message || "Please retry.",
        });
      } finally {
        setBusyId("");
      }
    },
    [loadEvents]
  );

  const toggleSelfRegistration = useCallback(
    async (event) => {
      try {
        setBusyId(event._id);
        setFeedback(null);
        const next = !event.studentSelfRegistration;
        const res = await fetch(`/api/events/${event._id}/school-invitation`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentSelfRegistration: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Could not update this setting.");
        }
        setFeedback({
          type: "success",
          title: next
            ? "Student registration enabled"
            : "Student registration disabled",
          message: data.message || "Your setting was saved.",
        });
        await loadEvents({ silent: true });
      } catch (error) {
        setFeedback({
          type: "error",
          title: "Action failed",
          message: error.message || "Please retry.",
        });
      } finally {
        setBusyId("");
      }
    },
    [loadEvents]
  );

  const selectTab = useCallback(
    (key) => {
      setActiveFilter(key);
      const surface = TAB_SEEN_SURFACE[key];
      if (surface) void markSurfaceSeen(surface);
    },
    [markSurfaceSeen, setActiveFilter]
  );

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((event) => event.eventType).filter(Boolean))),
    [events]
  );

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set(events.flatMap((event) => event.eligibleGrades || []).filter(Boolean))
      ),
    [events]
  );

  // A platform event matches a stage bucket as follows. INVITATIONS are only
  // the open, still-joinable ones; ALL excludes archived (like School Events).
  const matchesBucket = useCallback((event, key) => {
    const joined = getInvitationStatus(event) === "APPROVED";
    switch (key) {
      case "ALL":
        return !isArchivedEvent(event);
      case "INVITATIONS":
        return isOpenInvitation(event);
      case "REGISTRATION":
        return joined && isJoinable(event);
      case "LIVE":
        return isLiveEvent(event);
      case "COMPLETED":
        return isCompletedEvent(event) && !isArchivedEvent(event);
      case "DECLINED":
        return ["DISAPPROVED", "WITHDRAWN"].includes(
          getInvitationStatus(event)
        );
      default:
        return true;
    }
  }, []);

  const metrics = useMemo(() => {
    const count = (key) => events.filter((event) => matchesBucket(event, key)).length;
    return {
      total: count("ALL"),
      invitations: count("INVITATIONS"),
      registration: count("REGISTRATION"),
      live: count("LIVE"),
      completed: count("COMPLETED"),
      declined: count("DECLINED"),
    };
  }, [events, matchesBucket]);

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesFilter = matchesBucket(event, activeFilter);
      const matchesSearch =
        !needle ||
        String(event.title || "").toLowerCase().includes(needle) ||
        String(event.description || "").toLowerCase().includes(needle);
      const matchesType = !typeFilter || event.eventType === typeFilter;
      const matchesGrade =
        !gradeFilter || (event.eligibleGrades || []).includes(gradeFilter);
      return matchesFilter && matchesSearch && matchesType && matchesGrade;
    });
  }, [activeFilter, events, gradeFilter, matchesBucket, search, typeFilter]);

  const metricCards = [
    {
      key: "INVITATIONS",
      label: "Invitations",
      value: metrics.invitations,
      note: "Awaiting your decision",
      icon: FaBell,
      tone: "amber",
    },
    {
      key: "REGISTRATION",
      label: "Registration Open",
      value: metrics.registration,
      note: "Joined — add students",
      icon: FaUserPlus,
      tone: "emerald",
    },
    {
      key: "COMPLETED",
      label: "Completed",
      value: metrics.completed,
      note: "Results / certificates",
      icon: FaTrophy,
      tone: "indigo",
    },
    {
      key: "DECLINED",
      label: "Declined",
      value: metrics.declined,
      note: "Rejoin while open",
      icon: FaTimesCircle,
      tone: "rose",
    },
  ];

  const metricTones = {
    indigo: "border-brand-line bg-brand-soft text-brand-strong",
    emerald: "border-success-line bg-success-soft text-success",
    amber: "border-warning-line bg-warning-soft text-warning",
    rose: "border-danger-line bg-danger-soft text-danger",
    slate: "border-line bg-surface-2 text-ink",
  };

  const filterTabs = [
    ["LIVE", "Live", FaCircle, metrics.live],
    ["INVITATIONS", "Invitations", FaBell, metrics.invitations],
    ["REGISTRATION", "Registration Open", FaUserPlus, metrics.registration],
    ["ALL", "All Events", FaGlobe, metrics.total],
    ["COMPLETED", "Completed", FaTrophy, metrics.completed],
    ["DECLINED", "Declined", FaTimesCircle, metrics.declined],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-xl text-brand-strong">
            <FaGlobe />
          </span>
          <div>
            <h1 className="font-semibold text-ink">Platform Events</h1>
            <p className="mt-1 text-sm text-muted">
              Competitions hosted by Praavyo. Join the ones you want, then register
              and manage your students.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => selectTab(card.key)}
              className={` card transition-colors hover:border-brand-line hover:bg-surface-2 p-4 text-left transition-colors hover:border-brand-line ${
                activeFilter === card.key ? "" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${
                    metricTones[card.tone]
                  }`}
                >
                  <Icon />
                </span>
                <span className="min-w-0">
                  <strong className="block text-2xl font-semibold text-ink">
                    {card.value}
                  </strong>
                  <span className="block truncate text-sm font-semibold text-ink">
                    {card.label}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-muted">
                    {card.note}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
        />
      )}

      <section className="card overflow-hidden">
        <div className="border-b border-line">
          <div className="flex flex-wrap gap-0 px-4">
            {filterTabs.map(([key, label, Icon, count]) => {
              // Count pills tell the school exactly which tab a notification was
              // for: Invitations (decision needed) and Registration Open (add
              // students) are the action tabs and get a coloured pill.
              const pillTone =
                key === "INVITATIONS"
                  ? "bg-brand-soft text-brand-strong"
                  : key === "REGISTRATION"
                  ? "bg-success-soft text-success"
                  : "bg-surface-2 text-muted";
              // Red "new activity here" dot — seen-based per tab; clears once
              // you open that tab and returns only when something new lands.
              const seenSurface = TAB_SEEN_SURFACE[key];
              const showDot =
                Boolean(seenSurface) &&
                getIndicator(seenSurface).count > 0 &&
                activeFilter !== key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTab(key)}
                  className={`relative inline-flex min-h-14 items-center gap-2 px-5 text-sm font-semibold transition-colors ${
                    activeFilter === key
                      ? "text-brand-strong after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:rounded-full after:bg-brand"
                      : "text-ink hover:bg-surface hover:text-brand-strong"
                  }`}
                >
                  <span className="relative inline-flex">
                    <Icon />
                    {showDot && (
                      <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-danger" />
                    )}
                  </span>
                  {label}
                  {count > 0 && (
                    <span
                      className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold ${pillTone}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_auto_auto]">
            <div className="relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search platform events..."
                className="input w-full pl-11 pr-4 transition-colors"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={`input transition-colors ${
                showFilters ? "" : "hidden"
              }`}
            >
              <option value="">All Types</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {formatType(type)}
                </option>
              ))}
            </select>
            <select
              value={gradeFilter}
              onChange={(event) => setGradeFilter(event.target.value)}
              className={`input transition-colors ${
                showFilters ? "" : "hidden"
              }`}
            >
              <option value="">All Grades</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setGradeFilter("");
              }}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaFilter />
              Filters
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <LoadingState
              title="Loading platform events"
              message="Preparing invitations from Praavyo competitions."
            />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={FaGlobe}
              title="No platform events found"
              description="When Praavyo publishes a competition for your school, it will appear here to join. Adjust filters to see more."
            />
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => {
                const status = getInvitationStatus(event);
                const meta = getDisplayStatus(event);
                const isTeamEvent = isTeamEventLike(event);
                const workflowStatus = getEventWorkflowStatus(event);
                const stageLabel = formatEventWorkflowStatus(workflowStatus);
                const gradeSummary = formatGradeSummary(event.eligibleGrades || []);
                const gradeTitle =
                  event.eligibleGrades?.length > 0
                    ? event.eligibleGrades.join(", ")
                    : "All grades";
                const registered = getSchoolRegistrationCount(event);
                const totalParticipants = Number(event.studentCount || 0) || 0;
                const schoolCount = Number(event.schoolCount || 0) || 0;
                const isBusy = busyId === event._id;
                const isApproved = status === "APPROVED";
                const isWithdrawn = status === "WITHDRAWN";
                const joinable = isJoinable(event);
                // Pending or previously-declined schools may (re)join only while
                // the event is still open. Started events are no longer joinable.
                const canJoin =
                  ["PENDING", "DISAPPROVED"].includes(status) && joinable;
                const registrationClosedForJoin =
                  ["PENDING", "DISAPPROVED"].includes(status) && !joinable;
                const manageHref = `/school/events/${event._id}/manage`;

                const rowStats = [
                  ["Your Status", meta.label, isApproved ? "Participating" : "Decision"],
                  [
                    "Your Entries",
                    isApproved ? registered : "—",
                    isApproved ? getUnitLabel(event) : "After joining",
                  ],
                  ["Schools", schoolCount, schoolCount === 1 ? "Joined" : "Joined"],
                  ["Participants", totalParticipants, "Platform-wide"],
                  ["Stage", stageLabel, "Event progress"],
                ];

                const steps = [
                  {
                    label: "Joined",
                    active: status === "PENDING",
                    complete: isApproved,
                  },
                  {
                    label: "Registration",
                    active:
                      isApproved &&
                      ["OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED"].includes(
                        workflowStatus
                      ),
                    complete:
                      isApproved &&
                      !["DRAFT", "OPEN_FOR_REGISTRATION"].includes(workflowStatus),
                  },
                  {
                    label: "Rounds",
                    active: workflowStatus === "ROUND_ACTIVE",
                    complete: [
                      "RESULTS_DRAFT",
                      "RESULTS_PUBLISHED",
                      "COMPLETED",
                    ].includes(workflowStatus),
                  },
                  {
                    label: "Results",
                    active: workflowStatus === "RESULTS_DRAFT",
                    complete: ["RESULTS_PUBLISHED", "COMPLETED"].includes(
                      workflowStatus
                    ),
                  },
                  {
                    label: "Completed",
                    active: false,
                    complete:
                      event.resultsPublished ||
                      ["ARCHIVED"].includes(
                        String(event.lifecycleStatus || "").toUpperCase()
                      ),
                  },
                ];

                return (
                  <div
                    key={event._id}
                    className="card overflow-hidden transition-colors hover:border-brand-line"
                  >
                    <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(360px,1.18fr)_minmax(520px,1fr)_210px] xl:items-start">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-lg text-brand-strong">
                          {event.resultsPublished ? <FaTrophy /> : <FaGlobe />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="max-w-[260px] truncate font-semibold text-ink">
                              {event.title}
                            </h3>
                            <span className="badge badge-brand uppercase">
                              {formatType(event.eventType)}
                            </span>
                            <span
                              className={`badge badge-neutral uppercase ${meta.classes}`}
                            >
                              {meta.label}
                            </span>
                            <span className="badge badge-neutral uppercase">
                              {isTeamEvent ? "Team Event" : "Individual Event"}
                            </span>
                            <span
                              title={gradeTitle}
                              className="badge badge-brand max-w-[180px] truncate uppercase"
                            >
                              {gradeSummary}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-1 text-sm text-muted">
                            {event.description || "No event description added yet."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <FaCalendarAlt />
                              <AppDate value={event.date} fallback="Not set" />
                            </span>
                            {event.registrationDeadline && (
                              <span className="inline-flex items-center gap-1.5">
                                <FaClipboardCheck />
                                Register by <AppDate value={event.registrationDeadline} fallback="Not set" />
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1.5">
                              <FaUsers />
                              {totalParticipants} {getUnitLabel(event)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="min-h-[96px] border-l border-line pl-4">
                        <div className="grid grid-cols-5 gap-0 divide-line">
                          {rowStats.map(([label, value, detail]) => (
                            <div key={label} className="min-w-0 px-3 first:pl-0">
                              <p className="truncate text-2xs font-semibold text-muted">
                                {label}
                              </p>
                              <p className="mt-1 truncate text-base font-semibold text-ink">
                                {value}
                              </p>
                              <p className="truncate text-2xs font-semibold text-muted">
                                {detail}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 border-t border-line pt-2">
                          <div className="flex flex-wrap gap-3 text-2xs font-semibold text-muted">
                            {steps.map((step) => (
                              <span
                                key={step.label}
                                className="inline-flex items-center gap-1.5"
                              >
                                <FaCircle
                                  className={
                                    step.active
                                      ? "text-brand-strong"
                                      : step.complete
                                      ? "text-success"
                                      : "text-subtle"
                                  }
                                />
                                {step.label}
                              </span>
                            ))}
                          </div>
                          {isApproved && joinable && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setDeclineTarget(event)}
                                className="btn btn-ghost btn-sm inline-flex items-center gap-2 transition-colors"
                              >
                                <FaTimesCircle />
                                Leave Event
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="relative flex flex-col gap-2 border-l border-line pl-4">
                        {isWithdrawn ? (
                          <span className="inline-flex min-h-10 items-center justify-center rounded-control bg-surface-2 px-4 text-xs font-semibold text-muted">
                            No longer available
                          </span>
                        ) : isApproved ? (
                          <>
                            {joinable ? (
                              <Link
                                href={`${manageHref}?tab=registrations`}
                                className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                <FaUserPlus />
                                Register Students
                              </Link>
                            ) : (
                              <Link
                                href={manageHref}
                                className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                <FaClipboardCheck />
                                View Event
                              </Link>
                            )}
                            {joinable && (
                              <Link
                                href={manageHref}
                                className="btn btn-ghost btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                <FaClipboardCheck />
                                View Event
                              </Link>
                            )}
                            {joinable && !isTeamEvent && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => toggleSelfRegistration(event)}
                                title="When on, your eligible students can enroll themselves and withdraw. You still register students by default."
                                className={`btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5 transition-colors ${
                                  event.studentSelfRegistration
                                    ? "border-success-line bg-success-soft text-success hover:bg-success-soft"
                                    : "border-line bg-surface text-muted hover:bg-surface"
                                }`}
                              >
                                {event.studentSelfRegistration ? (
                                  <FaToggleOn />
                                ) : (
                                  <FaToggleOff />
                                )}
                                {event.studentSelfRegistration
                                  ? "Self-enroll On"
                                  : "Self-enroll Off"}
                              </button>
                            )}
                          </>
                        ) : canJoin ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => decideInvitation(event, "approve")}
                              className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                            >
                              <FaCheckCircle />
                              {isBusy
                                ? "Joining..."
                                : status === "DISAPPROVED"
                                ? "Rejoin Event"
                                : "Join Event"}
                            </button>
                            {status === "PENDING" && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => decideInvitation(event, "decline")}
                                className="btn btn-ghost btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                Decline
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex min-h-10 items-center justify-center rounded-control bg-surface-2 px-4 text-center text-2xs font-semibold text-muted">
                            {registrationClosedForJoin
                              ? "Registration closed"
                              : "View only"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(declineTarget)}
        title="Leave this platform event?"
        message={
          declineTarget
            ? `Your school will leave "${declineTarget.title}". Any students you registered for this event will be withdrawn. You can rejoin later while registration is open.`
            : ""
        }
        confirmLabel="Leave event"
        tone="danger"
        onClose={() => setDeclineTarget(null)}
        onConfirm={() => {
          const target = declineTarget;
          setDeclineTarget(null);
          if (target) void decideInvitation(target, "decline");
        }}
      />
    </div>
  );
}
