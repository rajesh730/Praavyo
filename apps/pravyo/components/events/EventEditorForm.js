"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGradeLabels, normalizeGradeValue } from "@/lib/schoolGrades";
import { validateEventCapacity } from "@/lib/eventCapacity";

function getTodayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().split("T")[0];
}

function buildInitialFormData(initialData, ownerMode) {
  const defaultScope = ownerMode === "school" ? "SCHOOL" : "PLATFORM";
  const resolvedParticipationFormat =
    initialData?.participationFormat === "TEAM" ||
    initialData?.minTeamSize ||
    initialData?.maxTeamSize
      ? "TEAM"
      : "INDIVIDUAL";

  return {
    title: initialData?.title || "",
    description: initialData?.description || "",
    date: initialData?.date
      ? new Date(initialData.date).toISOString().split("T")[0]
      : "",
    registrationDeadline: initialData?.registrationDeadline
      ? new Date(initialData.registrationDeadline).toISOString().split("T")[0]
      : "",
    maxParticipants: initialData?.maxParticipants || "",
    maxParticipantsPerSchool:
      ownerMode === "school" ? "" : initialData?.maxParticipantsPerSchool || "",
    participationFormat: resolvedParticipationFormat,
    minTeamSize: initialData?.minTeamSize || "",
    maxTeamSize: initialData?.maxTeamSize || "",
    eligibleGrades: (initialData?.eligibleGrades || [])
      .map(normalizeGradeValue)
      .filter(Boolean),
    eventScope: initialData?.eventScope || defaultScope,
    eventType:
      ownerMode === "school" ? "COMPETITION" : initialData?.eventType || "COMPETITION",
    visibility: "PUBLIC",
    registrationMode:
      resolvedParticipationFormat === "TEAM"
        ? "THROUGH_SCHOOL"
        : initialData?.registrationMode || "THROUGH_SCHOOL",
    featuredOnLanding: false,
    publicHighlightsEnabled: true,
    // For a school event these are the teachers the school lets manage it.
    assignedMentors: (initialData?.assignedMentors || []).map((mentor) =>
      String(mentor?._id || mentor)
    ),
  };
}

export default function EventEditorForm({
  onEventCreated,
  initialData = null,
  onCancel,
  ownerMode = "platform",
  allowScopeSelection = null,
}) {
  const isEditing = Boolean(initialData);
  const resolvedOwnerMode = isEditing
    ? initialData?.eventScope === "SCHOOL"
      ? "school"
      : "platform"
    : ownerMode;
  const canChooseScope = allowScopeSelection ?? isEditing;
  const defaultScope = resolvedOwnerMode === "school" ? "SCHOOL" : "PLATFORM";
  const isSchoolOwnedFlow = resolvedOwnerMode === "school";

  const [formData, setFormData] = useState(() =>
    buildInitialFormData(initialData, resolvedOwnerMode)
  );
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [schoolGrades, setSchoolGrades] = useState(() =>
    resolvedOwnerMode === "school" ? [] : buildGradeLabels()
  );
  const [activeStep, setActiveStep] = useState("basic");
  // The school's active teachers, for "Teachers who manage this event".
  // Stays null when it cannot load (a teacher filling the form has no access
  // to the list), which hides the picker.
  const [schoolTeachers, setSchoolTeachers] = useState(null);
  const [teacherQuery, setTeacherQuery] = useState("");

  useEffect(() => {
    if (!isSchoolOwnedFlow) return undefined;
    let active = true;
    fetch("/api/teachers?status=ACTIVE&limit=200", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.teachers)) setSchoolTeachers(data.teachers);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isSchoolOwnedFlow]);

  const toggleManager = (teacherId) =>
    setFormData((prev) => {
      const current = prev.assignedMentors || [];
      return {
        ...prev,
        assignedMentors: current.includes(teacherId)
          ? current.filter((id) => id !== teacherId)
          : [...current, teacherId],
      };
    });

  const eventTypes = [
    "COMPETITION",
    "SHOWCASE",
    "AUDITION",
    "WORKSHOP",
    "EXHIBITION",
    "FESTIVAL",
    "OTHER",
  ];
  useEffect(() => {
    setFormData(buildInitialFormData(initialData, resolvedOwnerMode));
  }, [initialData, resolvedOwnerMode]);

  useEffect(() => {
    let isActive = true;

    const loadGrades = async () => {
      if (resolvedOwnerMode !== "school") {
        setSchoolGrades(buildGradeLabels());
        return;
      }

      try {
        const res = await fetch("/api/school/grade-structure", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load school grades");

        const data = await res.json();
        const grades = (data.grades || data.data?.grades || [])
          .map((grade) => normalizeGradeValue(grade.name || grade._id || grade))
          .filter(Boolean);

        if (isActive) {
          setSchoolGrades(grades.length > 0 ? grades : buildGradeLabels());
        }
      } catch (error) {
        if (isActive) {
          setSchoolGrades(buildGradeLabels());
        }
      }
    };

    loadGrades();

    return () => {
      isActive = false;
    };
  }, [resolvedOwnerMode]);

  useEffect(() => {
    if (resolvedOwnerMode !== "school" || schoolGrades.length === 0) return;

    setFormData((prev) => ({
      ...prev,
      eligibleGrades: prev.eligibleGrades.filter((grade) =>
        schoolGrades.includes(normalizeGradeValue(grade))
      ),
    }));
  }, [resolvedOwnerMode, schoolGrades]);

  const getGradeRangeLabel = () => {
    const gradeNumbers = schoolGrades
      .map((grade) => Number.parseInt(String(grade).match(/\d+/)?.[0], 10))
      .filter(Number.isFinite);

    if (gradeNumbers.length === 0) return "School Level";

    return `School Level (Grade ${Math.min(...gradeNumbers)}-${Math.max(
      ...gradeNumbers
    )})`;
  };

  const handleGradeChange = (grade) => {
    setFormData((prev) => {
      const grades = prev.eligibleGrades.includes(grade)
        ? prev.eligibleGrades.filter((g) => g !== grade)
        : [...prev.eligibleGrades, grade];
      return { ...prev, eligibleGrades: grades };
    });
  };

  const toggleGroup = (groupGrades) => {
    setFormData((prev) => {
      const allSelected = groupGrades.every((g) =>
        prev.eligibleGrades.includes(g)
      );
      const nextGrades = allSelected
        ? prev.eligibleGrades.filter((g) => !groupGrades.includes(g))
        : [...new Set([...prev.eligibleGrades, ...groupGrades])];

      return { ...prev, eligibleGrades: nextGrades };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    try {
      if (
        !formData.title.trim() ||
        !formData.date ||
        !formData.description.trim()
      ) {
        setErrorMessage("Event title, event date, and description are required.");
        setStatus("error");
        setActiveStep("basic");
        return;
      }

      const capacityValidation = validateEventCapacity({
        maxParticipants: formData.maxParticipants,
        maxParticipantsPerSchool: formData.maxParticipantsPerSchool,
      });

      if (capacityValidation.message) {
        setErrorMessage(capacityValidation.message);
        setStatus("error");
        return;
      }

      const url = initialData ? `/api/events/${initialData._id}` : "/api/events";
      const method = initialData ? "PUT" : "POST";

      const resolvedPayloadScope = canChooseScope ? formData.eventScope : defaultScope;
      const resolvedRegistrationMode =
        formData.participationFormat === "TEAM"
          ? "THROUGH_SCHOOL"
          : resolvedPayloadScope !== "SCHOOL"
          ? "THROUGH_SCHOOL"
          : formData.registrationMode === "DIRECT"
          ? "DIRECT"
          : "THROUGH_SCHOOL";

      const payload = {
        ...formData,
        eventScope: resolvedPayloadScope,
        eventType: isSchoolOwnedFlow ? "COMPETITION" : formData.eventType,
        visibility: "PUBLIC",
        registrationMode: resolvedRegistrationMode,
        featuredOnLanding: false,
        publicHighlightsEnabled: true,
        registrationDeadline: formData.registrationDeadline || null,
        maxParticipants: capacityValidation.totalStudentCapacity,
        maxParticipantsPerSchool: isSchoolOwnedFlow
          ? null
          : capacityValidation.maxStudentsPerSchool,
        minTeamSize:
          formData.participationFormat === "TEAM" && formData.minTeamSize !== ""
            ? Number(formData.minTeamSize)
            : null,
        maxTeamSize:
          formData.participationFormat === "TEAM" && formData.maxTeamSize !== ""
            ? Number(formData.maxTeamSize)
            : null,
        assignedMentors: formData.assignedMentors || [],
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setStatus("success");
        if (!initialData) {
          setFormData(buildInitialFormData(null, resolvedOwnerMode));
        }
        onEventCreated?.();
        setTimeout(() => setStatus(""), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.message || "Failed to save event.");
        setStatus("error");
      }
    } catch (error) {
      console.error("Failed to save event", error);
      setErrorMessage("Failed to save event.");
      setStatus("error");
    }
  };

  const steps = useMemo(
    () => [
      { id: "basic", label: "Basic Details" },
      { id: "audience", label: "Student Audience" },
      { id: "registration", label: "Registration Setup" },
      { id: "review", label: "Review & Create" },
    ],
    []
  );
  const activeStepIndex = steps.findIndex((step) => step.id === activeStep);
  useEffect(() => {
    if (!steps.some((step) => step.id === activeStep)) {
      setActiveStep("basic");
    }
  }, [activeStep, steps]);
  const goToNextStep = () => {
    const nextStep = steps[Math.min(activeStepIndex + 1, steps.length - 1)];
    setActiveStep(nextStep.id);
  };
  const goToPreviousStep = () => {
    const previousStep = steps[Math.max(activeStepIndex - 1, 0)];
    setActiveStep(previousStep.id);
  };
  const selectedGradesLabel =
    formData.eligibleGrades.length > 0
      ? formData.eligibleGrades.join(", ")
      : "All grades can be registered";
  const stepGuidance = {
    basic: isSchoolOwnedFlow
      ? "Keep this simple: title, date, description, and whether students join individually or in groups."
      : "Set the public-facing basics for the platform event before deciding audience and limits.",
    audience: isSchoolOwnedFlow
      ? "Choose which grades can be registered. Every student in the school can still see the event."
      : "Choose which grades can be registered for this platform event. Visibility stays available after school approval.",
    registration: isSchoolOwnedFlow
      ? "Teachers register students. Set only the deadline, total capacity, and team size if needed."
      : "Schools register on behalf of students. Set total capacity and optional per-school limits.",
    review: "Confirm the summary. After creation, manage registration, notices, rounds, results, and certificates from the event page.",
  };

  return (
    <div className="bg-surface p-4 sm:p-5 rounded-card border border-line-strong">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold text-ink">
            {initialData
              ? "Edit Event"
              : resolvedOwnerMode === "school"
              ? "Create School Event"
              : "Create Platform Event"}
          </h2>
          {!initialData && (
            <p className="text-sm text-subtle mt-1">
              {resolvedOwnerMode === "school"
                ? "Create internal events for your students. All school students can see them; registration rules control who can join."
                : "Create flagship platform events for the wider network."}
            </p>
          )}
        </div>
        {initialData && onCancel && (
          <button
            onClick={onCancel}
            className="text-subtle hover:text-ink text-sm underline"
          >
            Cancel Edit
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-card border border-line-strong bg-surface p-2">
          <div className="grid gap-2 md:grid-cols-5">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`btn btn-ghost text-left transition-colors ${
                  activeStep === step.id
                    ? "bg-brand text-white hover:bg-brand-strong hover:text-white"
                    : index < activeStepIndex
                    ? "bg-success-soft text-success hover:bg-success-soft"
                    : "bg-surface text-ink hover:bg-subtle"
                }`}
              >
                <span className="block text-xs opacity-75">Step {index + 1}</span>
                <span className="font-semibold">{step.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-brand bg-brand px-4 py-3 text-sm text-white">
          {stepGuidance[activeStep]}
        </div>

        {activeStep === "basic" && (
          <section className="space-y-4 rounded-card border border-line-strong bg-surface p-4">
            <div>
              <h3 className="font-semibold text-ink">Basic Details</h3>
              <p className="mt-1 text-sm text-subtle">
                {isSchoolOwnedFlow
                  ? "Name the event and set the core details for your students."
                  : "Name the event, choose the type, and set the main public details."}
              </p>
            </div>

            <div className={`grid gap-4 ${isSchoolOwnedFlow ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
              <div className="md:col-span-2">
                <label className="block text-ink mb-1 text-sm">
                  Event Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-ink mb-1 text-sm">
                  Event Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  min={getTodayInputValue()}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      date: e.target.value,
                      registrationDeadline:
                        prev.registrationDeadline &&
                        e.target.value &&
                        prev.registrationDeadline > e.target.value
                          ? e.target.value
                          : prev.registrationDeadline,
                    }))
                  }
                  className="input w-full"
                  required
                />
              </div>
              {!isSchoolOwnedFlow && (
              <div>
                <label className="block text-ink mb-1 text-sm">
                  Event Type
                </label>
                {
                  <select
                    value={formData.eventType}
                    onChange={(e) =>
                      setFormData({ ...formData, eventType: e.target.value })
                    }
                    className="input w-full"
                  >
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {type.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                }
              </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {!isSchoolOwnedFlow && (
              <div>
                <label className="block text-ink mb-1 text-sm">
                  Event Scope
                </label>
                <select
                  value={formData.eventScope}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      eventScope: e.target.value,
                      registrationMode:
                        e.target.value === "SCHOOL"
                          ? prev.registrationMode
                          : "THROUGH_SCHOOL",
                    }))
                  }
                  disabled={!canChooseScope}
                  className="input w-full"
                >
                  <option value="PLATFORM">Platform event</option>
                  {(canChooseScope || resolvedOwnerMode === "school") && (
                    <option value="SCHOOL">School event</option>
                  )}
                </select>
                {!canChooseScope && (
                  <p className="text-xs text-muted mt-1">
                    {resolvedOwnerMode === "school"
                      ? "Events from this workspace are owned by your school."
                      : "New events from this workspace are platform-owned flagship events."}
                  </p>
                )}
              </div>
              )}
              <div>
                <label className="block text-ink mb-1 text-sm">
                Participant Type
                </label>
                <select
                  value={formData.participationFormat}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      participationFormat: e.target.value,
                      registrationMode:
                        e.target.value === "TEAM"
                          ? "THROUGH_SCHOOL"
                          : prev.registrationMode,
                      minTeamSize:
                        e.target.value === "TEAM" ? prev.minTeamSize : "",
                      maxTeamSize:
                        e.target.value === "TEAM" ? prev.maxTeamSize : "",
                    }))
                  }
                  className="input w-full"
                >
                  <option value="INDIVIDUAL">Individual students</option>
                  <option value="TEAM">Group / team</option>
                </select>
                <p className="mt-1 text-xs text-muted">
                  Choose group/team for football, quiz teams, group dance, debate teams, and other roster-based events.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-ink mb-1 text-sm">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="input w-full"
                required
              />
            </div>
          </section>
        )}

        {activeStep === "audience" && (
          <section className="space-y-4 rounded-card border border-line-strong bg-surface p-4">
            <div>
              <h3 className="font-semibold text-ink">Registration Eligibility</h3>
              <p className="mt-1 text-sm text-subtle">
                Choose who can be registered for this event. This does not limit who can see the event or receive event updates.
              </p>
            </div>

            <div>
              <label className="block text-ink mb-2 text-sm">
                Registration Grades
              </label>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted uppercase font-semibold tracking-wide">
                    {getGradeRangeLabel()}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(schoolGrades)}
                    className="text-xs text-brand hover:text-brand transition-colors"
                  >
                    {schoolGrades.every((g) => formData.eligibleGrades.includes(g))
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-surface p-3 rounded-control border border-line-strong">
                  {schoolGrades.length === 0 ? (
                    <p className="col-span-full text-sm text-subtle">
                      Loading grades...
                    </p>
                  ) : (
                    schoolGrades.map((grade) => (
                      <label
                        key={grade}
                        className="btn btn-ghost flex items-center gap-2 cursor-pointer transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={formData.eligibleGrades.includes(grade)}
                          onChange={() => handleGradeChange(grade)}
                          className="rounded-control border-line-strong bg-subtle text-brand"
                        />
                        <span className="text-ink text-sm">{grade}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeStep === "registration" && (
          <section className="space-y-4 rounded-card border border-line-strong bg-surface p-4">
            <div>
              <h3 className="font-semibold text-ink">
                Registration Setup
              </h3>
              <p className="mt-1 text-sm text-subtle">
                Set the deadline, capacity, and school-managed registration rules.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
          {isSchoolOwnedFlow && (
          <div>
            <label className="block text-ink mb-1 text-sm">
              Registration Method
            </label>
            <div className="w-full rounded-control border border-line-strong bg-surface p-3 text-ink">
              <div className="font-medium">
                {formData.registrationMode === "DIRECT"
                  ? "Students can enroll themselves"
                  : "School registers students"}
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={formData.registrationMode === "DIRECT"}
                  disabled={formData.participationFormat === "TEAM"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      registrationMode: e.target.checked
                        ? "DIRECT"
                        : "THROUGH_SCHOOL",
                    }))
                  }
                  className="mt-0.5 rounded-control border-line-strong bg-subtle text-brand"
                />
                <span>Let eligible students register themselves</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">
              {formData.participationFormat === "TEAM"
                ? "Team events are school-managed so the school controls the final group list."
                : formData.registrationMode === "DIRECT"
                ? "Eligible students will see Enroll in their dashboard. You can still edit the participant list."
                : "Teachers or school admins collect names and register students from the school dashboard."}
            </p>
          </div>
          )}
          <div>
            <label className="block text-ink mb-1 text-sm">
              Registration Deadline (optional)
            </label>
            <input
              type="date"
              value={formData.registrationDeadline}
              min={getTodayInputValue()}
              max={formData.date || undefined}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  registrationDeadline: e.target.value,
                })
              }
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-ink mb-1 text-sm">
              {formData.participationFormat === "TEAM"
                ? "Total Team Capacity"
                : "Total Student Capacity"}
            </label>
            <input
              type="number"
              value={formData.maxParticipants}
              onChange={(e) =>
                setFormData({ ...formData, maxParticipants: e.target.value })
              }
              className="input w-full"
              placeholder="Unlimited"
              min="1"
            />
            <p className="mt-1 text-xs text-muted">
              {formData.participationFormat === "TEAM"
                ? isSchoolOwnedFlow
                  ? "Maximum teams from your school that can take part in this event."
                  : "Maximum teams allowed across the full event."
                : isSchoolOwnedFlow
                ? "Maximum students from your school who can take part in this event."
                : "Maximum students allowed across all schools."}
            </p>
          </div>
          {!isSchoolOwnedFlow && (
          <div>
            <label className="block text-ink mb-1 text-sm">
              {formData.participationFormat === "TEAM"
                ? "Max Teams Per School"
                : "Max Students Per School"}
            </label>
            <input
              type="number"
              value={formData.maxParticipantsPerSchool}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxParticipantsPerSchool: e.target.value,
                })
              }
              className="input w-full"
              placeholder="Unlimited"
              min="1"
              max={formData.maxParticipants || undefined}
            />
            <p className="mt-1 text-xs text-muted">
              {formData.participationFormat === "TEAM"
                ? "Maximum number of team entries a school can submit."
                : "Maximum students one school can register."}
            </p>
            {formData.maxParticipants &&
              formData.maxParticipantsPerSchool &&
                Number(formData.maxParticipantsPerSchool) >
                Number(formData.maxParticipants) && (
              <p className="mt-1 text-xs text-danger">
                Max students per school cannot exceed total student capacity.
              </p>
            )}
          </div>
          )}
            </div>
            {isSchoolOwnedFlow && schoolTeachers && (
              <EventManagersPicker
                teachers={schoolTeachers}
                selected={formData.assignedMentors || []}
                onToggle={toggleManager}
                query={teacherQuery}
                onQuery={setTeacherQuery}
              />
            )}
            {formData.participationFormat === "TEAM" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-ink mb-1 text-sm">
                    Minimum Members Per Team
                  </label>
                  <input
                    type="number"
                    value={formData.minTeamSize}
                    onChange={(e) =>
                      setFormData({ ...formData, minTeamSize: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Optional"
                    min="1"
                    max={formData.maxTeamSize || undefined}
                  />
                </div>
                <div>
                  <label className="block text-ink mb-1 text-sm">
                    Maximum Members Per Team
                  </label>
                  <input
                    type="number"
                    value={formData.maxTeamSize}
                    onChange={(e) =>
                      setFormData({ ...formData, maxTeamSize: e.target.value })
                    }
                    className="input w-full"
                    placeholder="Optional"
                    min={formData.minTeamSize || 1}
                    max={formData.maxParticipants || undefined}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {activeStep === "review" && (
          <section className="space-y-4 rounded-card border border-line-strong bg-surface p-4">
            <div>
              <h3 className="font-semibold text-ink">
                Review & Create
              </h3>
              <p className="mt-1 text-sm text-subtle">
                Confirm the important settings before saving this event.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[ 
                ["Title", formData.title || "Missing"],
                ["Date", formData.date || "Missing"],
                ...(!isSchoolOwnedFlow
                  ? [
                      ["Scope", formData.eventScope.replaceAll("_", " ")],
                      ["Type", formData.eventType.replaceAll("_", " ")],
                    ]
                  : []),
                [
                      "Participant Type",
                      formData.participationFormat === "TEAM"
                    ? "Group / team"
                    : "Individual students",
                ],
                ["Visibility", "Public"],
                [
                  "Registration Method",
                  isSchoolOwnedFlow
                    ? formData.registrationMode === "DIRECT"
                      ? "Students can enroll themselves"
                      : "School registers students"
                    : "School registers students (each school can let its students self-register)",
                ],
                ["Deadline", formData.registrationDeadline || "No deadline"],
                ...(isSchoolOwnedFlow && schoolTeachers
                  ? [[
                      "Managed By",
                      schoolTeachers
                        .filter((teacher) => (formData.assignedMentors || []).includes(String(teacher._id)))
                        .map((teacher) => teacher.name)
                        .join(", ") || "School admin only",
                    ]]
                  : []),
                ["Registration Grades", selectedGradesLabel],
                [
                  "Capacity",
                  formData.maxParticipants
                    ? `${
                        formData.maxParticipants
                      } total ${
                        formData.participationFormat === "TEAM" ? "teams" : "students"
                      }`
                    : "Unlimited total capacity",
                ],
                ...(!isSchoolOwnedFlow
                  ? [[
                      "Per School Limit",
                      formData.maxParticipantsPerSchool
                        ? `${
                            formData.maxParticipantsPerSchool
                          } ${formData.participationFormat === "TEAM" ? "teams" : "students"}`
                        : "Unlimited per school",
                    ]]
                  : []),
                [
                  "Team Size",
                  formData.participationFormat === "TEAM"
                    ? `${
                        formData.minTeamSize || "No minimum"
                      } to ${formData.maxTeamSize || "No maximum"} members per team`
                    : "Not applicable",
                ],
              ].map(([name, value]) => (
                <div
                  key={name}
                  className="rounded-card border border-line-strong bg-surface p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {name}
                  </p>
                  <p className="mt-1 text-sm text-ink">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-3 border-t border-line-strong pt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={activeStepIndex === 0}
              className="btn btn-primary font-semibold"
            >
              Back
            </button>
            {activeStep !== "review" ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="btn btn-primary font-semibold"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={status === "sending"}
                className="btn btn-primary transition-colors"
              >
                {status === "sending"
                  ? initialData
                    ? "Updating..."
                    : "Creating..."
                  : initialData
                  ? "Update Event"
                  : "Create Event"}
              </button>
            )}
          </div>

          {status === "success" && (
            <span className="text-success text-sm">
              Event {initialData ? "updated" : "created"} successfully!
            </span>
          )}
          {status === "error" && (
            <span className="text-danger text-sm">
              {errorMessage || "Failed to save event."}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * "Teachers who manage this event": the chosen teachers see Manage Event on
 * their dashboard and can run rounds, participants and results. Everyone else
 * only sees the event listed.
 */
function EventManagersPicker({ teachers, selected, onToggle, query, onQuery }) {
  const needle = query.trim().toLowerCase();
  const shown = teachers.filter(
    (teacher) =>
      !needle ||
      [teacher.name, teacher.username, teacher.designation]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle))
  );

  return (
    <div className="rounded-control border border-line-strong bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Teachers who manage this event</p>
        <span className="text-xs text-muted">{selected.length} selected</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Only these teachers get the Manage Event button. Leave empty to manage it yourself.
      </p>
      {teachers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No active teachers at your school yet.</p>
      ) : (
        <>
          {teachers.length > 8 && (
            <input
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search teachers"
              className="input mt-3 w-full"
            />
          )}
          <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto">
            {shown.map((teacher) => {
              const id = String(teacher._id);
              return (
                <li key={id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => onToggle(id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{teacher.name}</span>
                      {(teacher.designation || teacher.username) && (
                        <span className="block truncate text-xs text-muted">
                          {[teacher.designation, teacher.username].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && <li className="py-2 text-sm text-muted">No teacher matches “{query}”.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
