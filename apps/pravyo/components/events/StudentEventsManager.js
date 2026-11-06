"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import Link from "next/link";
import { Bell as FaBell, CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Circle as FaCircle, Eye as FaEye, LogOut as FaSignOutAlt, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import AppDate from "@/components/common/AppDate";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import { isTeamEventLike } from "@/lib/eventParticipationFormat";
import {
  formatEventWorkflowStatus,
  getEventNextActionLabel,
  getEventWorkflowStatus,
} from "@/lib/eventWorkflow";
import EventFilterBar from "@/components/events/EventFilterBar";
import EventListCard from "@/components/events/EventListCard";
import {
  isCompletedEvent,
  isLiveEvent,
  isRegistrationOpenEvent,
  isTerminalEvent,
  matchesEventFacets,
  matchesEventListFilter,
} from "@/lib/eventListTaxonomy";

// Sub-tabs that carry a "new activity" red dot map to a seen-surface.
const TAB_SEEN_SURFACE = {
  COMPLETED: "student.eventResults",
};

function formatType(value) {
  return String(value || "EVENT").replaceAll("_", " ");
}

function getRegisteredCount(event) {
  return Number(event.enrolled ?? event.studentCapacityCount ?? event.studentCount ?? 0) || 0;
}

function getEventUnitLabel(event) {
  return isTeamEventLike(event) ? "Teams" : "Students";
}

function formatGradeSummary(grades = []) {
  const visibleGrades = grades.filter(Boolean);
  if (visibleGrades.length === 0) return "All grades";
  if (visibleGrades.length <= 2) return visibleGrades.join(", ");
  return `${visibleGrades.length} grades`;
}

function isCancelled(event) {
  return String(event.lifecycleStatus || "ACTIVE").toUpperCase() === "CANCELLED";
}

function getStudentStatus(event) {
  if (event.participationStatus) return event.participationStatus;
  if (event.isGradeEligible === false) return "NOT_ELIGIBLE";
  if (event.canRequest) return "CAN_ENROLL";
  return "SCHOOL_MANAGED";
}

function formatStudentStatus(status) {
  const labels = {
    PENDING: "Pending",
    APPROVED: "Registered",
    ENROLLED: "Enrolled",
    REJECTED: "Declined",
    NOT_ELIGIBLE: "Not for your grade",
    CAN_ENROLL: "Can enroll",
    SCHOOL_MANAGED: "School managed",
  };
  return labels[status] || formatType(status);
}

function statusClasses(status) {
  if (["APPROVED", "ENROLLED"].includes(status)) {
    return "bg-success-soft text-success";
  }
  if (status === "PENDING") return "bg-warning-soft text-warning";
  if (status === "REJECTED" || status === "NOT_ELIGIBLE") {
    return "bg-danger-soft text-danger";
  }
  if (status === "CAN_ENROLL") return "bg-brand-soft text-brand-strong";
  return "bg-surface-2 text-muted";
}

function getStudentNextAction(event) {
  if (isCancelled(event))
    return "This event was cancelled. Your registration was withdrawn.";
  if (isCompletedEvent(event)) return "Review final result and certificates.";
  if (event.participationStatus) return "Follow notices, rounds, and event updates.";
  if (event.isGradeEligible === false) {
    return event.ineligibilityReason || "This event is outside your grade eligibility.";
  }
  if (event.canRequest) return "Enroll before registration closes.";
  return "Your school manages registration for this event.";
}

export default function StudentEventsManager() {
  const { getIndicator, markSurfaceSeen } = useWorkIndicators();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useRememberedState("student-events:status", "ALL");
  const [search, setSearch] = useRememberedState("student-events:search", "");
  const [typeFilter, setTypeFilter] = useRememberedState("student-events:type", "");
  const [gradeFilter, setGradeFilter] = useRememberedState("student-events:grade", "");
  const [showFilters, setShowFilters] = useRememberedState("student-events:show-filters", true);
  const [feedback, setFeedback] = useState(null);
  const [certificateLoadingId, setCertificateLoadingId] = useState("");

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/events/hub/available", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Student events could not be loaded.");
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Events could not be loaded",
        message: error.message || "Please retry or check the server connection.",
      });
      setEvents([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useRealtimeChannel(
    "events",
    useCallback(() => {
      void loadEvents({ silent: true });
    }, [loadEvents])
  );

  const enroll = async (event) => {
    try {
      setFeedback(null);
      const res = await fetch(`/api/events/${event._id}/participate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Enrollment failed.");
      setFeedback({
        type: "success",
        title: "Enrollment complete",
        message: `You are enrolled in ${event.title}.`,
      });
      await loadEvents({ silent: true });
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Enrollment failed",
        message: error.message || "Please retry after checking registration rules.",
      });
    }
  };

  const withdraw = async (event) => {
    if (!window.confirm(`Withdraw from "${event.title || "this event"}"?\n\nYour participation request will be removed.`)) return;
    try {
      setFeedback(null);
      const res = await fetch(`/api/events/${event._id}/participate`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || data.message || "Withdrawal failed.");
      setFeedback({
        type: "success",
        title: "Withdrawn",
        message: `You have withdrawn from ${event.title}.`,
      });
      await loadEvents({ silent: true });
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Withdrawal failed",
        message: error.message || "Please retry after checking registration rules.",
      });
    }
  };

  const openStudentCertificate = async (event) => {
    try {
      setCertificateLoadingId(event._id);
      setFeedback(null);
      const res = await fetch(`/api/events/${event._id}/certificates/student`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Certificate could not be loaded.");
      }

      const certificates = Array.isArray(data.certificates) ? data.certificates : [];
      const certificate = certificates.find((item) => item.certificateUrl);
      if (!certificate) {
        throw new Error(
          data.resultState || "No issued certificate is assigned to your account yet."
        );
      }

      window.open(certificate.certificateUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback({
        type: "warning",
        title: "Certificate unavailable",
        message: error.message || "No certificate is assigned to your account yet.",
      });
    } finally {
      setCertificateLoadingId("");
    }
  };

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

  const metrics = useMemo(() => {
    const activeRecords = events.filter((event) => !isTerminalEvent(event));
    return {
      live: events.filter(isLiveEvent).length,
      registrationOpen: events.filter(isRegistrationOpenEvent).length,
      myEvents: events.filter((event) => Boolean(event.participationStatus)).length,
      completed: events.filter(isCompletedEvent).length,
      activeRecords: activeRecords.length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(
      (event) =>
        matchesEventListFilter(event, activeFilter, {
          isMine: Boolean(event.participationStatus),
        }) &&
        matchesEventFacets(event, {
          search,
          type: typeFilter,
          grade: gradeFilter,
        })
    );
  }, [activeFilter, events, gradeFilter, search, typeFilter]);

  const filterTabs = [
    { key: "LIVE", label: "Live", icon: FaCircle, count: metrics.live },
    { key: "REGISTRATION", label: "Registration Open", icon: FaUsers, count: metrics.registrationOpen },
    { key: "ALL", label: "All Events", icon: FaCalendarAlt, count: metrics.activeRecords },
    { key: "MINE", label: "My Events", icon: FaCheckCircle, count: metrics.myEvents },
    { key: "COMPLETED", label: "Completed", icon: FaTrophy, count: metrics.completed, surface: TAB_SEEN_SURFACE.COMPLETED },
  ];

  return (
    <div className="space-y-4">
      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
        />
      )}

      <section className="card overflow-hidden">
        <EventFilterBar
          tabs={filterTabs}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          search={search}
          onSearchChange={setSearch}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={eventTypes}
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
          getNotificationCount={(surface) => getIndicator(surface).count}
          onSurfaceSeen={(surface) => void markSurfaceSeen(surface)}
        />

        <div className="p-4">
          {loading ? (
            <LoadingState
              title="Loading student events"
              message="Preparing registrations, notices, rounds, and results."
            />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={FaCalendarAlt}
              title="No student events found"
              description="Adjust filters or check again after your school publishes an event."
            />
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => {
                const workflowStatus = getEventWorkflowStatus(event);
                const registered = getRegisteredCount(event);
                const studentStatus = getStudentStatus(event);
                const currentStage = formatEventWorkflowStatus(workflowStatus);
                const gradeSummary = formatGradeSummary(event.eligibleGrades || []);
                const gradeTitle =
                  event.eligibleGrades?.length > 0
                    ? event.eligibleGrades.join(", ")
                    : "All grades";
                const finished = isCompletedEvent(event);
                const cancelled = isCancelled(event);
                const primaryHref = `/student/events/${event._id}${
                  finished ? "?tab=results" : ""
                }`;
                const rowStats = [
                  ["Registration", formatStudentStatus(studentStatus), finished ? "Finished" : "Student status"],
                  ["Participants", registered, getEventUnitLabel(event)],
                  ["Stage", currentStage, finished ? "Finished" : "In progress"],
                  ["Results", finished ? "Published" : "Pending", finished ? "Ready" : "-"],
                  ["Certificates", finished ? "Available" : "Pending", finished ? "Ready" : "-"],
                ];
                const steps = [
                  {
                    label: "Registration",
                    active: ["OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED"].includes(workflowStatus),
                    complete: !["DRAFT", "OPEN_FOR_REGISTRATION"].includes(workflowStatus),
                  },
                  {
                    label: "Rounds",
                    active: workflowStatus === "ROUND_ACTIVE",
                    complete: ["RESULTS_DRAFT", "RESULTS_PUBLISHED", "COMPLETED"].includes(workflowStatus),
                  },
                  {
                    label: "Results",
                    active: workflowStatus === "RESULTS_DRAFT",
                    complete: ["RESULTS_PUBLISHED", "COMPLETED"].includes(workflowStatus),
                  },
                  {
                    label: "Certificates",
                    active: false,
                    complete: finished,
                  },
                ];

                return (
                  <EventListCard
                    key={event._id}
                  >
                    <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(360px,1.18fr)_minmax(520px,1fr)_190px] xl:items-start">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-lg text-brand-strong">
                          {finished ? <FaTrophy /> : <FaCalendarAlt />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="max-w-[260px] truncate font-semibold text-ink">
                              {event.title}
                            </h3>
                            <span className="badge badge-brand uppercase">
                              {formatType(event.eventType)}
                            </span>
                            {event.eventScope === "PLATFORM" && (
                              <span className="badge badge-brand uppercase">
                                Platform
                              </span>
                            )}
                            {cancelled && (
                              <span className="badge badge-danger uppercase">
                                Cancelled
                              </span>
                            )}
                            <span className={`badge badge-neutral uppercase ${statusClasses(studentStatus)}`}>
                              {formatStudentStatus(studentStatus)}
                            </span>
                            <span
                              title={gradeTitle}
                              className="badge badge-neutral max-w-[180px] truncate uppercase"
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
                            <span className="inline-flex items-center gap-1.5">
                              <FaUsers />
                              {registered} {getEventUnitLabel(event)}
                            </span>
                            <span className="truncate">Next: {getStudentNextAction(event)}</span>
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
                              <span key={step.label} className="inline-flex items-center gap-1.5">
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
                          <p className="mt-3 text-xs font-semibold text-muted">
                            Next: {getEventNextActionLabel(event)}
                          </p>
                        </div>
                      </div>

                      <div className="relative flex flex-col gap-2 border-l border-line pl-4">
                        {event.canRequest && !event.participationStatus && !finished && !cancelled ? (
                          <button
                            type="button"
                            onClick={() => enroll(event)}
                            className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                          >
                            <FaCheckCircle />
                            Enroll
                          </button>
                        ) : (
                          <Link
                            href={primaryHref}
                            className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
                          >
                            <FaEye />
                            {finished ? "View Result" : "View Event"}
                          </Link>
                        )}
                        {event.canWithdraw && !finished && !cancelled && (
                          <button
                            type="button"
                            onClick={() => withdraw(event)}
                            className="btn btn-ghost btn-sm inline-flex items-center gap-2 transition-colors"
                          >
                            <FaSignOutAlt />
                            Withdraw
                          </button>
                        )}
                        <Link
                          href={`/student/events/${event._id}?tab=notices`}
                          className="btn btn-ghost btn-sm inline-flex items-center gap-2 transition-colors"
                        >
                          <FaBell />
                          Event Notices
                        </Link>
                        {finished && (
                          <button
                            type="button"
                            onClick={() => openStudentCertificate(event)}
                            disabled={certificateLoadingId === event._id}
                            className="btn btn-ghost btn-sm inline-flex items-center gap-2 text-left transition-colors"
                          >
                            <FaTrophy />
                            {certificateLoadingId === event._id
                              ? "Opening..."
                              : "My Certificate"}
                          </button>
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
