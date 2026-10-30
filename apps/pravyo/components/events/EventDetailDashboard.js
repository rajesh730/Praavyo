"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import EventInfoHeader from "./EventInfoHeader";
import ManagementTabs from "./ManagementTabs";
import EventEditorForm from "./EventEditorForm";
import { useSession } from "next-auth/react";
import { ArrowLeft as FaArrowLeft } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AlertBanner from "@/components/ui/AlertBanner";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import AuthenticatedPublicLinkGuard from "@/components/AuthenticatedPublicLinkGuard";

export default function EventDetailDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id;
  const { data: session } = useSession();

  const [eventData, setEventData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "overview"
  );
  const [loadError, setLoadError] = useState("");
  const [editingEvent, setEditingEvent] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  const fetchEventData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await fetch(`/api/events/${eventId}/manage`);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setEventData(data);
      } else {
        setEventData(null);
        setLoadError(data.message || "Failed to load event data.");
      }
    } catch (error) {
      setEventData(null);
      setLoadError(error.message || "Failed to load event data.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  useEffect(() => {
    const loadTeachers = async () => {
      try {
        const res = await fetch("/api/teachers?limit=200&status=ACTIVE", { cache: "no-store" });
        if (!res.ok) {
          setTeachers([]);
          return;
        }
        const data = await res.json();
        setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
      } catch (error) {
        console.error("Failed to load teachers", error);
        setTeachers([]);
      }
    };

    if (session?.user?.role === "SCHOOL_ADMIN") {
      void loadTeachers();
    }
  }, [session?.user?.role]);

  useRealtimeChannel(
    ["events", eventId ? `event-${eventId}` : null].filter(Boolean),
    useCallback(() => {
      void fetchEventData();
    }, [fetchEventData])
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
        <LoadingState
          title="Loading event details"
          message="Preparing overview, participants, results, and certificates."
        />
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-surface-2 p-6">
        <div className="card mx-auto max-w-2xl p-4 sm:p-5 text-center">
          <h1 className="font-semibold text-ink">Event could not load</h1>
          <p className="mt-2 text-muted">
            {loadError || "Event not found or you do not have access."}
          </p>
          <button
            type="button"
            onClick={fetchEventData}
             className="btn btn-danger mt-4 font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { event, requests, capacityInfo, perSchoolBreakdown, roundsSummary, certificatesIssued } =
    eventData;
  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      const res = await fetch(`/api/events/${archiveTarget._id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to archive event.");
      }
      setFeedback({
        type: "success",
        title: "Event archived",
        message: `${archiveTarget.title} moved to event history.`,
      });
      setArchiveTarget(null);
      await fetchEventData();
    } catch (error) {
      setFeedback({
        type: "error",
        title: "Event was not archived",
        message: error.message || "Please retry after checking the connection.",
      });
      setArchiveTarget(null);
    }
  };
  const backHref =
    session?.user?.role === "SUPER_ADMIN"
      ? "/admin/dashboard?tab=events"
      : session?.user?.role === "STUDENT"
      ? "/student/events"
      : "/school/dashboard?tab=school-events";
  const backLabel =
    session?.user?.role === "SUPER_ADMIN"
      ? "Back to Dashboard"
      : "Back to Dashboard";

  return (
    <div className="min-h-screen bg-surface-2">
      <AuthenticatedPublicLinkGuard />
      {/* Header */}
      <EventInfoHeader event={event} capacityInfo={capacityInfo} />

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-5 py-6 md:px-6">
        <div className="mb-5">
          <Link
            href={backHref}
            className="btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FaArrowLeft />
            {session?.user?.role === "SUPER_ADMIN" ? backLabel : "Back to Events"}
          </Link>
        </div>
        {feedback && (
          <div className="mb-5">
            <AlertBanner
              type={feedback.type}
              title={feedback.title}
              message={feedback.message}
            />
          </div>
        )}
        {/* Management Tabs */}
        <ManagementTabs
          requests={requests}
          capacityInfo={capacityInfo}
          perSchoolBreakdown={perSchoolBreakdown}
          roundsSummary={roundsSummary}
          certificatesIssued={certificatesIssued}
          event={event}
          currentUserRole={session?.user?.role}
          canManagePlatformOperations={session?.user?.role === "SUPER_ADMIN"}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onDataChange={fetchEventData}
          onEdit={() => setEditingEvent(event)}
          onArchive={() => setArchiveTarget(event)}
        />
      </div>
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-card bg-surface shadow-pop">
            <EventEditorForm
              teachers={teachers}
              ownerMode={
                session?.user?.role === "SUPER_ADMIN" || event.eventScope === "PLATFORM"
                  ? "platform"
                  : "school"
              }
              showFeaturedOnLanding={session?.user?.role === "SUPER_ADMIN"}
              initialData={editingEvent}
              onEventCreated={async () => {
                setEditingEvent(null);
                await fetchEventData();
              }}
              onCancel={() => setEditingEvent(null)}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive this event?"
        message={
          archiveTarget
            ? `${archiveTarget.title} will move to event history. You can restore it later from archived events.`
            : ""
        }
        confirmLabel="Archive event"
        tone="danger"
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
    </div>
  );
}
