"use client";

import { useRouter } from "next/navigation";
import { Archive as FaArchive, Bell as FaBell, BadgeCheck as FaCertificate, ClipboardList as FaClipboardList, SquarePen as FaEdit, Globe as FaGlobe, Layers as FaLayerGroup, Users as FaUsers } from "lucide-react";
import RoundsTab from "./RoundsTab";
import EventOverviewTab from "./EventOverviewTab";
import EventResultsManager from "@/components/EventResultsManager";
import EventNoticeManager from "./EventNoticeManager";
import EventParticipationForm from "./EventParticipationForm";
import StudentEventCertificatesPanel from "./StudentEventCertificatesPanel";

export default function ManagementTabs({
  requests,
  capacityInfo,
  roundsSummary = null,
  certificatesIssued = 0,
  event,
  currentUserRole = "",
  canManagePlatformOperations = false,
  activeTab,
  setActiveTab,
  onDataChange,
  onEdit,
  onArchive,
}) {
  const router = useRouter();
  // Enrolled participants only — registration enrolls students directly, so the
  // roster is just who is in the event (no pending/approved/rejected review).
  const allRequests = [
    ...(requests.APPROVED || []),
    ...(requests.ENROLLED || []),
  ];
  const isPlatformCompetition = event.eventScope === "PLATFORM";
  // Students open this same dashboard read-only — they can view every tab but
  // edit nothing, and never see the Register Students tab.
  const isReadOnly = currentUserRole === "STUDENT";
  const isSuperAdminPlatformManager =
    currentUserRole === "SUPER_ADMIN" && isPlatformCompetition;
  const canControlEventOperations =
    !isPlatformCompetition || canManagePlatformOperations;
  // A school writes every notice, event announcements included, in
  // Dashboard → Notices → School notices. Teachers running the event, the
  // super admin (platform events) and students (read only) keep this tab.
  const schoolManagesNoticesCentrally = currentUserRole === "SCHOOL_ADMIN";
  const eventNoticesHref = "/school/dashboard?tab=notices&section=school";
  const isCompletedEvent =
    event.resultsPublished ||
    ["COMPLETED", "ARCHIVED"].includes(
      String(event.lifecycleStatus || "ACTIVE").toUpperCase()
    );
  const availableTabs = [
    {
      id: "overview",
      label: "Overview",
      count: null,
      icon: FaClipboardList,
    },
    !isSuperAdminPlatformManager && !isReadOnly && {
      id: "registrations",
      label: "Register Students",
      count: allRequests.length,
      icon: FaUsers,
    },
    canControlEventOperations && {
      id: "rounds",
      label: "Rounds",
      count: null,
      icon: FaLayerGroup,
    },
    canControlEventOperations && !schoolManagesNoticesCentrally && {
      id: "notices",
      label: "Notices",
      count: null,
      icon: FaBell,
    },
    {
      id: "results",
      label: "Results & Certificates",
      count: null,
      icon: FaCertificate,
    },
  ].filter(Boolean);
  const normalizedTab = activeTab === "manage" ? "registrations" : activeTab;
  const selectedTab = availableTabs.some((tab) => tab.id === normalizedTab)
    ? normalizedTab
    : "overview";
  const completedRounds = roundsSummary
    ? `${roundsSummary.completed}/${roundsSummary.total}`
    : event.resultsPublished
    ? "1/1"
    : "0/1";
  // Only genuinely unique actions live here — navigation between sections is the
  // job of the tab bar above, so we don't duplicate those as buttons.
  const quickActions = [
    !isReadOnly &&
      canControlEventOperations &&
      !isCompletedEvent && { label: "Edit Event", icon: FaEdit, onClick: onEdit },
    !isReadOnly &&
      canControlEventOperations &&
      !isCompletedEvent && {
        label: "Archive Event",
        icon: FaArchive,
        onClick: onArchive,
        danger: true,
      },
  ].filter((action) => action && typeof action.onClick === "function");

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="card overflow-hidden">
        <div className="flex overflow-x-auto border-b border-line bg-surface px-2">
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedTab === tab.id;
            const hasCount = tab.count !== null;
            const hasParticipants = Number(tab.count || 0) > 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`btn btn-ghost relative inline-flex shrink-0 items-center gap-2 transition-colors ${
                  isSelected
                    ? "bg-surface-2 text-brand-strong after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[3px] after:rounded-full after:bg-brand"
                    : "text-brand-strong hover:bg-surface hover:text-brand-strong"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-control text-xs transition-colors ${
                    isSelected
                      ? "bg-surface text-brand-strong shadow-card"
                      : "bg-surface-2 text-brand-strong"
                  }`}
                >
                  <Icon />
                </span>
                {tab.label}
                {hasCount && (
                  <span
                    className={`badge badge-neutral inline-flex min-w-6 items-center justify-center ${
                      hasParticipants
                        ? "border-success-line bg-success-soft text-success"
                        : "border-line-strong bg-surface text-brand-strong"
                    }`}
                    title={`${tab.count} participant${tab.count === 1 ? "" : "s"}`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bg-surface p-3 md:p-4">
          {selectedTab === "overview" && (
            <EventOverviewTab
              event={event}
              capacityInfo={capacityInfo}
              requests={requests}
              setActiveTab={setActiveTab}
            />
          )}

          {selectedTab === "registrations" && (
            <div className="space-y-4">
              {!isSuperAdminPlatformManager && (
                <div className="card p-4">
                  <div className="mb-4 flex flex-col gap-2 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h2 className="font-semibold text-ink">
                        Register Students
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        Add or update the students and teams for this competition.
                      </p>
                    </div>
                    <div className="card px-3 py-2 text-xs font-semibold text-brand-strong">
                      {capacityInfo.filled || 0}
                      {capacityInfo.total ? `/${capacityInfo.total}` : ""} registered
                    </div>
                  </div>
                  <EventParticipationForm
                    event={event}
                    isEditing={allRequests.length > 0}
                    onSuccess={onDataChange}
                  />
                </div>
              )}
            </div>
          )}

          {selectedTab === "rounds" && (
            <RoundsTab
              event={event}
              requests={allRequests}
              readOnly={isReadOnly}
              onAddNotice={() =>
                schoolManagesNoticesCentrally
                  ? router.push(eventNoticesHref)
                  : setActiveTab("notices")
              }
              onEventStarted={onDataChange}
              onCompetitionClosed={async () => {
                await onDataChange?.();
                setActiveTab("results");
              }}
            />
          )}

          {selectedTab === "notices" && (
            <EventNoticeManager
              eventId={event.id || event._id}
              eventTitle={event.title}
              readOnly={isReadOnly}
            />
          )}

          {selectedTab === "results" && (
            isReadOnly ? (
              <StudentEventCertificatesPanel eventId={event.id || event._id} />
            ) : (
              <EventResultsManager
                fixedEventId={event.id || event._id}
                embedded
                // Only the event's operator can edit results. For a platform
                // event a participating school can view their own students'
                // results, so it is read-only for them.
                readOnly={isReadOnly || !canControlEventOperations}
                title="Event Results & Certificates"
                description={
                  canControlEventOperations
                    ? "Review the final placements and school-issued digital certificates."
                    : "View your students' final placements and certificates when they are available."
                }
              />
            )
          )}
        </div>
      </div>

      <aside className="space-y-3">
        {quickActions.length > 0 && (
        <div className="card p-3">
          <h3 className="mb-3 font-semibold text-ink">Event Actions</h3>
          <div className="space-y-1.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={`btn btn-ghost btn-sm flex w-full items-center justify-between text-left transition-colors ${
                    action.danger ? "text-danger" : "text-brand-strong"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon />
                    {action.label}
                  </span>
                  <span>&gt;</span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className="card p-3">
          <h3 className="mb-3 font-semibold text-ink">At a Glance</h3>
          <div className="space-y-3">
            {[
              ["Schools Participated", capacityInfo.schoolCount || 1, FaUsers],
              ["Total Participant", capacityInfo.filled || 0, FaUsers],
              canControlEventOperations && ["Rounds Completed", completedRounds, FaLayerGroup],
              ["Certificates Issued", certificatesIssued || 0, FaCertificate],
            ].filter(Boolean).map(([label, value, Icon]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 rounded-control bg-surface px-3 py-2"
              >
                <span className="inline-flex items-center gap-2 text-2xs font-semibold text-muted">
                  <Icon className="text-brand-strong" />
                  {label}
                </span>
                <strong className="text-sm font-semibold text-ink">{value}</strong>
              </div>
            ))}
          </div>
        </div>

        {selectedTab === "notices" && (
          <div className="rounded-card border border-success-line bg-success-soft p-4 shadow-card">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-success">
                <FaGlobe />
              </span>
              <div>
                <h3 className="font-semibold text-ink">
                  Where notices appear
                </h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-success">
                  Published notices are visible on the public event page and in
                  the school dashboard event card.
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
      </div>
  );
}
