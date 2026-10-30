"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { Bell as FaBell, CircleCheck as FaCheckCircle, SquarePen as FaEdit, Ellipsis as FaEllipsisH, Eye as FaEye, Layers as FaLayerGroup, Play as FaPlay, Plus as FaPlus, Save as FaSave, Search as FaSearch, Trash2 as FaTrash, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Spinner from "@/components/ui/Spinner";
import AppDate from "@/components/common/AppDate";
import { getEventStartState } from "@/lib/eventStartRules";

const NON_FINAL_STATUS_BUTTONS = [
  { value: "SELECTED", label: "Selected" },
  { value: "DISQUALIFIED", label: "Disqualified" },
  { value: "NOT_ATTEMPTED", label: "Not Attempted" },
];

const FINAL_STATUS_BUTTONS = [
  { value: "WINNER", label: "Winner" },
  { value: "RUNNER_UP", label: "1st Runner Up" },
  { value: "THIRD_PLACE", label: "2nd Runner Up" },
  { value: "FINALIST", label: "Finalist" },
  { value: "DISQUALIFIED", label: "Disqualified" },
  { value: "NOT_ATTEMPTED", label: "Not Attempted" },
];

const EMPTY_ROUND_FORM = {
  title: "",
  isFinal: false,
};

function label(value) {
  if (value === "RUNNER_UP") return "1st Runner Up";
  if (value === "THIRD_PLACE") return "2nd Runner Up";
  if (value === "NOT_ATTEMPTED") return "Not Attempted";
  if (value === "SHORTLIST_PUBLISHED") return "Shortlist Published";
  return String(value || "").replaceAll("_", " ");
}

function buildRoundForm(round) {
  return {
    title: round?.title || "",
    isFinal: Boolean(round?.roundType === "FINAL" || round?.isFinal),
  };
}

function isFinalRoundRecord(round) {
  return round?.roundType === "FINAL" || Boolean(round?.isFinal);
}

function getStatusPillClass(status, active = false) {
  if (status === "WINNER") {
    return active
      ? "border-warning bg-warning text-white"
      : "";
  }
  if (status === "RUNNER_UP" || status === "THIRD_PLACE") {
    return active
      ? "border-brand bg-brand text-white"
      : "border-brand bg-brand text-white";
  }
  if (status === "FINALIST" || status === "SELECTED") {
    return active
      ? "border-success bg-success text-white"
      : status === "SELECTED"
      ? ""
      : "border-brand bg-brand text-white";
  }
  if (status === "DISQUALIFIED") {
    return active
      ? "border-danger bg-danger text-white"
      : "";
  }
  if (status === "NOT_ATTEMPTED") {
    return active
      ? "border-line-strong bg-subtle text-white"
      : "";
  }
  return active
    ? "border-brand bg-brand text-white"
    : "border-line bg-brand-soft text-muted";
}

function getStatusActionButtonClass(status, active = false) {
  if (!active) {
    return "border-line-strong bg-surface text-brand-strong hover:bg-surface";
  }
  if (status === "SELECTED" || status === "WINNER") {
    return "";
  }
  if (status === "RUNNER_UP" || status === "THIRD_PLACE" || status === "FINALIST") {
    return "";
  }
  if (status === "DISQUALIFIED") {
    return "";
  }
  if (status === "NOT_ATTEMPTED") {
    return "";
  }
  return "";
}

function summarizeTeamRoundParticipant(participant) {
  const members = Array.isArray(participant?.members) ? participant.members : [];
  return {
    schoolName:
      participant?.school?.schoolName || participant?.school?.name || "School",
    teamName: participant?.teamName || "School Team",
    captainName:
      participant?.captainStudent?.name || members[0]?.name || "Not set",
    members,
    memberCount: participant?.memberCount || members.length || 0,
  };
}

export default function RoundsTab({
  event,
  requests = [],
  readOnly = false,
  onCompetitionClosed,
  onEventStarted,
  onAddNotice,
}) {
  const eventId = event.id || event._id;
  const isTeamEvent =
    String(event?.participationFormat || "INDIVIDUAL").toUpperCase() === "TEAM";
  const competitionLocked = Boolean(
    event?.resultsPublished || event?.lifecycleStatus === "COMPLETED"
  );
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [participantFilter, setParticipantFilter] = useRememberedState(`rounds:${eventId}:participants`, "all");
  const [searchTerm, setSearchTerm] = useRememberedState(`rounds:${eventId}:search`, "");
  const [gradeFilter, setGradeFilter] = useRememberedState(`rounds:${eventId}:grade`, "all");
  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [editingRoundId, setEditingRoundId] = useState("");
  const [roundForm, setRoundForm] = useState(EMPTY_ROUND_FORM);
  const [busyKey, setBusyKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [openRoundMenuId, setOpenRoundMenuId] = useState("");
  const startState = useMemo(
    () => getEventStartState(event, requests),
    [event, requests]
  );

  const fetchRounds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/events/${eventId}/rounds`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load rounds.");
      }
      const nextRounds = Array.isArray(data.rounds) ? data.rounds : [];
      setRounds(nextRounds);
      setSelectedRoundId((current) =>
        current && nextRounds.some((round) => round._id === current)
          ? current
          : nextRounds[nextRounds.length - 1]?._id || ""
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    if (!openRoundMenuId) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest("[data-round-action-menu]")) {
        setOpenRoundMenuId("");
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [openRoundMenuId]);

  const selectedRound =
    rounds.find((round) => round._id === selectedRoundId) || rounds[0] || null;
  const isFinalRound = isFinalRoundRecord(selectedRound);
  const latestRound = rounds[rounds.length - 1] || null;
  const isLatestRound =
    selectedRound && latestRound
      ? String(selectedRound._id) === String(latestRound._id)
      : false;
  const statusButtons = isFinalRound ? FINAL_STATUS_BUTTONS : NON_FINAL_STATUS_BUTTONS;

  const selectedCount = useMemo(
    () =>
      (selectedRound?.participants || []).filter(
        (participant) => participant.status === "SELECTED"
      ).length,
    [selectedRound]
  );

  const gradeOptions = useMemo(() => {
    if (isTeamEvent) return [];
    const grades = new Set();
    (selectedRound?.participants || []).forEach((participant) => {
      const grade = participant.student?.grade;
      if (grade) grades.add(String(grade));
    });
    return Array.from(grades).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [isTeamEvent, selectedRound]);

  const visibleParticipants = useMemo(() => {
    let participants = selectedRound?.participants || [];
    if (participantFilter === "selected") {
      participants = participants.filter(
        (participant) => participant.status === "SELECTED"
      );
    }
    if (!isTeamEvent && gradeFilter !== "all") {
      participants = participants.filter(
        (participant) => String(participant.student?.grade || "") === gradeFilter
      );
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      participants = participants.filter((participant) => {
        const name = isTeamEvent
          ? participant.teamName || ""
          : participant.student?.name || "";
        const schoolName =
          participant.school?.schoolName || participant.school?.name || "";
        return (
          name.toLowerCase().includes(term) ||
          schoolName.toLowerCase().includes(term)
        );
      });
    }
    return participants;
  }, [participantFilter, selectedRound, isTeamEvent, gradeFilter, searchTerm]);

  const roundMetrics = useMemo(() => {
    const participants = selectedRound?.participants || [];
    const completedParticipants = participants.filter((participant) =>
      [
        "WINNER",
        "RUNNER_UP",
        "THIRD_PLACE",
        "FINALIST",
        "SELECTED",
        "DISQUALIFIED",
        "NOT_ATTEMPTED",
      ].includes(participant.status)
    );

    return {
      total: participants.length,
      selected: participants.filter((participant) => participant.status === "SELECTED")
        .length,
      winners: participants.filter((participant) => participant.status === "WINNER")
        .length,
      runnerUps: participants.filter((participant) => participant.status === "RUNNER_UP")
        .length,
      thirdPlaces: participants.filter(
        (participant) => participant.status === "THIRD_PLACE"
      ).length,
      finalists: participants.filter((participant) => participant.status === "FINALIST")
        .length,
      completed: completedParticipants.length,
      pending: Math.max(participants.length - completedParticipants.length, 0),
    };
  }, [selectedRound]);

  const openCreateRound = () => {
    if (competitionLocked) return;
    setEditingRoundId("");
    setRoundForm(EMPTY_ROUND_FORM);
    setRoundModalOpen(true);
  };

  const startEvent = async () => {
    if (!startState.canStart || competitionLocked) {
      setMessage(startState.reason || "This event cannot be started yet.");
      return;
    }

    try {
      setBusyKey("start-event");
      const res = await fetch(`/api/events/${eventId}/start-competition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to start event.");
      }
      setMessage(data.message || "Event started. Round 1 is ready.");
      await fetchRounds();
      await onEventStarted?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyKey("");
    }
  };

  const openEditRound = (round) => {
    if (competitionLocked) return;
    setEditingRoundId(round._id);
    setRoundForm(buildRoundForm(round));
    setRoundModalOpen(true);
  };

  const saveRound = async (e) => {
    e.preventDefault();
    try {
      setBusyKey("round-save");
      const url = editingRoundId
        ? `/api/events/${eventId}/rounds/${editingRoundId}`
        : `/api/events/${eventId}/rounds`;
      const method = editingRoundId ? "PATCH" : "POST";
      const payload = {
        title: roundForm.title,
        isFinal: Boolean(roundForm.isFinal),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to save round.");
      }
      setRoundModalOpen(false);
      setMessage(data.message || "Round saved.");
      await fetchRounds();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyKey("");
    }
  };

  const deleteRound = async (roundId) => {
    if (competitionLocked) return;
    try {
      setBusyKey(`delete-${roundId}`);
      const res = await fetch(`/api/events/${eventId}/rounds/${roundId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete round.");
      }
      setMessage(data.message || "Round deleted.");
      setDeleteTarget(null);
      await fetchRounds();
    } catch (error) {
      setMessage(error.message);
      setDeleteTarget(null);
    } finally {
      setBusyKey("");
    }
  };

  const updateParticipantStatus = async (participant, status) => {
    if (!selectedRound || competitionLocked) return;
    const actionKey = participant.teamKey || participant._id;
    const payload =
      isTeamEvent && Array.isArray(participant.participantIds)
        ? { participantIds: participant.participantIds, status }
        : { participantId: participant._id, status };
    try {
      setBusyKey(`participant-${actionKey}`);
      const res = await fetch(
        `/api/events/${eventId}/rounds/${selectedRound._id}/participants`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.message ||
            `Failed to update ${isTeamEvent ? "team" : "participant"}.`
        );
      }
      await fetchRounds();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyKey("");
    }
  };

  const moveSelected = async (target) => {
    if (!selectedRound || competitionLocked) return;
    if (selectedCount === 0) {
      setMessage(
        `Mark ${isTeamEvent ? "teams" : "participants"} as Selected first.`
      );
      return;
    }

    try {
      setBusyKey(`advance-${target}-${selectedRound._id}`);
      const res = await fetch(`/api/events/${eventId}/rounds/${selectedRound._id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.message ||
            `Failed to move selected ${isTeamEvent ? "teams" : "participants"}.`
        );
      }
      if (data.roundId) {
        setSelectedRoundId(String(data.roundId));
      }
      setMessage(data.message || "Participants moved.");
      await fetchRounds();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyKey("");
    }
  };

  const finalizeResults = async () => {
    if (!selectedRound) return;
    try {
      setBusyKey(`close-${selectedRound._id}`);
      // Prepare a results draft (certificate previews) instead of publishing
      // directly. Publishing — which issues certificates and notifies students —
      // happens as a deliberate second step in the Results & Certificates tab.
      const res = await fetch(`/api/events/${eventId}/results`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultsPublished: false,
          publishPublicly: false,
          confirmPublish: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to prepare results.");
      }
      setMessage(
        "Results draft prepared. Review the placements and publish them in the Results & Certificates tab."
      );
      await onCompetitionClosed?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-card border border-brand-line bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
          {message}
        </div>
      )}

      <div
        className={`card px-4 py-4 ${
          competitionLocked
            ? "border-success-line bg-success-soft text-success"
            : "border-brand-line bg-brand-soft text-brand-strong"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              competitionLocked
                ? "bg-success text-white"
                : "bg-brand text-white"
            }`}
          >
            {competitionLocked ? <FaCheckCircle /> : <FaLayerGroup />}
          </span>
          <div>
            <h2 className="font-semibold">
              {competitionLocked ? "Competition is closed" : "Competition rounds are active"}
            </h2>
            <p className="mt-1 text-sm opacity-90">
              {competitionLocked
                ? "All rounds are locked. Certificates and results are available in the Results & Certificates tab."
                : `Approved ${isTeamEvent ? "teams" : "students"} move through each round automatically when selected.`}
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-visible">
        <div className="flex flex-col gap-4 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Rounds</h2>
            <p className="mt-1 text-sm text-muted">
              {readOnly
                ? "View each round and its outcomes."
                : rounds.length === 0
                ? "Go live to create Round 1 and freeze the participant list."
                : "Manage each round and update outcomes. Selected entries can move forward."}
            </p>
          </div>
          {!competitionLocked &&
            !readOnly &&
            startState.mode !== "STARTED" &&
            !loading &&
            rounds.length === 0 && (
            <button
              type="button"
              onClick={startEvent}
              disabled={!startState.canStart || busyKey === "start-event"}
              aria-busy={busyKey === "start-event"}
              title={
                startState.canStart
                  ? "Start the event and begin rounds"
                  : startState.reason
              }
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {busyKey === "start-event" ? <Spinner /> : <FaPlay />}
              <span className="">
                {busyKey === "start-event" ? "Starting..." : "Go Live"}
              </span>
            </button>
          )}
          {(startState.mode === "STARTED" || rounds.length > 0) && (
            <div className="flex items-center gap-3">
              {/* Live is a status, not an action — the event is already running. */}
              <span className="badge badge-danger inline-flex items-center gap-2 text-xs uppercase tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                </span>
                Live
              </span>
              {!competitionLocked && !readOnly && (
                <button
                  type="button"
                  onClick={openCreateRound}
                  className="btn btn-primary inline-flex items-center gap-2"
                >
                  <FaPlus />
                  <span className="">Add Round</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto md:overflow-visible">
          <table className="min-w-full text-left">
            <thead className="bg-surface text-2xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Round</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">
                  {isTeamEvent ? "Teams" : "Participants"}
                </th>
                <th className="px-4 py-2.5">
                  Selected {isTeamEvent ? "Teams" : ""}
                </th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-7 text-center text-muted">
                    Loading rounds...
                  </td>
                </tr>
              ) : rounds.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-7 text-center text-muted">
                    <p className="font-semibold text-ink">
                      No rounds yet. Go live to create Round 1.
                    </p>
                    <p className="mt-1 text-sm">
                      {startState.canStart
                        ? `${startState.entryCount} ${startState.unitLabel} ready.`
                        : startState.reason}
                    </p>
                  </td>
                </tr>
              ) : (
                rounds.map((round, index) => {
                  const roundKey = String(
                    round?._id ||
                      (round?.roundNumber !== undefined || round?.title
                        ? `${round?.roundNumber ?? "round"}-${round?.title ?? "untitled"}`
                        : `round-row-${index}`)
                  );
                  const participantCount = (round.participants || []).length;
                  const roundSelectedCount = (round.participants || []).filter(
                    (participant) => participant.status === "SELECTED"
                  ).length;
                  return (
                    <tr
                      key={roundKey}
                      className={`border-t border-line ${
                        String(selectedRoundId) === String(round._id)
                          ? "bg-brand-soft"
                          : "bg-surface"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                              isFinalRoundRecord(round)
                                ? "bg-brand-soft text-brand-strong"
                                : round.status === "COMPLETED"
                                ? "bg-success-soft text-success"
                                : "bg-brand-soft text-brand-strong"
                            }`}
                          >
                            {isFinalRoundRecord(round) ? <FaTrophy /> : round.roundNumber}
                          </span>
                          <span>
                            <span className="block font-semibold text-ink">
                              {round.title}
                            </span>
                            <span className="text-xs font-semibold text-muted">
                              {isFinalRoundRecord(round)
                                ? "Final Round"
                                : round.roundNumber === 1
                                ? "Preliminary Round"
                                : `Round ${round.roundNumber}`}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-muted">
                        <AppDate value={round.date} fallback="Not set" />
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted">
                        <strong className="block text-ink">{participantCount}</strong>
                        {isTeamEvent ? "Teams" : participantCount === 1 ? "Student" : "Students"}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted">
                        <strong className="block text-ink">{roundSelectedCount}</strong>
                        Selected
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="badge badge-success inline-flex text-xs">
                          {label(round.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRoundId(String(round._id))}
                            className="btn btn-secondary btn-sm"
                          >
                            {isFinalRoundRecord(round)
                              ? readOnly
                                ? "View Final"
                                : "Manage Final"
                              : "View Details"}
                          </button>
                          {!readOnly && (
                          <div className="relative" data-round-action-menu>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRoundMenuId((current) =>
                                  current === String(round._id) ? "" : String(round._id)
                                )
                              }
                              disabled={competitionLocked}
                              className="btn btn-ghost"
                              title="Round actions"
                              aria-haspopup="menu"
                              aria-expanded={openRoundMenuId === String(round._id)}
                            >
                              <FaEllipsisH />
                            </button>
                            {openRoundMenuId === String(round._id) && (
                              <div className="card absolute right-0 top-11 z-20 w-40 overflow-hidden py-1 shadow-pop">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRoundMenuId("");
                                    openEditRound(round);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-brand-strong hover:bg-surface"
                                  role="menuitem"
                                >
                                  <FaEdit />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `delete-${round._id}`}
                                  onClick={() => {
                                    setOpenRoundMenuId("");
                                    setDeleteTarget(round);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger-soft"
                                  role="menuitem"
                                >
                                  <FaTrash />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRound && (
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-brand-line bg-brand-soft px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">
                  {selectedRound.title}
                </h3>
                <span className="badge badge-brand uppercase">
                  {isFinalRound ? "Final Placement" : "Round Management"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-muted">
                Date: <AppDate value={selectedRound.date} fallback="Not set" />
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-[720px]">
              <button
                type="button"
                onClick={() => setParticipantFilter("all")}
                className={`btn btn-ghost btn-sm inline-flex items-center gap-1.5 ${
                  participantFilter === "all"
                    ? "bg-brand text-white"
                    : "border border-brand-line bg-surface text-brand-strong"
                }`}
              >
                <FaTrophy />
                <span className={participantFilter === "all" ? "" : ""}>
                  {isFinalRound ? "Final Round" : selectedRound.title}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setParticipantFilter("selected")}
                className={`btn btn-ghost btn-sm inline-flex items-center gap-1.5 ${
                  participantFilter === "selected"
                    ? "bg-brand text-white"
                    : "border border-brand-line bg-surface text-brand-strong"
                }`}
              >
                <FaUsers />
                <span className={participantFilter === "selected" ? "" : ""}>
                  Selected ({selectedCount})
                </span>
              </button>
              {!readOnly && (
              <button
                type="button"
                onClick={() => onAddNotice?.(selectedRound)}
                disabled={competitionLocked}
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                <FaBell />
                Add Notice
              </button>
              )}
              {!readOnly && (
              <button
                type="button"
                onClick={() => openEditRound(selectedRound)}
                disabled={competitionLocked}
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                <FaEye />
                Round Details
              </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-b border-brand-line px-5 py-4 md:grid-cols-4">
            <div className="rounded-card border border-brand-line bg-brand-soft px-4 py-4">
              <div className="text-xs font-semibold uppercase text-brand-strong">
                {isTeamEvent ? "Teams In Round" : "Entries In Round"}
              </div>
              <div className="mt-2 text-2xl font-semibold text-ink">
                {roundMetrics.total}
              </div>
              <p className="mt-2 text-sm text-muted">
                {isTeamEvent
                  ? "All approved teams currently active in this round."
                  : "All approved participants currently active in this round."}
              </p>
            </div>
            <div className="rounded-card border border-success-line bg-success-soft px-4 py-4">
              <div className="text-xs font-semibold uppercase text-success">
                Selected
              </div>
              <div className="mt-2 text-2xl font-semibold text-success">
                {isFinalRound
                  ? roundMetrics.winners +
                    roundMetrics.runnerUps +
                    roundMetrics.thirdPlaces +
                    roundMetrics.finalists
                  : roundMetrics.selected}
              </div>
              <p className="mt-2 text-sm text-success">
                {isFinalRound
                  ? "Participants with final placement."
                  : isTeamEvent
                  ? "Teams ready to move to the next stage."
                  : "Participants ready to move to the next stage."}
              </p>
            </div>
            <div className="rounded-card border border-brand-line bg-brand-soft px-4 py-4">
              <div className="text-xs font-semibold uppercase text-brand-strong">
                Awaiting Decision
              </div>
              <div className="mt-2 text-2xl font-semibold text-ink">
                {roundMetrics.pending}
              </div>
              <p className="mt-2 text-sm text-muted">
                Review these {isTeamEvent ? "teams" : "participants"} and set their
                round outcome.
              </p>
            </div>
            <div className="rounded-card border border-warning-line bg-warning-soft px-4 py-4">
              <div className="text-xs font-semibold uppercase text-warning">
                Advancement Mode
              </div>
              <div className="mt-2 text-lg font-semibold text-ink">
                {isFinalRound ? "Final Placement" : "Qualification"}
              </div>
              <p className="mt-2 text-sm text-warning">
                {isFinalRound
                  ? `Mark ${isTeamEvent ? "team" : "participant"} outcomes here, then finalize to review and publish results.`
                  : `Select ${isTeamEvent ? "teams" : "participants"} and send them to the next round or final.`}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-brand-line px-5 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  isTeamEvent
                    ? "Search by team or school name..."
                    : "Search by student or school name..."
                }
                className="input w-full pl-9 pr-3"
              />
            </div>
            {!isTeamEvent && gradeOptions.length > 0 && (
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="input sm:w-48"
              >
                <option value="all">All Grades</option>
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade}>
                    {/^\d+$/.test(grade) ? `Grade ${grade}` : grade}
                  </option>
                ))}
              </select>
            )}
            {(searchTerm || gradeFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setGradeFilter("all");
                }}
                className="btn btn-secondary"
              >
                Clear
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-surface text-2xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">School Name</th>
                  <th className="px-4 py-2.5">
                    {isTeamEvent ? "Team" : "Student Name"}
                  </th>
                  <th className="px-4 py-2.5">
                    {isTeamEvent ? "Members" : "Grade"}
                  </th>
                  <th className="px-4 py-2.5">Current Status</th>
                  {!readOnly && <th className="px-4 py-2.5">Update Status</th>}
                </tr>
              </thead>
              <tbody>
                {visibleParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? "4" : "5"} className="px-4 py-7 text-center text-muted">
                      No {isTeamEvent ? "teams" : "participants"} in this view yet.
                    </td>
                  </tr>
                ) : (
                  visibleParticipants.map((participant) => (
                    <tr
                      key={String(
                        participant._id ||
                          participant.student?._id ||
                          participant.student ||
                          `${participant.school?._id || participant.school}-${participant.student?.name || "student"}`
                      )}
                      className="border-t border-line"
                    >
                      <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                        {isTeamEvent
                          ? summarizeTeamRoundParticipant(participant).schoolName
                          : participant.school?.schoolName ||
                            participant.school?.name ||
                            "School"}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-ink">
                        {isTeamEvent ? (
                          <div>
                            <div className="font-semibold text-ink">
                              {summarizeTeamRoundParticipant(participant).teamName}
                            </div>
                            <div className="mt-1 text-xs text-muted">
                              Captain: {summarizeTeamRoundParticipant(participant).captainName}
                            </div>
                            <div className="badge badge-neutral mt-2 inline-flex font-semibold uppercase tracking-wide">
                              {summarizeTeamRoundParticipant(participant).memberCount} member
                              {summarizeTeamRoundParticipant(participant).memberCount === 1 ? "" : "s"}
                            </div>
                          </div>
                        ) : (
                          participant.student?.name || "Student"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted">
                        {isTeamEvent ? (
                          <div className="space-y-2">
                            <div className="font-medium text-ink">
                              {summarizeTeamRoundParticipant(participant).memberCount} members
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {summarizeTeamRoundParticipant(participant).members.length > 0 ? (
                                summarizeTeamRoundParticipant(participant).members.map((member) => (
                                  <span
                                    key={member?._id || member?.studentId || member?.name}
                                    className="badge badge-brand inline-flex text-xs font-medium"
                                  >
                                    {member?.name || "Member"}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-muted">
                                  No members linked
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          participant.student?.grade || "N/A"
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`badge badge-neutral inline-flex text-xs font-semibold ${getStatusPillClass(
                            participant.status
                          )}`}
                        >
                          <span className="">
                            {label(participant.status)}
                          </span>
                        </span>
                      </td>
                      {!readOnly && (
                      <td className="px-4 py-2.5">
                        <div className="flex flex-nowrap gap-1.5 whitespace-nowrap">
                          {statusButtons.map((button) => {
                            const isActive = participant.status === button.value;
                            return (
                              <button
                                key={`${String(participant._id || participant.student?._id || participant.student)}-${button.value}`}
                                type="button"
                                disabled={
                                  competitionLocked ||
                                  busyKey ===
                                    `participant-${participant.teamKey || participant._id}`
                                }
                                onClick={() => updateParticipantStatus(participant, button.value)}
                                className={`btn btn-secondary btn-sm font-semibold leading-tight ${getStatusActionButtonClass(
                                  button.value,
                                  isActive
                                )}`}
                              >
                                <span className={isActive ? "" : ""}>
                                  {button.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!readOnly && (
          <div className="border-t border-line px-5 py-4">
            <div className="flex flex-wrap justify-end gap-3">
              {!isFinalRound && (
                <>
                  <button
                    type="button"
                    disabled={
                      !isLatestRound ||
                      competitionLocked ||
                      busyKey === `advance-next-${selectedRound._id}` ||
                      selectedCount === 0
                    }
                    onClick={() => moveSelected("next")}
                    className="btn btn-primary"
                  >
                    <span className="">
                      Send to Next Round ({selectedCount}{" "}
                      {isTeamEvent ? "team" : "entry"}
                      {selectedCount === 1 ? "" : "s"})
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={
                      !isLatestRound ||
                      competitionLocked ||
                      busyKey === `advance-final-${selectedRound._id}` ||
                      selectedCount === 0
                    }
                    onClick={() => moveSelected("final")}
                    className="btn btn-primary"
                  >
                    <span className="">
                      Send to Final Round ({selectedCount}{" "}
                      {isTeamEvent ? "team" : "entry"}
                      {selectedCount === 1 ? "" : "s"})
                    </span>
                  </button>
                </>
              )}
              {isFinalRound && (
                <button
                  type="button"
                  disabled={
                    competitionLocked ||
                    !isLatestRound ||
                    busyKey === `close-${selectedRound._id}`
                  }
                  onClick={finalizeResults}
                  className="btn btn-primary inline-flex items-center gap-2"
                >
                  <FaCheckCircle />
                  <span className="">
                    {busyKey === `close-${selectedRound._id}`
                      ? "Preparing..."
                      : "Finalize & Review Results"}
                  </span>
                </button>
              )}
              {!isLatestRound && (
                <div className="card px-4 py-2 text-sm text-muted">
                  Only the latest round can send {isTeamEvent ? "teams" : "students"} forward or finalize results.
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {roundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <form
            onSubmit={saveRound}
            className="w-full max-w-2xl rounded-card bg-surface p-4 sm:p-5 shadow-pop"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-ink">
                {editingRoundId ? "Edit Round" : "Create Round"}
              </h3>
              <button
                type="button"
                onClick={() => setRoundModalOpen(false)}
                className="text-sm text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <div className="mb-1 text-sm font-medium text-ink">Round Name</div>
                <input
                  required
                  value={roundForm.title}
                  onChange={(e) =>
                    setRoundForm((current) => ({ ...current, title: e.target.value }))
                  }
                  className="input w-full"
                />
              </label>
              <label className="btn btn-secondary md:col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(roundForm.isFinal)}
                  onChange={(e) =>
                    setRoundForm((current) => ({
                      ...current,
                      isFinal: e.target.checked,
                      title:
                        e.target.checked && !current.title
                          ? "Final Round"
                          : current.title,
                    }))
                  }
                />
                Mark this as the final round
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={busyKey === "round-save"}
                className="btn btn-primary inline-flex items-center gap-2 font-semibold"
              >
                <FaSave />
                <span className="">
                  {busyKey === "round-save" ? "Saving..." : "Save Round"}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this round?"
        message={
          deleteTarget
            ? `${deleteTarget.title} will be removed from this event's round plan.`
            : ""
        }
        confirmLabel="Delete round"
        tone="danger"
        busy={Boolean(deleteTarget && busyKey === `delete-${deleteTarget._id}`)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?._id) deleteRound(deleteTarget._id);
        }}
      />

    </div>
  );
}
