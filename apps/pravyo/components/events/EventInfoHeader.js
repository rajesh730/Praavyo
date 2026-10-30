"use client";

import { CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Clock as FaClock, List as FaListUl, Music as FaMusic, Users as FaUsers } from "lucide-react";
import { getEventStage } from "@/lib/eventUiStatus";
import {
  formatEventWorkflowStatus,
  getEventNextActionLabel,
  getEventWorkflowStatus,
} from "@/lib/eventWorkflow";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate as formatCalendarDate } from "@/lib/nepaliDate";

export default function EventInfoHeader({ event, capacityInfo }) {
  const { calendar } = useCalendarPreference();
  const formatDate = (date) =>
    date ? formatCalendarDate(date, calendar) : "No deadline";
  const formatTime = (date) =>
    date
      ? new Date(date).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
  const formatWeekday = (date) =>
    date
      ? new Date(date).toLocaleDateString("en-US", { weekday: "long" })
      : "";

  const daysUntilDeadline = event.registrationDeadline
    ? Math.ceil(
        (new Date(event.registrationDeadline) - new Date()) /
          (1000 * 60 * 60 * 24)
      )
    : null;
  const stage = getEventStage(event, { capacityInfo });
  const workflowStatus = getEventWorkflowStatus(event);
  const nextAction = getEventNextActionLabel(event);
  const capacityPercent = Math.min(capacityInfo.percentage || 0, 100);
  const stageTone =
    stage.tone === "emerald" || event.resultsPublished
      ? "border-success-line bg-success-soft text-success"
      : stage.tone === "amber"
      ? "border-warning-line bg-warning-soft text-warning"
      : stage.tone === "rose"
      ? "border-danger-line bg-danger-soft text-danger"
      : "border-brand-line bg-brand-soft text-brand-strong";

  return (
    <div className="border-b border-line bg-surface px-5 py-5 text-ink shadow-card md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-soft text-2xl text-brand-strong">
              <FaMusic />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-semibold leading-tight text-ink">
                  {event.title}
                </h1>
                <span className="badge badge-success uppercase">
                  {formatEventWorkflowStatus(workflowStatus)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="badge badge-brand uppercase">
                  {String(event.eventType || "EVENT").replaceAll("_", " ")}
                </span>
                <span className="badge badge-neutral uppercase">
                  {String(event.participationFormat || "INDIVIDUAL").toLowerCase()} event
                </span>
                <span className="badge badge-brand uppercase">
                  {event.eligibleGrades?.length
                    ? `Visible to ${event.eligibleGrades.join(" - ")}`
                    : "Visible to all grades"}
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
                {event.description}
              </p>
            </div>
          </div>
          <div
            className={`card w-full px-4 py-3 lg:w-[320px] ${stageTone}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide">
              Event Status
            </p>
                <p className="mt-1 text-lg font-semibold">{stage.label}</p>
                <p className="mt-1 text-xs opacity-90">{nextAction}</p>
              </div>
              <FaCheckCircle className="mt-1 shrink-0 text-lg" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-3 text-muted">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
                <FaCalendarAlt />
              </span>
              <span className="text-xs font-semibold">Event Date</span>
            </div>
            <p className="text-base font-semibold text-ink">
              {formatDate(event.date)}
            </p>
            <p className="mt-1 text-xs text-muted">{formatWeekday(event.date)}</p>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-3 text-muted">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-danger-soft text-danger">
                <FaClock />
              </span>
              <span className="text-xs font-semibold">Deadline</span>
            </div>
            <p className="text-base font-semibold text-ink">
              {formatDate(event.registrationDeadline)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {event.registrationDeadline
                ? daysUntilDeadline > 0
                  ? `${daysUntilDeadline} days left`
                  : formatTime(event.registrationDeadline)
                : "Registration stays open"}
            </p>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-3 text-muted">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-success-soft text-success">
                <FaUsers />
              </span>
              <span className="text-xs font-semibold">Enrolled</span>
            </div>
            <p className="text-base font-semibold text-ink">
              {capacityInfo.filled}
              {capacityInfo.total ? `/${capacityInfo.total}` : ""}
            </p>
            <p className="mt-1 text-xs text-success">
              {capacityInfo.percentage || 0}% full
            </p>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center gap-3 text-muted">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-warning-soft text-warning">
                <FaListUl />
              </span>
              <span className="text-xs font-semibold">Pending Requests</span>
            </div>
            <p className="text-base font-semibold text-ink">{capacityInfo.pending}</p>
            <p className="mt-1 text-xs text-muted">requests to approve</p>
          </div>
        </div>

        {capacityInfo.total && (
          <div className="card mt-4 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Capacity Status</span>
              <span className="badge badge-danger text-xs">
                {capacityInfo.filled}/{capacityInfo.total} students
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-danger-soft">
              <div
                className="h-full rounded-full bg-danger transition-colors"
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
