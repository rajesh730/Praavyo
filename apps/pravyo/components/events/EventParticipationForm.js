"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { School as FaSchool, Search as FaSearch, X as FaTimes, Check as FaCheck, Users as FaUsers } from "lucide-react";
import { useSession } from "next-auth/react";
import { gradeListContains, normalizeGradeValue } from "@/lib/schoolGrades";
import { isDatePast } from "@/lib/eventUiStatus";
import AppDate from "@/components/common/AppDate";
import { isTeamEventLike } from "@/lib/eventParticipationFormat";
import AlertBanner from "@/components/ui/AlertBanner";

function normalizeSchoolTeamBaseName(schoolName = "") {
  const cleaned = String(schoolName || "")
    .replace(/\bschool\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "School";
}

function buildDefaultTeamName(schoolName = "", index = 0) {
  const base = `Team ${normalizeSchoolTeamBaseName(schoolName)}`.trim();
  return index > 0 ? `${base} ${index + 1}` : base;
}

function validateTeamDraft(team, { minTeamSize = 0, maxTeamSize = 0 } = {}) {
  const issues = [];
  const memberCount = Array.isArray(team?.studentIds) ? team.studentIds.length : 0;
  const teamName = String(team?.teamName || "").trim();
  const captainStudentId = String(team?.captainStudentId || "").trim();

  if (!teamName) issues.push("Missing team name");
  if (memberCount === 0) issues.push("No members selected");
  if (minTeamSize && memberCount < minTeamSize) {
    issues.push(`Needs at least ${minTeamSize} members`);
  }
  if (maxTeamSize && memberCount > maxTeamSize) {
    issues.push(`Allows at most ${maxTeamSize} members`);
  }
  if (!captainStudentId) {
    issues.push("Captain not selected");
  } else if (!team?.studentIds?.includes(captainStudentId)) {
    issues.push("Captain must be a selected member");
  }

  return {
    isValid: issues.length === 0,
    issues,
    memberCount,
  };
}

const STUDENT_STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "UNREGISTERED", label: "Unregistered" },
  { id: "REGISTERED", label: "Registered" },
];

const EventParticipationForm = memo(function EventParticipationForm({
  event,
  onSuccess,
  isEditing = false,
}) {
  const { data: session } = useSession();
  const [formData, setFormData] = useState({
    teamName: "",
    captainStudentId: "",
    selectedStudents: [],
    teams: [
      {
        teamName: "",
        captainStudentId: "",
        studentIds: [],
      },
    ],
  });

  const [students, setStudents] = useState([]);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [sectionsByGrade, setSectionsByGrade] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [grades, setGrades] = useState([]);
  const [activeTeamIndex, setActiveTeamIndex] = useState(0);
  const [savedParticipation, setSavedParticipation] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [interestedStudents, setInterestedStudents] = useState([]);
  const [interestedFilter, setInterestedFilter] = useState("all"); // all, pending, approved, rejected
  const registrationDeadline = event.registrationDeadline || event.deadline;
  const isTeamEvent = isTeamEventLike(event);
  const minTeamSize = Number(event.minTeamSize || 0) || 0;
  const maxTeamSize = Number(event.maxTeamSize || 0) || 0;
  const schoolDisplayName =
    session?.user?.schoolName || session?.user?.name || "";
  const lifecycleStatus = String(event.lifecycleStatus || "ACTIVE").toUpperCase();
  const isRegistrationClosed = Boolean(
    registrationDeadline && isDatePast(registrationDeadline, { endOfDay: true })
  );
  const isEventLocked =
    lifecycleStatus === "COMPLETED" ||
    lifecycleStatus === "ARCHIVED" ||
    isRegistrationClosed;
  const lockReason =
    lifecycleStatus === "ARCHIVED"
      ? "This event is archived. Registration changes are locked."
      : lifecycleStatus === "COMPLETED"
      ? "This event is completed. Teams are locked; use rounds/results for final work."
      : isRegistrationClosed
      ? "Registration deadline has passed. Team changes are locked."
      : "";

  const loadSchoolParticipationDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${event._id}/participate`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        const requests = Array.isArray(data.requests) ? data.requests : [];
        const participation = data.participation || null;

        setInterestedStudents(requests);
        setSavedParticipation(participation?.myParticipation || null);

        setFormData((prev) => ({
          ...prev,
          selectedStudents: Array.isArray(participation?.myParticipation?.studentIds)
            ? participation.myParticipation.studentIds
            : prev.selectedStudents,
          teamName: participation?.myParticipation?.teamName || prev.teamName,
          captainStudentId:
            String(participation?.myParticipation?.captainStudent || "") ||
            prev.captainStudentId,
          teams:
            Array.isArray(participation?.myParticipation?.teams) &&
            participation.myParticipation.teams.length > 0
              ? participation.myParticipation.teams.map((team) => ({
                  teamName: team.teamName || "",
                  captainStudentId: String(team.captainStudent || ""),
                  studentIds: Array.isArray(team.memberIds) ? team.memberIds : [],
                }))
              : isTeamEvent
              ? [
                  {
                    teamName: buildDefaultTeamName(schoolDisplayName, 0),
                    captainStudentId: "",
                    studentIds: [],
                  },
                ]
              : prev.teams,
        }));
      } else {
        setInterestedStudents([]);
        setSavedParticipation(null);
      }
    } catch (error) {
      console.error("Error loading school participation details:", error);
      setInterestedStudents([]);
      setSavedParticipation(null);
    }
  }, [event._id, isTeamEvent, schoolDisplayName]);

  const loadGrades = useCallback(async () => {
    try {
      const res = await fetch("/api/school/grade-structure", {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        let fetchedGrades = json.grades || json.data?.grades || [];

        // Filter grades if event has restrictions
        if (event.eligibleGrades && event.eligibleGrades.length > 0) {
          fetchedGrades = fetchedGrades.filter((g) => {
            const gradeVal = g._id || g;
            return gradeListContains(event.eligibleGrades, gradeVal);
          });
        }

        setGrades(fetchedGrades);
      } else {
        setGrades([]);
      }
    } catch (error) {
      console.error("Error loading grades:", error);
      setGrades([]);
    }
  }, [event.eligibleGrades]);

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/students?page=1&limit=1000");
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data.students) ? data.students : []);
      } else {
        setStudents([]);
      }
    } catch (error) {
      console.error("Error loading students:", error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
    loadGrades();
    // Sections are configured per grade in the school dashboard.
    fetch("/api/school/sections", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setSectionsByGrade(Object.fromEntries((data?.sections || []).map((row) => [normalizeGradeValue(row.grade), row.sections || []]))))
      .catch(() => setSectionsByGrade({}));
  }, [loadGrades, loadStudents]);

  const sectionOptions = gradeFilter === "all" ? [] : sectionsByGrade[normalizeGradeValue(gradeFilter)] || [];

  useEffect(() => {
    if (session?.user?.role === "SCHOOL_ADMIN") {
      loadSchoolParticipationDetails();
    }
  }, [loadSchoolParticipationDetails, session?.user?.role]);

  useEffect(() => {
    if (!isTeamEvent || !schoolDisplayName) return;
    setFormData((prev) => {
      if (!Array.isArray(prev.teams) || prev.teams.length === 0) {
        return {
          ...prev,
          teams: [
            {
              teamName: buildDefaultTeamName(schoolDisplayName, 0),
              captainStudentId: "",
              studentIds: [],
            },
          ],
        };
      }

      const nextTeams = prev.teams.map((team, index) => {
        if (String(team.teamName || "").trim()) return team;
        return {
          ...team,
          teamName: buildDefaultTeamName(schoolDisplayName, index),
        };
      });

      return { ...prev, teams: nextTeams };
    });
  }, [isTeamEvent, schoolDisplayName]);

  const participationMap = new Map(
    interestedStudents
      .filter((r) => r.student?._id)
      .map((r) => [String(r.student._id), r])
  );

  const hasExistingParticipation = interestedStudents.some((request) =>
    ["PENDING", "APPROVED", "ENROLLED", "REJECTED"].includes(request.status)
  );

  const filteredStudents = students
    .filter((student) => {
      const request = participationMap.get(String(student._id));
      const requestStatus = String(request?.status || "").toUpperCase();

      const matchesSearch = student.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const sGrade =
        student.grade &&
        (student.grade.name || student.grade._id || student.grade);

      // Check eligibility
      const isEligible =
        !event.eligibleGrades ||
        event.eligibleGrades.length === 0 ||
        gradeListContains(event.eligibleGrades, sGrade);

      if (!isEligible) return false;

      const matchesGrade =
        gradeFilter === "all" ||
        normalizeGradeValue(sGrade) === normalizeGradeValue(gradeFilter);

      const matchesStatus =
        interestedFilter === "all" ||
        (interestedFilter === "UNREGISTERED" && !request) ||
        (interestedFilter === "REGISTERED" &&
          request &&
          ["PENDING", "APPROVED", "ENROLLED"].includes(requestStatus));

      const matchesSection =
        gradeFilter === "all" || sectionFilter === "all" || student.section === sectionFilter;

      return matchesSearch && matchesGrade && matchesSection && matchesStatus;
    })
    .sort((a, b) => {
      // Sort selected students to the top
      const aSelected = formData.selectedStudents.includes(String(a._id));
      const bSelected = formData.selectedStudents.includes(String(b._id));
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });

  const visibleSelectedCount = filteredStudents.filter((student) =>
    formData.selectedStudents.includes(String(student._id))
  ).length;

  const activeTeam = formData.teams[activeTeamIndex] || {
    teamName: "",
    captainStudentId: "",
    studentIds: [],
  };
  const otherTeamStudentIds = new Set(
    (formData.teams || [])
      .filter((_, index) => index !== activeTeamIndex)
      .flatMap((team) => team.studentIds || [])
      .map((id) => String(id))
  );
  const totalSelectedTeamMembers = (formData.teams || []).reduce(
    (total, team) => total + (team.studentIds?.length || 0),
    0
  );
  const draftedTeams = isTeamEvent
    ? (formData.teams || []).filter(
        (team) =>
          String(team.teamName || "").trim() ||
          String(team.captainStudentId || "").trim() ||
          (team.studentIds || []).length > 0
      )
    : [];
  const teamValidationSummaries = draftedTeams.map((team) =>
    validateTeamDraft(team, { minTeamSize, maxTeamSize })
  );
  const validTeamCount = teamValidationSummaries.filter(
    (summary) => summary.isValid
  ).length;
  const invalidTeamCount = teamValidationSummaries.length - validTeamCount;
  const teamLimit = Number(event.maxParticipantsPerSchool || 0) || 0;
  const totalTeamCapacity = Number(event.maxParticipants || 0) || 0;
  const savedTeamCount = Number(savedParticipation?.teamCount || 0) || 0;
  const savedMemberCount = Number(savedParticipation?.studentCount || 0) || 0;
  const registeredAt = savedParticipation?.registeredAt
    ? new Date(savedParticipation.registeredAt)
    : null;
  const registrationStateLabel = isEventLocked
    ? "Locked"
    : hasExistingParticipation
    ? "Submitted"
    : draftedTeams.length > 0 || formData.selectedStudents.length > 0
    ? "Draft"
    : "Not started";
  const registrationStateTone = isEventLocked
    ? "border-warning-line bg-warning-soft text-warning"
    : hasExistingParticipation
    ? "border-success-line bg-success-soft text-success"
    : draftedTeams.length > 0 || formData.selectedStudents.length > 0
    ? "border-brand-line bg-brand-soft text-brand"
    : "border-line bg-surface text-ink";
  const canSubmitTeamRegistration =
    !isEventLocked &&
    isTeamEvent &&
    draftedTeams.length > 0 &&
    invalidTeamCount === 0 &&
    draftedTeams.length === validTeamCount;
  const selectedParticipantCount = isTeamEvent
    ? totalSelectedTeamMembers
    : formData.selectedStudents.length;
  const activeSelectedCount = isTeamEvent
    ? activeTeam.studentIds.length
    : formData.selectedStudents.length;

  const handleStudentToggle = (studentId) => {
    if (isEventLocked) return;
    if (isTeamEvent) {
      if (otherTeamStudentIds.has(String(studentId))) return;
      setFormData((prev) => ({
        ...prev,
        teams: prev.teams.map((team, index) => {
          if (index !== activeTeamIndex) return team;
          const isRemoving = team.studentIds.includes(studentId);
          const nextStudentIds = isRemoving
            ? team.studentIds.filter((id) => id !== studentId)
            : [...team.studentIds, studentId];
          return {
            ...team,
            studentIds: nextStudentIds,
            captainStudentId:
              isRemoving && team.captainStudentId === studentId
                ? ""
                : team.captainStudentId,
          };
        }),
      }));
      return;
    }
    setFormData((prev) => {
      const isRemoving = prev.selectedStudents.includes(studentId);
      const nextSelectedStudents = isRemoving
        ? prev.selectedStudents.filter((id) => id !== studentId)
        : [...prev.selectedStudents, studentId];

      return {
        ...prev,
        selectedStudents: nextSelectedStudents,
        captainStudentId:
          isRemoving && prev.captainStudentId === studentId
            ? ""
            : prev.captainStudentId,
      };
    });
  };

  const handleSelectAll = (checked) => {
    if (isEventLocked) return;
    if (isTeamEvent) {
      const allowedVisibleStudents = filteredStudents
        .map((student) => String(student._id))
        .filter((id) => !otherTeamStudentIds.has(id));
      setFormData((prev) => ({
        ...prev,
        teams: prev.teams.map((team, index) => {
          if (index !== activeTeamIndex) return team;
          return {
            ...team,
            studentIds: checked
              ? [...new Set([...(team.studentIds || []), ...allowedVisibleStudents])]
              : (team.studentIds || []).filter(
                  (id) => !allowedVisibleStudents.includes(String(id))
                ),
          };
        }),
      }));
      return;
    }
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        selectedStudents: [
          ...new Set([
            ...prev.selectedStudents,
            ...filteredStudents.map((s) => String(s._id)),
          ]),
        ],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        selectedStudents: prev.selectedStudents.filter(
          (id) => !filteredStudents.some((student) => String(student._id) === id)
        ),
      }));
    }
  };

  const showRegistrationError = (message) => {
    setFeedback({
      type: "error",
      title: "Registration needs attention",
      message,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);
    if (isEventLocked) {
      showRegistrationError(
        lockReason || "Registration changes are locked for this event."
      );
      return;
    }
    if (!isTeamEvent && formData.selectedStudents.length === 0) {
      showRegistrationError("Please select at least one student.");
      return;
    }
    if (isTeamEvent) {
      const teams = (formData.teams || []).filter(
        (team) => team.teamName.trim() || team.studentIds.length > 0
      );
      if (teams.length === 0) {
        showRegistrationError("Please create at least one team.");
        return;
      }

      const seenStudents = new Set();
      for (const team of teams) {
        if (!team.teamName.trim()) {
          showRegistrationError("Each team must have a team name.");
          return;
        }
        if (!team.captainStudentId) {
          showRegistrationError(`Please select a captain for ${team.teamName}.`);
          return;
        }
        if (!team.studentIds.includes(team.captainStudentId)) {
          showRegistrationError(
            `Captain for ${team.teamName} must be one of its selected members.`
          );
          return;
        }
        if (team.studentIds.length === 0) {
          showRegistrationError(`Please select at least one member for ${team.teamName}.`);
          return;
        }
        if (minTeamSize && team.studentIds.length < minTeamSize) {
          showRegistrationError(`${team.teamName} requires at least ${minTeamSize} members.`);
          return;
        }
        if (maxTeamSize && team.studentIds.length > maxTeamSize) {
          showRegistrationError(`${team.teamName} allows at most ${maxTeamSize} members.`);
          return;
        }
        for (const studentId of team.studentIds) {
          if (seenStudents.has(studentId)) {
            showRegistrationError("A student cannot be added to more than one team.");
            return;
          }
          seenStudents.add(studentId);
        }
      }
    }

    try {
      setSubmitting(true);
      const method =
        session?.user?.role === "SCHOOL_ADMIN" && hasExistingParticipation
          ? "PUT"
          : "POST";
      const res = await fetch(`/api/events/${event._id}/participate`, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName: formData.teamName,
          captainStudentId: formData.captainStudentId,
          studentIds: formData.selectedStudents,
          teams: isTeamEvent
            ? formData.teams.map((team) => ({
                teamName: team.teamName,
                captainStudentId: team.captainStudentId,
                studentIds: team.studentIds,
              }))
            : undefined,
        }),
      });

      if (res.ok) {
        setFeedback({
          type: "success",
          title: isEditing ? "Registration updated" : "Registration submitted",
          message: isTeamEvent
            ? "Team registration has been saved for this event."
            : "Selected students have been submitted for this event.",
        });
        onSuccess?.();
      } else {
        const data = await res.json().catch(() => ({}));
        showRegistrationError(
          data.message || "Error submitting participation request."
        );
      }
    } catch (error) {
      console.error("Error:", error);
      showRegistrationError("Error submitting request. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  if (session?.user?.role === "SCHOOL_ADMIN") {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {feedback && (
          <AlertBanner
            type={feedback.type}
            title={feedback.title}
            message={feedback.message}
          />
        )}

        <section className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-2xs font-semibold uppercase text-brand-strong">
                School-managed registration
              </p>
              <h3 className="mt-1 font-semibold text-ink">
                Phase 1 registration is handled by the school.
              </h3>
              <p className="mt-1 text-sm text-muted">
                Students can see the event, but registration is submitted by the school.
              </p>
            </div>
            <span className="badge badge-neutral w-fit text-xs">
              {registrationStateLabel}
            </span>
          </div>
        </section>

        {isEventLocked && (
          <div className="rounded-card border border-warning-line bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
            {lockReason}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <FaUsers className="text-brand-strong" />
                {isTeamEvent ? "Team Registration" : "Individual Participant Registration"}
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-card border border-brand-line bg-brand-soft p-4">
                <p className="text-2xs font-semibold uppercase text-brand-strong">
                  {isTeamEvent ? "Selected Team" : "Selected Students"}
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {activeSelectedCount}
                </p>
              </div>
              <div className="rounded-card border border-warning-line bg-warning-soft p-4">
                <p className="text-2xs font-semibold uppercase text-warning">
                  Selected in View
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {visibleSelectedCount}
                </p>
              </div>
              <div className="rounded-card border border-success-line bg-success-soft p-4">
                <p className="text-2xs font-semibold uppercase text-success">
                  Eligible Students
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {filteredStudents.length}
                </p>
              </div>
            </div>

            {isTeamEvent ? (
              <div className="card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Team Setup</h4>
                    <p className="text-xs font-semibold text-muted">
                      Build teams, choose captains, then submit.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isEventLocked}
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        teams: [
                          ...prev.teams,
                          {
                            teamName: buildDefaultTeamName(
                              schoolDisplayName,
                              prev.teams.length
                            ),
                            captainStudentId: "",
                            studentIds: [],
                          },
                        ],
                      }));
                      setActiveTeamIndex((formData.teams || []).length);
                    }}
                    className="btn btn-primary btn-sm transition-colors"
                  >
                    Add Team
                  </button>
                </div>

                <label className="text-xs font-semibold text-muted">Team Name</label>
                <input
                  type="text"
                  value={activeTeam.teamName}
                  disabled={isEventLocked}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      teams: prev.teams.map((team, index) =>
                        index === activeTeamIndex
                          ? { ...team, teamName: e.target.value }
                          : team
                      ),
                    }))
                  }
                  className="input mt-2 w-full"
                />

                <label className="mt-4 block text-xs font-semibold text-muted">
                  Captain
                </label>
                <select
                  value={activeTeam.captainStudentId}
                  disabled={isEventLocked || activeTeam.studentIds.length === 0}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      teams: prev.teams.map((team, index) =>
                        index === activeTeamIndex
                          ? { ...team, captainStudentId: e.target.value }
                          : team
                      ),
                    }))
                  }
                  className="input mt-2 w-full"
                >
                  <option value="">Select captain</option>
                  {activeTeam.studentIds.map((studentId) => {
                    const student = students.find(
                      (candidate) => String(candidate._id) === String(studentId)
                    );
                    return (
                      <option key={studentId} value={studentId}>
                        {student?.name || "Selected student"}
                      </option>
                    );
                  })}
                </select>

                <div className="mt-4 space-y-2">
                  {(formData.teams || []).map((team, index) => {
                    const summary = validateTeamDraft(team, {
                      minTeamSize,
                      maxTeamSize,
                    });
                    return (
                      <button
                        key={`${team.teamName || "team"}-${index}`}
                        type="button"
                        onClick={() => setActiveTeamIndex(index)}
                        className={` card transition-colors hover:border-brand-line hover:bg-surface-2 w-full px-3 py-2 text-left transition-colors ${
                          index === activeTeamIndex
                            ? "border-brand-line bg-brand-soft"
                            : "border-line bg-surface hover:bg-surface"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-ink">
                            {team.teamName || `Team ${index + 1}`}
                          </span>
                          <span
                            className={`badge badge-neutral ${
                              summary.isValid
                                ? "bg-success-soft text-success"
                                : "bg-warning-soft text-warning"
                            }`}
                          >
                            {summary.isValid ? "Valid" : "Needs fixes"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-muted">
                          {team.studentIds.length} members
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-card border border-brand-line bg-brand-soft p-4 text-sm text-brand-strong">
                <p className="font-semibold">
                  Choose students from the list on the right.
                </p>
                <p className="mt-1 text-xs font-semibold">
                  This event does not need team names or captains. After submit,
                  registration is saved to this event.
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-ink">
                  <FaUsers className="text-brand-strong" />
                  Participant Roster
                </h3>
                <p className="mt-1 text-xs font-semibold text-muted">
                  Select eligible students and review their registration state.
                </p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {STUDENT_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setInterestedFilter(filter.id)}
                  className={`btn btn-ghost btn-sm transition-colors ${
                    interestedFilter === filter.id
                      ? "bg-brand text-white"
                      : "border border-line bg-surface text-brand-strong hover:bg-surface"
                  }`}
                  style={
                    interestedFilter === filter.id ? { color: "#ffffff" } : undefined
                  }
                >
                  <span className="">
                    {filter.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
              <div className="card flex h-11 items-center gap-2 px-3">
                <FaSearch className="text-muted" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input min-w-0 flex-1"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-muted hover:text-brand-strong"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
              <select
                value={gradeFilter}
                onChange={(e) => { setGradeFilter(e.target.value); setSectionFilter("all"); }}
                className="input"
              >
                <option value="all">All Grades</option>
                {Array.isArray(grades) &&
                  grades.map((grade) => {
                    const val = grade._id || grade;
                    const label = grade.name || grade;
                    return (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    );
                  })}
              </select>
              {sectionOptions.length > 0 && (
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="input"
                  aria-label="Filter by section"
                >
                  <option value="all">All Sections</option>
                  {sectionOptions.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="card overflow-hidden">
              {loading ? (
                <div className="p-4 sm:p-5 text-center text-sm font-semibold text-muted">
                  Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-4 sm:p-5 text-center">
                  <p className="font-semibold text-ink">
                    No students match the registration filters.
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Clear search, change grade/status filters, or check this event&apos;s registration grades.
                  </p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">
                  <label className="btn btn-secondary flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={isEventLocked}
                      checked={
                        filteredStudents.length > 0 &&
                        filteredStudents
                          .filter(
                            (student) =>
                              !isTeamEvent || !otherTeamStudentIds.has(String(student._id))
                          )
                          .every((student) =>
                            (isTeamEvent
                              ? activeTeam.studentIds
                              : formData.selectedStudents
                            ).includes(String(student._id))
                          )
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 accent-purple-700"
                    />
                    Select All Visible
                  </label>

                  <div className="divide-line">
                    {filteredStudents.map((student) => {
                      const request = participationMap.get(student._id);
                      const isSelected = isTeamEvent
                        ? activeTeam.studentIds.includes(String(student._id))
                        : formData.selectedStudents.includes(String(student._id));
                      const isAssignedElsewhere =
                        isTeamEvent && otherTeamStudentIds.has(String(student._id));
                      const requestStatus = request?.status;

                      return (
                        <label
                          key={student._id}
                          className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                            isSelected
                              ? "bg-brand-soft"
                              : isAssignedElsewhere
                              ? "cursor-not-allowed bg-surface opacity-70"
                              : "hover:bg-surface"
                          }`}
                        >
                          <input
                            disabled={isEventLocked || isAssignedElsewhere}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggle(String(student._id))}
                            className="h-4 w-4 accent-purple-700"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-ink">
                              {student.name}
                            </span>
                            <span className="block text-xs font-semibold text-muted">
                              {student.grade}
                              {student.rollNumber ? ` - Roll ${student.rollNumber}` : ""}
                            </span>
                          </span>
                          {requestStatus && (
                            <span
                              className={`badge badge-neutral ${
                                requestStatus === "APPROVED"
                                  ? "bg-success-soft text-success"
                                  : requestStatus === "REJECTED"
                                  ? "bg-danger-soft text-danger"
                                  : "bg-warning-soft text-warning"
                              }`}
                            >
                              {requestStatus}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <button
            type="button"
            disabled={isEventLocked}
            onClick={() => {
              setFormData({
                teamName: "",
                captainStudentId: "",
                selectedStudents: [],
                teams: [
                  {
                    teamName: isTeamEvent
                      ? buildDefaultTeamName(schoolDisplayName, 0)
                      : "",
                    captainStudentId: "",
                    studentIds: [],
                  },
                ],
              });
              setActiveTeamIndex(0);
            }}
            className="btn btn-secondary inline-flex items-center transition-colors"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              (isTeamEvent
                ? totalSelectedTeamMembers === 0 || !canSubmitTeamRegistration
                : formData.selectedStudents.length === 0) ||
              isEventLocked
            }
            className="btn btn-primary inline-flex items-center gap-2 transition-colors"
            style={{ color: "#ffffff" }}
          >
            <FaCheck />
            <span className="">
              {isEditing
                ? isTeamEvent
                  ? "Update Teams"
                  : "Update Participants"
                : isTeamEvent
                ? "Submit Teams"
                : "Submit Students"}{" "}
              ({selectedParticipantCount})
            </span>
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="font-semibold text-ink mb-5">
        {session?.user?.role === "STUDENT"
          ? "Join Event:"
          : isEditing
          ? "Update Participation:"
          : "Register Students:"}{" "}
        <span className="text-success">{event.title}</span>
      </h2>

      {feedback && (
        <div className="mb-4">
          <AlertBanner
            type={feedback.type}
            title={feedback.title}
            message={feedback.message}
          />
        </div>
      )}

      {session?.user?.role === "SCHOOL_ADMIN" && (
        <div className="mb-4 rounded-card border border-success-line bg-success-soft p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-success">
                School-managed registration
              </p>
              <h3 className="mt-2 font-semibold text-ink">
                {isTeamEvent
                  ? "Create teams, choose members, then submit the roster."
                  : "Select students, then submit them as participants."}
              </h3>
              <p className="mt-1 text-sm text-muted">
                Students can see the event, but Phase 1 registration is handled by the school.
              </p>
            </div>
            <div className={`card px-4 py-2 text-sm font-semibold ${registrationStateTone}`}>
              {registrationStateLabel}
            </div>
          </div>
        </div>
      )}

      {session?.user?.role === "SCHOOL_ADMIN" && isTeamEvent && (
        <div className="card mb-4 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="font-semibold text-ink">
                Team Registration Summary
              </h3>
              <p className="mt-1 text-sm text-muted">
                Check team validity before submission and track what is already saved for this event.
              </p>
            </div>
            <div className={`card px-4 py-2 text-sm font-semibold ${registrationStateTone}`}>
              {registrationStateLabel}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Allowed Teams
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">
                {teamLimit || "Unlimited"}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Drafted Teams
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">
                {draftedTeams.length}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Valid Teams
              </div>
              <div className="mt-1 text-2xl font-semibold text-success">
                {validTeamCount}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Saved Registration
              </div>
              <div className="mt-1 text-lg font-semibold text-ink">
                {savedTeamCount > 0 ? `${savedTeamCount} teams` : "None yet"}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Team Size Rule
              </div>
              <div className="mt-1 text-sm font-semibold text-ink">
                {minTeamSize || "No minimum"} to {maxTeamSize || "No maximum"}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr]">
            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  Submission readiness
                </span>
                <span
                  className={`badge badge-neutral text-xs ${
                    canSubmitTeamRegistration
                      ? "bg-success-soft text-success border border-success-line"
                      : "bg-warning-soft text-warning border border-warning-line"
                  }`}
                >
                  {canSubmitTeamRegistration
                    ? "Ready to submit"
                    : isEventLocked
                    ? "Registration locked"
                    : invalidTeamCount > 0
                    ? `${invalidTeamCount} team${invalidTeamCount === 1 ? "" : "s"} need fixes`
                    : "Build at least one valid team"}
                </span>
              </div>
              <div className="mt-2 text-sm text-muted">
                {teamLimit
                  ? `This school can submit up to ${teamLimit} team${teamLimit === 1 ? "" : "s"} for this event.`
                  : "This event does not set a school team limit."}
                {totalTeamCapacity
                  ? ` Event capacity is ${totalTeamCapacity} total team entries.`
                  : " Event capacity is open unless the organizer closes registration."}
              </div>
              {registeredAt && (
                <div className="mt-2 text-xs text-muted">
                  Last saved registration:{" "}
                  <AppDate value={registeredAt} mode="dateTime" />
                </div>
              )}
              {savedTeamCount > 0 && (
                <div className="mt-2 text-xs text-muted">
                  Saved roster: {savedTeamCount} team{savedTeamCount === 1 ? "" : "s"} / {savedMemberCount} members
                </div>
              )}
            </div>

            <div className="card p-4">
              <div className="text-sm font-semibold text-ink">Active team checks</div>
              <div className="mt-3 space-y-2">
                {draftedTeams.length === 0 ? (
                  <div className="text-sm text-muted">
                    No teams drafted yet. Add a team and select members to begin.
                  </div>
                ) : (
                  draftedTeams.map((team, index) => {
                    const summary = teamValidationSummaries[index];
                    return (
                      <div
                        key={`${team.teamName || "team"}-summary-${index}`}
                        className="card px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-ink">
                            {team.teamName || `Team ${index + 1}`}
                          </div>
                          <span
                            className={`badge badge-neutral ${
                              summary.isValid
                                ? "bg-success-soft text-success border border-success-line"
                                : "border border-danger-line bg-danger-soft text-danger"
                            }`}
                          >
                            {summary.isValid ? "Valid" : "Needs fixes"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {summary.memberCount} members
                          {team.captainStudentId ? " - Captain selected" : " - Captain missing"}
                        </div>
                        {!summary.isValid && (
                          <div className="mt-2 text-xs font-semibold text-danger">
                            {summary.issues.join(" - ")}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isEventLocked && (
        <div className="mb-4 rounded-card border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          {lockReason}
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: Registration Setup */}
        <div>
          <div className="mb-5">
            <h3 className="font-semibold text-success mb-4 flex items-center gap-2">
              <FaUsers className="text-xl" />{" "}
              {isTeamEvent ? "Team Setup" : "Registration Setup"}
            </h3>

            {isTeamEvent && (
              <div className="mb-4 rounded-card border border-brand bg-brand-soft p-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-brand">
                  Team Setup
                </h4>
              <div className="mt-4 grid gap-4">
                  <div>
                    <label className="block text-muted font-medium mb-2">
                      Team Name *
                    </label>
                    <input
                      type="text"
                      placeholder="Enter team name"
                      value={activeTeam.teamName}
                      disabled={isEventLocked}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          teams: prev.teams.map((team, index) =>
                            index === activeTeamIndex
                              ? { ...team, teamName: e.target.value }
                              : team
                          ),
                        }))
                      }
                      className="input w-full transition-colors"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="card px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-muted">
                        Team Size Rule
                      </div>
                        <div className="mt-1 text-sm text-ink">
                        {minTeamSize || "No minimum"} to {maxTeamSize || "No maximum"} members
                      </div>
                    </div>
                    <div className="card px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-muted">
                        Captain
                      </div>
                      <select
                        value={activeTeam.captainStudentId}
                        disabled={isEventLocked || activeTeam.studentIds.length === 0}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            teams: prev.teams.map((team, index) =>
                              index === activeTeamIndex
                                ? { ...team, captainStudentId: e.target.value }
                                : team
                            ),
                          }))
                        }
                        className="input mt-2 w-full"
                      >
                        <option value="">Select captain</option>
                        {activeTeam.studentIds.map((studentId) => {
                          const student = students.find(
                            (candidate) => String(candidate._id) === String(studentId)
                          );
                          return (
                            <option key={studentId} value={studentId}>
                              {student?.name || "Selected student"}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">
                      Teams
                    </h4>
                    <button
                      type="button"
                      disabled={isEventLocked}
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          teams: [
                            ...prev.teams,
                            {
                              teamName: buildDefaultTeamName(
                                schoolDisplayName,
                                prev.teams.length
                              ),
                              captainStudentId: "",
                              studentIds: [],
                            },
                          ],
                        }));
                        setActiveTeamIndex((formData.teams || []).length);
                      }}
                      className="btn btn-primary btn-sm font-semibold transition-colors"
                    >
                      Add Team
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(formData.teams || []).map((team, index) => (
                      <div
                        key={`${team.teamName || "team"}-${index}`}
                        className={`card flex items-center justify-between px-3 py-2 ${
                          index === activeTeamIndex
                            ? "border-success bg-success-soft"
                            : "border-line bg-surface"
                        }`}
                    >
                        <button
                          type="button"
                          onClick={() => setActiveTeamIndex(index)}
                          className="flex-1 text-left"
                        >
                          <div className="text-sm font-semibold text-ink">
                            {team.teamName || `Team ${index + 1}`}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>{team.studentIds.length} members</span>
                            {(() => {
                              const summary = validateTeamDraft(team, {
                                minTeamSize,
                                maxTeamSize,
                              });
                              return (
                                <span
                                  className={`rounded-full px-2.5 py-0.5 font-semibold ${
                                    summary.isValid
                                      ? "border border-success-line bg-success-soft text-success"
                                      : "border border-danger-line bg-danger-soft text-danger"
                                  }`}
                                >
                                  {summary.isValid ? "Valid" : "Needs fixes"}
                                </span>
                              );
                            })()}
                          </div>
                        </button>
                        {(formData.teams || []).length > 1 && (
                          <button
                            type="button"
                            disabled={isEventLocked}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                teams: prev.teams.filter((_, current) => current !== index),
                              }));
                              setActiveTeamIndex((prev) =>
                                prev > 0 && prev >= index ? prev - 1 : 0
                              );
                            }}
                            className="btn btn-soft-danger btn-sm ml-3 font-semibold transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isTeamEvent && (
              <div className="rounded-card border border-brand bg-brand-soft p-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-brand">
                  Individual participant registration
                </h4>
                <div className="mt-4 grid gap-3">
                  <div className="card px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-muted">
                      Selected students
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-ink">
                      {formData.selectedStudents.length}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Choose students from the list on the right. This event does not need team names or captains.
                    </p>
                  </div>
                  <div className="card px-4 py-3 text-sm text-muted">
                    After you submit, the registration is saved to this event and can be updated while registration is open.
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* RIGHT COLUMN: Participant roster */}
        <div>
          <h3 className="font-semibold text-success mb-2 flex items-center gap-2">
            <FaUsers className="text-xl" /> {isTeamEvent ? "Team Members" : "Participant Roster"}
          </h3>
          <p className="text-muted text-sm mb-4">
            {isTeamEvent
              ? "Build the school team by selecting roster members."
              : "Manage participation for your students."}
            {formData.selectedStudents.length > 0 && (
              <span className="text-success ml-2 font-semibold">
                ({formData.selectedStudents.length} selected)
              </span>
            )}
            {isTeamEvent && (
              <span className="text-muted ml-2">
                ({totalSelectedTeamMembers} members across {formData.teams.length} teams)
              </span>
            )}
          </p>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-success-line bg-success-soft px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-success">
                {isTeamEvent ? "Roster Size" : "Selected Team"}
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">
                {isTeamEvent ? activeTeam.studentIds.length : formData.selectedStudents.length}
              </div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">
                Selected in View
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink">
                {visibleSelectedCount}
              </div>
            </div>
            <div className="card px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted">
                Eligible Students
                </div>
              <div className="mt-1 text-2xl font-semibold text-ink">
                {filteredStudents.length}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 space-y-3">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {STUDENT_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setInterestedFilter(filter.id)}
                  className={`btn btn-ghost btn-sm font-medium transition-colors ${
                    interestedFilter === filter.id
                      ? "bg-success text-white"
                      : "bg-surface-2 text-muted hover:bg-line"
                  }`}
                  style={
                    interestedFilter === filter.id ? { color: "#ffffff" } : undefined
                  }
                >
                  <span className="">
                    {filter.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Search & Class Filter */}
            <div className="flex gap-3">
              <div className="card flex-1 flex items-center gap-2 px-3 py-2">
                <FaSearch className="text-muted" />
                <input
                  type="text"
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input flex-1"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-muted hover:text-muted"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
              <select
                value={gradeFilter}
                onChange={(e) => { setGradeFilter(e.target.value); setSectionFilter("all"); }}
                className="input"
              >
                <option value="all">All Grades</option>
                {Array.isArray(grades) &&
                  grades.map((grade) => {
                    const val = grade._id || grade;
                    const label = grade.name || grade;
                    return (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    );
                  })}
              </select>
              {sectionOptions.length > 0 && (
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="input"
                  aria-label="Filter by section"
                >
                  <option value="all">All Sections</option>
                  {sectionOptions.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Unified List */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="p-4 sm:p-5 text-center text-muted">
                Loading students...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-4 sm:p-5 text-center text-muted">
                <p className="font-semibold text-muted">
                  No students match the registration filters.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Clear search, change grade/status filters, or check this event&apos;s registration grades.
                </p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                {/* Select Visible */}
                <div className="flex items-center gap-3 p-4 bg-surface border-b border-line">
                  <input
                    type="checkbox"
                    disabled={isEventLocked}
                    checked={
                      filteredStudents.length > 0 &&
                      filteredStudents
                        .filter(
                          (student) => !isTeamEvent || !otherTeamStudentIds.has(String(student._id))
                        )
                        .every((student) =>
                          (isTeamEvent ? activeTeam.studentIds : formData.selectedStudents).includes(
                            String(student._id)
                          )
                        )
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-5 h-5 rounded-control cursor-pointer accent-emerald-500"
                  />
                  <span className="text-ink font-medium flex-1">
                    {isTeamEvent ? "Add All Visible To Active Team" : "Select All Visible"}
                  </span>
                  {(isTeamEvent ? activeTeam.studentIds.length : formData.selectedStudents.length) >
                    0 && (
                    <span className="badge badge-success text-xs">
                      {isTeamEvent
                        ? activeTeam.studentIds.length
                        : formData.selectedStudents.length} selected
                    </span>
                  )}
                </div>

                {/* Students List */}
                <div className="divide-line">
                  {Array.isArray(filteredStudents) &&
                    filteredStudents.map((student) => {
                      const request = participationMap.get(student._id);
                      const isSelected = isTeamEvent
                        ? activeTeam.studentIds.includes(String(student._id))
                        : formData.selectedStudents.includes(String(student._id));
                      const isAssignedElsewhere =
                        isTeamEvent && otherTeamStudentIds.has(String(student._id));
                      const assignedTeamName = isAssignedElsewhere
                        ? (formData.teams || []).find((team, index) =>
                            index !== activeTeamIndex &&
                            (team.studentIds || []).includes(String(student._id))
                          )?.teamName || "another team"
                        : "";
                      const requestStatus = request?.status;

                      return (
                        <div
                          key={student._id}
                          className={`flex items-center gap-3 p-4 transition-colors ${
                            isSelected
                              ? "cursor-pointer border-l border-success bg-success-soft hover:bg-success-soft"
                              : isAssignedElsewhere
                              ? "cursor-not-allowed bg-surface opacity-70"
                              : "cursor-pointer hover:bg-surface"
                          }`}
                          onClick={() =>
                            !isAssignedElsewhere && handleStudentToggle(String(student._id))
                          }
                        >
                          <input
                            disabled={isEventLocked || isAssignedElsewhere}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggle(String(student._id))}
                            className="w-5 h-5 rounded-control cursor-pointer accent-emerald-500"
                            onClick={(e) => e.stopPropagation()}
                          />

                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-ink font-medium">
                                {student.name}
                              </div>
                              {isSelected && (
                                <span className="badge badge-success uppercase tracking-wide">
                                  {isTeamEvent
                                    ? activeTeam.captainStudentId === String(student._id)
                                      ? "Captain"
                                      : "Team Member"
                                    : "Selected"}
                                </span>
                              )}
                              {isAssignedElsewhere && (
                                <span className="badge badge-neutral uppercase tracking-wide">
                                  In {assignedTeamName}
                                </span>
                              )}
                            </div>
                            <div className="text-muted text-sm flex items-center gap-2">
                              <FaSchool className="text-xs" />
                              {student.grade}
                              {student.rollNumber
                                ? ` - Roll ${student.rollNumber}`
                                : ""}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {requestStatus === "PENDING" && (
                              <span className="badge badge-warning text-xs">
                                Pending
                              </span>
                            )}
                            {requestStatus === "APPROVED" && (
                              <span className="badge badge-success inline-flex items-center gap-1 text-xs">
                                <FaCheck className="text-2xs" />
                                Approved
                              </span>
                            )}
                            {requestStatus === "REJECTED" && (
                              <span className="badge badge-danger inline-flex items-center gap-1 text-xs">
                                <FaTimes className="text-2xs" />
                                Rejected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex gap-4 justify-end">
        <button
          type="button"
          disabled={isEventLocked}
          onClick={() => {
            setFormData({
              teamName: "",
              captainStudentId: "",
              selectedStudents: [],
              teams: [
                {
                  teamName: isTeamEvent
                    ? buildDefaultTeamName(schoolDisplayName, 0)
                    : "",
                  captainStudentId: "",
                  studentIds: [],
                },
              ],
            });
            setActiveTeamIndex(0);
          }}
          className="btn btn-ghost font-medium transition-colors"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={
            submitting ||
            (isTeamEvent
              ? totalSelectedTeamMembers === 0 || !canSubmitTeamRegistration
              : formData.selectedStudents.length === 0) ||
            isEventLocked
          }
          className="btn btn-primary transition-colors flex items-center gap-2"
          style={{ color: "#ffffff" }}
        >
          <FaCheck />{" "}
          <span className="">
            {session?.user?.role === "STUDENT"
              ? "Confirm Participation"
              : isEditing
              ? isTeamEvent
                ? "Update Teams"
                : "Update Participants"
              : isTeamEvent
              ? "Submit Teams"
              : "Submit Students"}{" "}
            ({selectedParticipantCount})
          </span>
        </button>
      </div>
    </form>
  );
});

export default EventParticipationForm;
