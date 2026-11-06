"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import CredentialsModal from "@/components/CredentialsModal";
import NoticeManager from "@/components/NoticeManager";
import SchoolPromotionManager from "@/components/admin/SchoolPromotionManager";
import PageHeader from "@/components/ui/PageHeader";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LoadingState from "@/components/ui/LoadingState";
import EmptyState from "@/components/EmptyState";
import SendEventForm from "./SendEventForm";
import EventCard from "./EventCard";
import PlatformEventsKindSwitch from "@/components/trainings/PlatformEventsKindSwitch";
import AdminTrainingsManager from "@/components/trainings/AdminTrainingsManager";

import { Ban as FaBan, CalendarDays as FaCalendarAlt, Circle as FaCircle, ToggleRight as FaToggleOn, ToggleLeft as FaToggleOff, CircleCheck as FaCheckCircle, CircleX as FaTimesCircle, ListFilter as FaFilter, KeyRound as FaKey, Layers as FaLayerGroup, Plus as FaPlus, Search as FaSearch, Users as FaUsers } from "lucide-react";
import {
  isCompletedEvent,
  isLiveEvent,
  isRegistrationOpenEvent,
  isTerminalEvent,
  matchesEventFacets,
  matchesEventListFilter,
} from "@/lib/eventListTaxonomy";

const FETCH_TIMEOUT_MS = 10000;

function parseSchoolLocation(location = "") {
  const parts = String(location || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const postalIndex = parts.findIndex((part) => /^postal code/i.test(part));
  const cleanParts = postalIndex >= 0 ? parts.slice(0, postalIndex) : parts;

  return {
    province: cleanParts.at(-1) || "",
    district: cleanParts.at(-2) || "",
  };
}

function getSchoolProvince(school) {
  return school.province || parseSchoolLocation(school.schoolLocation).province;
}

function getSchoolDistrict(school) {
  return school.district || parseSchoolLocation(school.schoolLocation).district;
}

function eventSortTime(event) {
  const value = event.createdAt || event.updatedAt || event.date || 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function newestEventsFirst(events = []) {
  return [...events].sort((a, b) => eventSortTime(b) - eventSortTime(a));
}

function formatEventType(value) {
  return String(value || "EVENT").replaceAll("_", " ");
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`${url} failed with ${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchNamedResource(label, url) {
  try {
    const data = await fetchJsonWithTimeout(url);
    return { ok: true, label, data };
  } catch (error) {
    return {
      ok: false,
      label,
      error: error?.name === "AbortError"
        ? `${label} timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : error?.message || `Failed to load ${label}`,
    };
  }
}

function AdminDashboardContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") || "approvals";
  const rawTab = ["judging", "results"].includes(requestedTab)
    ? "events"
    : requestedTab;
  const activeTab = [
    "approvals",
    "schools",
    "events",
    "notices",
    "spotlight",
  ].includes(rawTab)
    ? rawTab
    : "approvals";
  const [schools, setSchools] = useState([]);
  const [events, setEvents] = useState([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolProvince, setSchoolProvince] = useState("All Provinces");
  const [schoolDistrict, setSchoolDistrict] = useState("All Districts");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [eventWorkspaceTab, setEventWorkspaceTab] = useState("manage");
  const [eventStatusFilter, setEventStatusFilter] = useState("LIVE");
  const [eventSearch, setEventSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [eventGradeFilter, setEventGradeFilter] = useState("");
  const [eventVisibilityFilter, setEventVisibilityFilter] = useState("");
  const [showEventFilters, setShowEventFilters] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [credentialsModal, setCredentialsModal] = useState({
    isOpen: false,
    credentials: null,
  });

  const closeOverlays = () => {
    setEditingEvent(null);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchData();
  }, [status, router]);

  useEffect(() => {
    closeOverlays();
  }, [activeTab]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeOverlays();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const results = await Promise.all([
        fetchNamedResource("Schools", "/api/schools/list"),
        fetchNamedResource("Events", "/api/events?summary=1"),
      ]);

      const [schoolsResult, eventsResult] = results;
      const failed = results.filter((result) => !result.ok);

      if (schoolsResult.ok) {
        setSchools(schoolsResult.data.schools || []);
      }
      if (eventsResult.ok) {
        setEvents(eventsResult.data.events || []);
      }

      if (failed.length > 0) {
        setLoadError(
          `Some dashboard data could not load: ${failed
            .map((result) => result.label)
            .join(", ")}. The dashboard is still usable; refresh after checking the server/database connection.`
        );
      }
    } catch (error) {
      setLoadError(
        "Dashboard data could not load. Please check the server/database connection and try refresh."
      );
    } finally {
      setLoading(false);
    }
  };

  const requestSchoolStatusUpdate = (school, newStatus) => {
    setConfirmState({
      type: "school-status",
      school,
      newStatus,
      title:
        newStatus === "APPROVED"
          ? "Approve this school?"
          : newStatus === "REJECTED"
          ? "Reject this school?"
          : "Update school status?",
      message: `${school.schoolName || school.email} will be marked as ${newStatus}.`,
      confirmLabel:
        newStatus === "APPROVED"
          ? "Approve school"
          : newStatus === "REJECTED"
          ? "Reject school"
          : "Update status",
      tone:
        newStatus === "REJECTED" || newStatus === "UNSUBSCRIBED"
          ? "danger"
          : "info",
      busy: false,
    });
  };

  const updateStatus = async (schoolId, newStatus) => {
    try {
      setConfirmState((current) => (current ? { ...current, busy: true } : current));
      setActionFeedback(null);
      const res = await fetch(`/api/schools/${schoolId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setSchools(
          schools.map((s) =>
            s._id === schoolId ? { ...s, status: newStatus } : s
          )
        );
        setActionFeedback({
          type: "success",
          title: "School status updated",
          message: `School is now ${newStatus}.`,
        });
      } else {
        setActionFeedback({
          type: "error",
          title: "School status update failed",
          message: data.message || "Failed to update status",
        });
      }
    } catch (error) {
      setActionFeedback({
        type: "error",
        title: "School status update failed",
        message: error.message,
      });
    } finally {
      setConfirmState(null);
    }
  };

  const requestResetSchoolPassword = (school) => {
    setConfirmState({
      type: "school-password",
      school,
      title: "Reset school password?",
      message: `The current password for ${school.schoolName} will stop working immediately and a new temporary password will be generated.`,
      confirmLabel: "Reset password",
      tone: "warning",
      busy: false,
    });
  };

  const resetSchoolPassword = async (school) => {
    try {
      setConfirmState((current) => (current ? { ...current, busy: true } : current));
      setActionFeedback(null);
      const res = await fetch(`/api/schools/${school._id}/reset-password`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to reset school password");
      }

      if (data.data?.credentials) {
        setCredentialsModal({
          isOpen: true,
          credentials: data.data.credentials,
        });
      }
      setActionFeedback({
        type: "success",
        title: "Password reset",
        message: `New credentials are ready for ${school.schoolName}.`,
      });
    } catch (error) {
      setActionFeedback({
        type: "error",
        title: "Password reset failed",
        message: error.message,
      });
    } finally {
      setConfirmState(null);
    }
  };

  // Event CRUD
  const requestCancelEvent = (event) => {
    setConfirmState({
      type: "event-cancel",
      event,
      title: "Cancel this event?",
      message: `${event.title} will be marked cancelled. Every registered school and student is notified and their registrations are withdrawn. This is for events that should not go ahead.`,
      confirmLabel: "Cancel event",
      tone: "danger",
      busy: false,
    });
  };

  const cancelEvent = async (id) => {
    setLastError(null);
    setDeletingId(id);
    try {
      setConfirmState((current) => (current ? { ...current, busy: true } : current));
      setActionFeedback(null);
      const res = await fetch(`/api/events/${id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEvents(
          events.map((e) =>
            e._id === id ? { ...e, lifecycleStatus: "CANCELLED" } : e
          )
        );
        setActionFeedback({
          type: "success",
          title: "Event cancelled",
          message: data.message || "Schools and students were notified.",
        });
      } else {
        const msg = `Failed: ${data.message} (${res.status})`;
        setLastError(msg);
        setActionFeedback({ type: "error", title: "Cancel failed", message: msg });
      }
    } catch (error) {
      setLastError(`Error: ${error.message}`);
      setActionFeedback({
        type: "error",
        title: "Cancel failed",
        message: `Network/Client Error: ${error.message}`,
      });
    } finally {
      setDeletingId(null);
      setConfirmState(null);
    }
  };

  const requestPermanentDeleteEvent = (event) => {
    setConfirmState({
      type: "event-permanent-delete",
      event,
      title: "Permanently delete this event?",
      message: `${event.title} and all its registrations, rounds, notices, and invitations will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
      busy: false,
    });
  };

  const permanentlyDeleteEvent = async (id) => {
    setLastError(null);
    setDeletingId(id);
    try {
      setConfirmState((current) => (current ? { ...current, busy: true } : current));
      setActionFeedback(null);
      const res = await fetch(`/api/events/${id}/delete`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEvents(events.filter((e) => e._id !== id));
        setActionFeedback({
          type: "success",
          title: "Event deleted",
          message: data.message || "The event was permanently removed.",
        });
      } else {
        const msg = `Failed: ${data.message} (${res.status})`;
        setLastError(msg);
        setActionFeedback({ type: "error", title: "Delete failed", message: msg });
      }
    } catch (error) {
      setLastError(`Error: ${error.message}`);
      setActionFeedback({
        type: "error",
        title: "Delete failed",
        message: `Network/Client Error: ${error.message}`,
      });
    } finally {
      setDeletingId(null);
      setConfirmState(null);
    }
  };

  const updateEventStatus = async (id, status) => {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: status }),
      });
      if (res.ok) {
        setEvents(
          events.map((e) => (e._id === id ? { ...e, lifecycleStatus: status } : e))
        );
        setActionFeedback({
          type: "success",
          title: "Event status updated",
          message: `Event moved to ${status.toLowerCase()}.`,
        });
      } else {
        setActionFeedback({
          type: "error",
          title: "Event status update failed",
          message: "Failed to update event status",
        });
      }
    } catch (error) {
      // Error already handled in state
    }
  };

  const pendingSchools = schools.filter((s) => s.status === "PENDING");
  const registeredSchools = schools.filter((s) => s.status !== "PENDING");
  const schoolProvinceOptions = [
    "All Provinces",
    ...new Set(
      registeredSchools
        .map(getSchoolProvince)
        .filter(Boolean)
    ),
  ];
  const districtSource =
    schoolProvince === "All Provinces"
      ? registeredSchools
      : registeredSchools.filter(
          (school) => getSchoolProvince(school) === schoolProvince
        );
  const schoolDistrictOptions = [
    "All Districts",
    ...new Set(
      districtSource
        .map(getSchoolDistrict)
        .filter(Boolean)
    ),
  ];
  const filteredRegisteredSchools = registeredSchools.filter((school) => {
    const query = schoolSearch.trim().toLowerCase();
    if (
      schoolProvince !== "All Provinces" &&
      getSchoolProvince(school) !== schoolProvince
    ) {
      return false;
    }
    if (
      schoolDistrict !== "All Districts" &&
      getSchoolDistrict(school) !== schoolDistrict
    ) {
      return false;
    }
    if (!query) return true;
    const searchable = [
      school.schoolName,
      school.principalName,
      school.email,
      school.schoolLocation,
      getSchoolProvince(school),
      getSchoolDistrict(school),
      school.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
  const platformEvents = events.filter(
    (event) => (event.eventScope || "PLATFORM") === "PLATFORM"
  );
  const eventTypes = useMemo(
    () =>
      Array.from(new Set(platformEvents.map((event) => event.eventType).filter(Boolean))),
    [platformEvents]
  );
  const eventGradeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          platformEvents
            .flatMap((event) => event.eligibleGrades || [])
            .filter(Boolean)
        )
      ),
    [platformEvents]
  );
  const eventMetrics = useMemo(() => {
    const activeRecords = platformEvents.filter((event) => !isTerminalEvent(event));
    return {
      live: platformEvents.filter(isLiveEvent).length,
      registrationOpen: platformEvents.filter(isRegistrationOpenEvent).length,
      completed: platformEvents.filter(
        (event) => !isTerminalEvent(event) && isCompletedEvent(event)
      ).length,
      cancelled: platformEvents.filter(isTerminalEvent).length,
      activeRecords: activeRecords.length,
    };
  }, [platformEvents]);
  const filteredPlatformEvents = useMemo(() => {
    return newestEventsFirst(
      platformEvents.filter(
        (event) =>
          matchesEventListFilter(event, eventStatusFilter) &&
          matchesEventFacets(event, {
            search: eventSearch,
            type: eventTypeFilter,
            grade: eventGradeFilter,
            visibility: eventVisibilityFilter,
          })
      )
    );
  }, [
    eventGradeFilter,
    eventSearch,
    eventStatusFilter,
    eventTypeFilter,
    eventVisibilityFilter,
    platformEvents,
  ]);
  const eventMetricCards = [
    {
      key: "LIVE",
      label: "Live",
      value: eventMetrics.live,
      note: "Rounds or results in progress",
      icon: FaCalendarAlt,
      tone: "blue",
    },
    {
      key: "REGISTRATION",
      label: "Registration Open",
      value: eventMetrics.registrationOpen,
      note: "Accepting school entries",
      icon: FaUsers,
      tone: "emerald",
    },
    {
      key: "COMPLETED",
      label: "Completed",
      value: eventMetrics.completed,
      note: "Results/certificates ready",
      icon: FaCheckCircle,
      tone: "blue",
    },
    {
      key: "ARCHIVED",
      label: "Cancelled",
      value: eventMetrics.cancelled,
      note: "Cancelled events",
      icon: FaBan,
      tone: "slate",
    },
  ];
  const eventMetricTones = {
    blue: "border-brand-line bg-brand-soft text-brand-strong",
    emerald: "border-success-line bg-success-soft text-success",
    slate: "border-line-strong bg-surface-2 text-ink",
  };
  const eventFilterTabs = [
    ["LIVE", "Live", FaCircle, eventMetrics.live],
    ["REGISTRATION", "Registration Open", FaUsers, eventMetrics.registrationOpen],
    ["ALL", "All Events", FaCalendarAlt, eventMetrics.activeRecords],
    ["COMPLETED", "Completed", FaCheckCircle, eventMetrics.completed],
    ["ARCHIVED", "Cancelled", FaBan, eventMetrics.cancelled],
  ];

  return (
    <DashboardLayout>
      <PageHeader
        icon={FaLayerGroup}
        eyebrow="Admin"
        title="Dashboard"
        description="Use the left menu to approve schools, manage events, publish notices, and update platform settings."
      />

      {(loading || loadError) && (
        <div className="mb-4">
          <AlertBanner
            type={loadError ? "warning" : "info"}
            title={loadError ? "Some data could not load" : "Loading dashboard"}
            message={loadError || "Loading schools and events..."}
          />
        </div>
      )}

      {actionFeedback && (
        <div className="mb-4">
          <AlertBanner
            type={actionFeedback.type}
            title={actionFeedback.title}
            message={actionFeedback.message}
          />
        </div>
      )}

      {/* Content */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          <div className="bg-surface p-4 sm:p-5 rounded-card border border-line-strong">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  School onboarding
                </p>
                <h2 className="mt-2 font-semibold text-ink">
                  Pending Approvals
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-subtle">
                Review new school requests before they can manage students,
                events, notices, and magazine publishing.
              </p>
            </div>
            {pendingSchools.length === 0 ? (
              <EmptyState
                icon={FaCheckCircle}
                title="No pending registrations"
                description="New school requests will appear here for approval."
              />
            ) : (
              <div className="grid gap-4">
                {pendingSchools.map((school) => (
                  <div
                    key={school._id}
                    className="bg-surface p-4 sm:p-5 rounded-card border border-line-strong flex flex-col md:flex-row justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <h3 className="font-semibold text-ink flex items-center gap-2">
                        {school.schoolName}
                        <span className="text-xs bg-warning-soft text-warning px-2 py-1 rounded-control border border-warning-line">
                          PENDING
                        </span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm text-ink">
                        <p>
                          <span className="text-muted">Principal:</span>{" "}
                          {school.principalName}
                        </p>
                        <p>
                          <span className="text-muted">Email:</span>{" "}
                          {school.email}
                        </p>
                        <p>
                          <span className="text-muted">Phone:</span>{" "}
                          {school.schoolPhone || "N/A"}
                        </p>
                        <p>
                          <span className="text-muted">Location:</span>{" "}
                          {school.schoolLocation}
                        </p>
                        <p>
                          <span className="text-muted">Website:</span>{" "}
                          {school.website || "N/A"}
                        </p>
                        <p>
                          <span className="text-muted">Est. Year:</span>{" "}
                          {school.establishedYear || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => requestSchoolStatusUpdate(school, "APPROVED")}
                        className="btn btn-primary flex items-center gap-2 font-medium transition-colors"
                      >
                        <FaCheckCircle /> Approve
                      </button>
                      <button
                        onClick={() => requestSchoolStatusUpdate(school, "REJECTED")}
                        className="btn btn-danger flex items-center gap-2 font-medium transition-colors"
                      >
                        <FaTimesCircle /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "schools" && (
        <div className="bg-surface p-4 sm:p-5 rounded-card border border-line-strong">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Network
              </p>
              <h2 className="mt-2 font-semibold text-ink">
                Registered Schools
              </h2>
            </div>
            <p className="text-sm text-subtle">
              Manage access and reset credentials for approved schools.
            </p>
          </div>
          <div className="mb-4 flex flex-col gap-3 rounded-card border border-line-strong bg-surface p-4 md:flex-row md:items-end">
            <label className="block min-w-0 flex-1">
              <span className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase text-muted">
                <FaSearch className="text-brand-strong" />
                Search school
              </span>
              <input
                value={schoolSearch}
                onChange={(event) => setSchoolSearch(event.target.value)}
                placeholder="Search school, principal, email, status, or location..."
                className="input w-full transition-colors"
              />
            </label>
            <label className="block min-w-0 md:w-56">
              <span className="mb-1.5 block text-2xs font-semibold uppercase text-muted">
                Province
              </span>
              <select
                value={schoolProvince}
                onChange={(event) => {
                  setSchoolProvince(event.target.value);
                  setSchoolDistrict("All Districts");
                }}
                className="input w-full transition-colors"
              >
                {schoolProvinceOptions.map((province) => (
                  <option key={province}>{province}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-0 md:w-56">
              <span className="mb-1.5 block text-2xs font-semibold uppercase text-muted">
                District
              </span>
              <select
                value={schoolDistrict}
                onChange={(event) => setSchoolDistrict(event.target.value)}
                className="input w-full transition-colors"
              >
                {schoolDistrictOptions.map((district) => (
                  <option key={district}>{district}</option>
                ))}
              </select>
            </label>
            {(schoolSearch ||
              schoolProvince !== "All Provinces" ||
              schoolDistrict !== "All Districts") && (
              <button
                type="button"
                onClick={() => {
                  setSchoolSearch("");
                  setSchoolProvince("All Provinces");
                  setSchoolDistrict("All Districts");
                }}
                className="btn btn-secondary inline-flex items-center justify-center transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink">
              <thead className="text-xs uppercase bg-surface text-subtle">
                <tr>
                  <th className="p-3">School Name</th>
                  <th className="p-3">Principal</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Support</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegisteredSchools
                  .map((school) => {
                    const status = school.status || "SUBSCRIBED";
                    const isActive = ["SUBSCRIBED", "APPROVED"].includes(
                      status
                    );
                    return (
                      <tr
                        key={school._id}
                        className="border-b border-line-strong hover:bg-surface"
                      >
                        <td className="p-3 font-medium text-ink">
                          {school.schoolName}
                        </td>
                        <td className="p-3">{school.principalName || "-"}</td>
                        <td className="p-3">{school.email}</td>
                        <td className="p-3">
                          <span
                            className={`badge badge-neutral text-xs ${
                              isActive
                                ? "bg-success-soft text-success"
                                : "bg-danger-soft text-danger"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => requestResetSchoolPassword(school)}
                            className="btn btn-primary btn-sm flex items-center gap-2 transition-colors"
                          >
                            <FaKey />
                            Reset password
                          </button>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() =>
                              requestSchoolStatusUpdate(
                                school,
                                isActive ? "UNSUBSCRIBED" : "APPROVED"
                              )
                            }
                            className={`btn btn-ghost btn-sm flex items-center gap-2 transition-colors ${
                              isActive
                                ? "bg-danger text-ink hover:bg-danger"
                                : "bg-success text-ink hover:bg-success"
                            }`}
                            style={{ color: "#ffffff" }}
                          >
                            {isActive ? (
                              <FaToggleOn style={{ color: "#ffffff" }} />
                            ) : (
                              <FaToggleOff style={{ color: "#ffffff" }} />
                            )}
                            <span style={{ color: "#ffffff" }}>
                              {isActive ? "Deactivate" : "Activate"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {filteredRegisteredSchools.length === 0 && (
              <div className="rounded-b-card border-x border-b border-line-strong bg-surface p-6 text-center text-sm font-semibold text-muted">
                No schools match your search.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "notices" && (
        <NoticeManager
          scopeMode="platform"
          title="Platform Notice Center"
          subtitle="Publish platform-wide updates that appear inside school dashboards and notification panels."
        />
      )}


      {activeTab === "spotlight" && <SchoolPromotionManager />}

      {activeTab === "events" && (
        <PlatformEventsKindSwitch
          storageKey="admin:platform-events:kind"
          trainings={<AdminTrainingsManager />}
          competitions={
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-semibold text-ink">Platform Events</h1>
              <p className="mt-1 text-sm text-muted">
                Manage platform events, school registration, rounds, notices, results, and certificates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEventWorkspaceTab("create")}
              className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaPlus />
              Create Platform Event
            </button>
          </div>

          {eventWorkspaceTab === "create" ? (
            <SendEventForm
              onEventCreated={() => {
                fetchData();
                setEventWorkspaceTab("manage");
              }}
              initialData={null}
              onCancel={() => setEventWorkspaceTab("manage")}
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {eventMetricCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.key}
                      type="button"
                      onClick={() => setEventStatusFilter(card.key)}
                      className={` card transition-colors hover:border-brand-line hover:bg-surface-2 p-4 text-left transition-colors hover:border-brand-line ${
                        eventStatusFilter === card.key ? "" : ""
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${
                            eventMetricTones[card.tone]
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

              {lastError && (
                <AlertBanner type="error" title="Event action failed" message={lastError} />
              )}

              <section className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
                <div className="border-b border-line-strong">
                  <div className="flex flex-wrap gap-0 px-4">
                    {eventFilterTabs.map(([key, label, Icon, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setEventStatusFilter(key)}
                        className={`relative inline-flex min-h-14 items-center gap-2 px-5 text-sm font-semibold transition-colors ${
                          eventStatusFilter === key
                            ? "text-brand-strong after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:rounded-full after:bg-brand"
                            : "text-ink hover:bg-surface hover:text-brand-strong"
                        }`}
                      >
                        <Icon />
                        {label}
                        {count > 0 && (
                          <span
                            className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold ${
                              eventStatusFilter === key
                                ? "bg-brand-soft text-brand-strong"
                                : "bg-surface-2 text-muted"
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 border-t border-line-strong p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_150px_150px_auto_auto]">
                    <div className="relative">
                      <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        value={eventSearch}
                        onChange={(event) => setEventSearch(event.target.value)}
                        placeholder="Search events..."
                        className="input w-full pl-11 pr-4 transition-colors"
                      />
                    </div>
                    <select
                      value={eventTypeFilter}
                      onChange={(event) => setEventTypeFilter(event.target.value)}
                      className={`input transition-colors ${
                        showEventFilters ? "" : "hidden"
                      }`}
                    >
                      <option value="">All Types</option>
                      {eventTypes.map((type) => (
                        <option key={type} value={type}>
                          {formatEventType(type)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={eventGradeFilter}
                      onChange={(event) => setEventGradeFilter(event.target.value)}
                      className={`input transition-colors ${
                        showEventFilters ? "" : "hidden"
                      }`}
                    >
                      <option value="">All Grades</option>
                      {eventGradeOptions.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                    <select
                      value={eventVisibilityFilter}
                      onChange={(event) => setEventVisibilityFilter(event.target.value)}
                      className={`input transition-colors ${
                        showEventFilters ? "" : "hidden"
                      }`}
                    >
                      <option value="">All Visibility</option>
                      <option value="INVITED">School Visible</option>
                      <option value="PUBLIC">Public</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setEventSearch("");
                        setEventTypeFilter("");
                        setEventGradeFilter("");
                        setEventVisibilityFilter("");
                      }}
                      className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEventFilters((value) => !value)}
                      className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <FaFilter />
                      Filters
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {filteredPlatformEvents.length === 0 ? (
                    <EmptyState
                      icon={FaCalendarAlt}
                      title="No platform events found"
                      description="Create a platform event or adjust filters to see more records."
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredPlatformEvents.map((event) => (
                        <EventCard
                          key={event._id}
                          event={event}
                          onCancel={() => requestCancelEvent(event)}
                          onPermanentDelete={() => requestPermanentDeleteEvent(event)}
                          onUpdateStatus={updateEventStatus}
                          isDeleting={deletingId === event._id}
                          onEdit={(selectedEvent) => setEditingEvent(selectedEvent)}
                          actionMode={
                            isTerminalEvent(event)
                              ? "archived"
                              : isCompletedEvent(event)
                              ? "completed"
                              : "manage"
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
          }
        />
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim"
          onClick={() => setEditingEvent(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-surface rounded-card shadow-pop border border-line-strong"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setEditingEvent(null)}
              className="btn btn-primary absolute right-4 top-4 z-10"
            >
              Close
            </button>
            <div className="p-1">
              <SendEventForm
                onEventCreated={() => {
                  fetchData();
                  setEditingEvent(null);
                }}
                initialData={editingEvent}
                onCancel={() => setEditingEvent(null)}
              />
            </div>
          </div>
        </div>
      )}

      <CredentialsModal
        isOpen={credentialsModal.isOpen}
        credentials={credentialsModal.credentials}
        onClose={() =>
          setCredentialsModal({ isOpen: false, credentials: null })
        }
      />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={Boolean(confirmState?.busy)}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState?.type === "school-status") {
            updateStatus(confirmState.school._id, confirmState.newStatus);
          } else if (confirmState?.type === "school-password") {
            resetSchoolPassword(confirmState.school);
          } else if (confirmState?.type === "event-cancel") {
            cancelEvent(confirmState.event._id);
          } else if (confirmState?.type === "event-permanent-delete") {
            permanentlyDeleteEvent(confirmState.event._id);
          }
        }}
      />
    </DashboardLayout>
  );
}

export default function AdminDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas p-4 sm:p-5 text-ink">
          <LoadingState
            title="Loading super admin dashboard"
            message="Preparing schools, platform events, notices, and challenges."
          />
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}
