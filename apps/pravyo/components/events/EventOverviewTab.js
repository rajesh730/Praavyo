"use client";

import { CalendarDays as FaCalendarAlt, Eye as FaEye, School as FaSchool, Trophy as FaTrophy } from "lucide-react";
import { formatShortDate, getEventStage, isDatePast } from "@/lib/eventUiStatus";
import AppDate from "@/components/common/AppDate";
import {
  formatEventWorkflowStatus,
  getEventNextActionLabel,
  getEventWorkflowStatus,
} from "@/lib/eventWorkflow";

export default function EventOverviewTab({
  event,
  capacityInfo,
  requests,
}) {
  const isTeamEvent =
    String(event?.participationFormat || "INDIVIDUAL").toUpperCase() === "TEAM";
  const countRequestUnits = (items = []) => {
    if (!isTeamEvent) return items.length;
    return new Set(
      items.map(
        (item) =>
          `${String(item.school?._id || item.school || "")}::${String(
            item.teamName || ""
          )
            .trim()
            .toLowerCase() || "default-team"}`
      )
    ).size;
  };
  const stage = getEventStage(event, { capacityInfo, requests });
  const workflowStatus = getEventWorkflowStatus(event);
  const nextAction = getEventNextActionLabel(event);
  const pendingCount = countRequestUnits(requests.PENDING || []);
  const registrationClosed = isDatePast(event.registrationDeadline);
  const stageTone =
    stage.tone === "emerald" || event.resultsPublished
      ? "border-success-line bg-success-soft text-success"
      : stage.tone === "amber"
      ? "border-warning-line bg-warning-soft text-warning"
      : stage.tone === "rose"
      ? "border-danger-line bg-danger-soft text-danger"
      : "border-brand-line bg-brand-soft text-brand-strong";
  const timeline = [
    ["Registration Open", event.createdAt || event.date, !["DRAFT"].includes(workflowStatus)],
    ["Registration Closed", event.registrationDeadline, !["DRAFT", "OPEN_FOR_REGISTRATION"].includes(workflowStatus)],
    ["Rounds Running", event.date, ["ROUND_ACTIVE", "RESULTS_DRAFT", "RESULTS_PUBLISHED", "COMPLETED"].includes(workflowStatus)],
    ["Results Review", null, ["RESULTS_DRAFT", "RESULTS_PUBLISHED", "COMPLETED"].includes(workflowStatus)],
    ["Results Published", null, ["RESULTS_PUBLISHED", "COMPLETED"].includes(workflowStatus)],
    ["Completed", null, workflowStatus === "COMPLETED"],
  ];
  const detailItems = [
    ["Organized By", event.school?.schoolName || event.school?.name || "Praavyo", FaSchool],
    ["Event Type", String(event.eventType || "Competition").replaceAll("_", " "), FaTrophy],
    [
      "Visibility",
      event.eligibleGrades?.length
        ? `Visible to ${event.eligibleGrades.join(" - ")}`
        : "Visible to all grades",
      FaEye,
    ],
    ["Created On", formatShortDate(event.createdAt || event.date), FaCalendarAlt],
  ];

  return (
    <div className="space-y-4">
      <div className={`card p-4 ${stageTone}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">
              Event Status
            </p>
            <h2 className="mt-1 font-semibold">{stage.label}</h2>
            <p className="mt-1 text-xs font-semibold uppercase opacity-80">
              Status: {formatEventWorkflowStatus(workflowStatus)}
            </p>
            <p className="mt-2 text-sm opacity-90">{nextAction}</p>
          </div>
          <div className="card px-4 py-3 text-sm font-semibold">
            Deadline: <AppDate value={event.registrationDeadline} fallback="Not set" />
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 font-semibold text-ink">Event Details</h3>
            <div className="space-y-4">
              {detailItems.map(([label, value, Icon]) => (
                <div key={label} className="flex gap-3 text-sm">
                  <Icon className="mt-1 shrink-0 text-brand-strong" />
                  <div>
                    <p className="font-semibold text-muted">{label}</p>
                    <p className="font-semibold text-ink">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <h3 className="mb-4 font-semibold text-ink">Timeline</h3>
            <div className="space-y-4">
              {timeline.map(([label, date, complete]) => (
                <div key={label} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1 h-3 w-3 rounded-full ${
                      complete ? "bg-success" : "bg-line"
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-semibold text-ink">{label}</p>
                      <p className="text-xs font-semibold text-muted">
                        {date ? <AppDate value={date} /> : complete ? "Done" : "Pending"}
                      </p>
                    </div>
                    {label === "Registration Closed" && (
                      <p className="mt-1 text-xs text-muted">
                        {complete
                          ? "Closed"
                          : registrationClosed
                          ? "Closed"
                          : "Still accepting entries"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs font-semibold text-muted">
        {pendingCount} pending request{pendingCount === 1 ? "" : "s"} need review.
        Registered {isTeamEvent ? "teams" : "students"}: {capacityInfo.filled || 0}
        {capacityInfo.total ? `/${capacityInfo.total}` : ""}.
      </p>
    </div>
  );
}
