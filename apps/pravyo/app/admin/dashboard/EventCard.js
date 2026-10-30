"use client";

import Link from "next/link";
import { Ban as FaBan, Bell as FaBell, CalendarDays as FaCalendarAlt, Circle as FaCircle, Download as FaDownload, SquarePen as FaEdit, History as FaHistory, Trash2 as FaTrash, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import { isTeamEventLike } from "@/lib/eventParticipationFormat";
import {
  getEventNextActionLabel,
  getEventWorkflowStatus,
} from "@/lib/eventWorkflow";
import { getEventDeletionPolicy } from "@/lib/eventDeletion";
import AppDate from "@/components/common/AppDate";
import EventListCard from "@/components/events/EventListCard";

function formatType(value) {
  return String(value || "EVENT").replaceAll("_", " ");
}

function getEventUnitLabel(event) {
  return isTeamEventLike(event) ? "Teams" : "Students";
}

function getRegisteredCount(event) {
  return Number(event.studentCapacityCount ?? event.studentCount ?? 0) || 0;
}

function getSchoolCount(event) {
  return Number(event.schoolCount ?? event.participants?.length ?? 0) || 0;
}

function formatGradeSummary(grades = []) {
  const visibleGrades = grades.filter(Boolean);
  if (visibleGrades.length === 0) return "All grades";
  if (visibleGrades.length <= 2) return visibleGrades.join(", ");
  return `${visibleGrades.length} grades`;
}

export default function EventCard({
  event,
  onCancel,
  onPermanentDelete,
  isDeleting,
  onEdit,
  onUpdateStatus,
  actionMode = "manage",
}) {
  const isTeamEvent = isTeamEventLike(event);
  const eventState = String(event.lifecycleStatus || "ACTIVE").toUpperCase();
  const isCancelledState = eventState === "CANCELLED";
  // Archived and cancelled are both terminal: managed the same way (restore /
  // permanently delete), and never editable.
  const isArchivedMode =
    actionMode === "archived" || eventState === "ARCHIVED" || isCancelledState;
  const policy = getEventDeletionPolicy(event);
  const isFinished =
    event.resultsPublished || eventState === "ARCHIVED";
  const registered = getRegisteredCount(event);
  const workflowStatus = getEventWorkflowStatus(event);
  const nextAction = getEventNextActionLabel(event);
  const gradeSummary = formatGradeSummary(event.eligibleGrades || []);
  const gradeTitle =
    event.eligibleGrades?.length > 0 ? event.eligibleGrades.join(", ") : "All grades";

  const rowStats = [
    ["Registrations", registered, getEventUnitLabel(event)],
    ["Schools", getSchoolCount(event), "Schools"],
    ["Pending", event.pendingEntryCount ?? 0, "Requests"],
    ["Approved", event.approvedEntryCount ?? 0, "Entries"],
    [
      "Results",
      workflowStatus === "RESULTS_PUBLISHED" ? "Published" : "Draft",
      workflowStatus === "RESULTS_DRAFT"
        ? "Review"
        : workflowStatus === "RESULTS_PUBLISHED"
        ? "Ready"
        : "-",
    ],
  ];

  const steps = [
    {
      label: "Registration",
      active: ["OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED"].includes(
        workflowStatus
      ),
      complete: !["DRAFT", "OPEN_FOR_REGISTRATION"].includes(workflowStatus),
    },
    {
      label: "Review",
      active: Number(event.pendingEntryCount || 0) > 0,
      complete: Number(event.pendingEntryCount || 0) === 0,
    },
    {
      label: "Rounds",
      active: workflowStatus === "ROUND_ACTIVE",
      complete: ["RESULTS_DRAFT", "RESULTS_PUBLISHED", "COMPLETED"].includes(
        workflowStatus
      ),
    },
    {
      label: "Results",
      active: workflowStatus === "RESULTS_DRAFT",
      complete: workflowStatus === "RESULTS_PUBLISHED" || isFinished,
    },
    {
      label: "Completed",
      active: workflowStatus === "COMPLETED",
      complete: isFinished,
    },
  ];

  const exportToCSV = () => {
    if (!event.participants || event.participants.length === 0) return;

    const headers =
      "School Name,Contact Person,Phone,Expected Students,Joined Date,Notes";
    const rows = event.participants.map((participant) => {
      const schoolName = participant.school?.schoolName || "Unknown";
      const joinDate = new Date(participant.joinedAt).toLocaleDateString();
      return `"${schoolName}","${participant.contactPerson || ""}","${
        participant.contactPhone || ""
      }","${participant.expectedStudents || 0}","${joinDate}","${
        participant.notes || ""
      }"`;
    });

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute(
      "download",
      `${event.title.replace(/[^a-z0-9]/gi, "_")}_participants.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <EventListCard accent="purple">
      <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(360px,1.18fr)_minmax(520px,1fr)_210px] xl:items-start">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-lg text-brand-strong">
            {event.resultsPublished ? <FaTrophy /> : <FaEdit />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="max-w-[260px] truncate font-semibold text-ink">
                {event.title}
              </h3>
              <span className="badge badge-brand uppercase">
                {formatType(event.eventType)}
              </span>
              <span className="badge badge-neutral uppercase">
                {isTeamEvent ? "Team Event" : "Individual Event"}
              </span>
              {(isCancelledState || eventState === "ARCHIVED") && (
                <span
                  className={`badge badge-neutral uppercase ${
                    isCancelledState
                      ? "bg-danger-soft text-danger"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {isCancelledState ? "Cancelled" : "Archived"}
                </span>
              )}
              <span
                title={gradeTitle}
                className="badge badge-brand max-w-[180px] truncate uppercase"
              >
                Visible to {gradeSummary}
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
              <span className="truncate">Next: {nextAction}</span>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {isArchivedMode ? (
                policy.canDelete ? (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => onPermanentDelete?.(event)}
                    className="btn btn-soft-danger btn-sm inline-flex items-center gap-2 transition-colors"
                  >
                    <FaTrash />
                    Delete Permanently
                  </button>
                ) : (
                  <span
                    title={policy.deleteBlockedReason}
                    className="inline-flex min-h-9 items-center gap-2 rounded-control border border-line bg-surface-2 px-3.5 py-1.5 text-2xs font-semibold text-muted"
                  >
                    Kept for records — cannot delete
                  </span>
                )
              ) : (
                policy.canCancel && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => onCancel?.(event)}
                    className="btn btn-secondary btn-sm inline-flex items-center gap-2 transition-colors"
                  >
                    <FaBan />
                    Cancel Event
                  </button>
                )
              )}
            {event.participants?.length > 0 && (
              <button
                type="button"
                onClick={exportToCSV}
                className="btn btn-secondary btn-sm inline-flex items-center gap-2 transition-colors"
              >
                <FaDownload />
                Export
              </button>
            )}
            </div>
          </div>
        </div>

        <div className="relative flex flex-col gap-2 border-l border-line pl-4">
          {isArchivedMode ? (
            <button
              type="button"
              onClick={() => onUpdateStatus?.(event._id, "ACTIVE")}
              className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaHistory />
              Restore Event
            </button>
          ) : (
            <Link
              href={`/admin/events/${event._id}/manage?tab=registrations`}
              className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              Continue Management
            </Link>
          )}
          {!isArchivedMode && actionMode !== "completed" && (
            <button
              type="button"
              onClick={() => onEdit?.(event)}
              className="btn btn-secondary btn-sm inline-flex items-center gap-2 transition-colors"
            >
              <FaEdit />
              Edit Event
            </button>
          )}
          {!isArchivedMode && (
            <Link
              href={`/admin/events/${event._id}/manage?tab=notices`}
              className="btn btn-secondary btn-sm inline-flex items-center gap-2 transition-colors"
            >
              <FaBell />
              Event Notices
            </Link>
          )}
        </div>
      </div>
    </EventListCard>
  );
}
