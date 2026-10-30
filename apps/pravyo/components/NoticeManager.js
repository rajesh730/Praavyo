"use client";

import { useCallback, useEffect, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { Megaphone as FaBullhorn, ClipboardList as FaClipboardList, SquarePen as FaEdit, Plus as FaPlus, Trash2 as FaTrash, Eye as FaEye, FileText as FaFileAlt, ListFilter as FaFilter, Info as FaInfoCircle, Send as FaPaperPlane, Calendar as FaRegCalendarAlt, Search as FaSearch, GraduationCap as FaUserGraduate, Presentation as FaChalkboardTeacher, Users as FaUserFriends } from "lucide-react";
import { buildGradeLabels, normalizeGradeValue } from "@/lib/schoolGrades";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDateTime } from "@/lib/nepaliDate";
import EmptyState from "@/components/EmptyState";
import PaginationControls from "@/components/PaginationControls";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function NoticeManager({
  scopeMode = "school",
  title = "Notice Board",
  subtitle = "Manage and publish notices for your school",
  fixedAudience = null,
}) {
  const { calendar } = useCalendarPreference();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [editingNoticeId, setEditingNoticeId] = useState("");
  // Remembered until refresh; each notice screen keeps its own filters.
  const [filters, setFilters] = useRememberedState(`notices:${scopeMode}:${fixedAudience || "all"}:filters`, {
    type: "",
    priority: "",
    audience: "",
    status: "",
    grade: "",
    search: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 20,
  });
  const [feedback, setFeedback] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [summaryNotices, setSummaryNotices] = useState([]);

  const [noticeForm, setNoticeForm] = useState({
    title: "",
    content: "",
    type: "GENERAL",
    priority: "NORMAL",
    status: "PUBLISHED",
    visibility: "PRIVATE",
    targetAudience: {
      students: fixedAudience === "students",
      teachers: false,
      parents: false,
    },
    grades: [],
    expiryDate: "",
  });
  const [gradeOptions, setGradeOptions] = useState([]);

  const noticeTypes = [
    { value: "GENERAL", label: "General", color: "bg-brand" },
    { value: "URGENT", label: "Urgent", color: "bg-danger" },
    { value: "EVENT", label: "Event", color: "bg-brand" },
    { value: "HOLIDAY", label: "Holiday", color: "bg-brand" },
    { value: "SHOWCASE", label: "Showcase", color: "bg-subtle" },
  ];

  const priorities = [
    { value: "LOW", label: "Low", color: "text-muted" },
    { value: "NORMAL", label: "Normal", color: "text-brand" },
    { value: "HIGH", label: "High", color: "text-brand" },
    { value: "URGENT", label: "Urgent", color: "text-danger" },
  ];
  const isPlatformMode = scopeMode === "platform";
  // The Student Notices board. Students are always an audience here; what the
  // school chooses is whether the child's guardians receive it as well, so this
  // flag means "student board", NOT "students only".
  const isStudentBoardMode = fixedAudience === "students";

  const buildDefaultAudience = useCallback(
    () => ({
      students: isStudentBoardMode,
      teachers: false,
      // Default off: adding parents is an explicit decision, and a notice
      // written for students ("bring your PE kit") is not automatically
      // something every guardian needs pushed to them.
      parents: false,
    }),
    [isStudentBoardMode]
  );

  /** On the student board, students are fixed and only `parents` is a choice. */
  const setStudentBoardParents = (parents) =>
    setNoticeForm((prev) => ({
      ...prev,
      targetAudience: { students: true, teachers: false, parents },
    }));

  const fetchNotices = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setFeedback(null);
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", "10");
      if (!isPlatformMode && filters.type) params.append("type", filters.type);
      if (!isPlatformMode && filters.priority) {
        params.append("priority", filters.priority);
      }
      if (filters.status) params.append("status", filters.status);
      if (!isPlatformMode && filters.grade) params.append("grade", filters.grade);
      if (!isPlatformMode && isStudentBoardMode) {
        params.append("audience", "students");
      } else if (!isPlatformMode && filters.audience) {
        params.append("audience", filters.audience);
      }
      if (filters.search.trim()) {
        params.append("search", filters.search.trim());
      }
      params.append("scope", isPlatformMode ? "PLATFORM" : "SCHOOL");

      const res = await fetch(`/api/notices?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to load notices.");
      }
      // /api/notices now returns the standard envelope, so the payload is
      // under `data` (docs/ARCHITECTURE.md §3).
      const payload = data.data || {};
      setNotices(payload.notices || []);
      if (payload.pagination) {
        setPagination(payload.pagination);
      }
    } catch (error) {
      console.error("Error fetching notices:", error);
      setNotices([]);
      setFeedback({
        type: "error",
        title: "Notices could not be loaded",
        message:
          error.message ||
          "Please retry. If it continues, check your connection and server logs.",
        retry: () => fetchNotices(page),
      });
    } finally {
      setLoading(false);
    }
  }, [filters, isPlatformMode, isStudentBoardMode]);

  const fetchNoticeSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append("page", "1");
      params.append("limit", "100");
      params.append("scope", isPlatformMode ? "PLATFORM" : "SCHOOL");
      if (!isPlatformMode && isStudentBoardMode) {
        params.append("audience", "students");
      }

      const res = await fetch(`/api/notices?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const summary = data.data || {};
        setSummaryNotices(Array.isArray(summary.notices) ? summary.notices : []);
      }
    } catch (error) {
      console.error("Error fetching notice summary:", error);
    }
  }, [isPlatformMode, isStudentBoardMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNotices(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchNotices]);

  useEffect(() => {
    fetchNoticeSummary();
  }, [fetchNoticeSummary]);

  useEffect(() => {
    let isActive = true;

    const fetchGradeOptions = async () => {
      try {
        const res = await fetch("/api/school/grade-structure", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load grade options");

        const data = await res.json();
        const grades = (data.grades || data.data?.grades || [])
          .map((grade) => normalizeGradeValue(grade.name || grade._id || grade))
          .filter(Boolean);

        if (isActive) {
          setGradeOptions(grades.length > 0 ? grades : buildGradeLabels());
        }
      } catch (error) {
        if (isActive) {
          setGradeOptions(buildGradeLabels());
        }
      }
    };

    fetchGradeOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setNoticeForm((prev) => ({
      ...prev,
      grades: prev.grades.filter((grade) =>
        gradeOptions.includes(normalizeGradeValue(grade))
      ),
    }));
  }, [gradeOptions]);

  const saveNotice = async (e) => {
    e.preventDefault();

    if (!isPlatformMode && !isStudentBoardMode) {
      const { students, teachers, parents } = noticeForm.targetAudience;
      if (!students && !teachers && !parents) {
        setFeedback({
          type: "warning",
          title: "Missing Audience",
          message:
            "Please select at least one target audience (Students, Teachers, or Parents) before saving.",
        });
        return;
      }
    }

    try {
      setFeedback(null);
      const isEditing = Boolean(editingNoticeId);
      const res = await fetch(
        isEditing ? `/api/notices/${editingNoticeId}` : "/api/notices",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...noticeForm,
            // Students are fixed on this board; `parents` is the school's
            // choice and must be carried through rather than reset.
            targetAudience: isStudentBoardMode
              ? {
                  students: true,
                  teachers: false,
                  parents: Boolean(noticeForm.targetAudience.parents),
                }
              : noticeForm.targetAudience,
            scope: isPlatformMode ? "PLATFORM" : "SCHOOL",
          }),
        });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || payload.message || "Failed to save notice.");
      }

      setFeedback({
        type: "success",
        title:
          noticeForm.status === "DRAFT"
            ? "Notice saved as draft"
            : isEditing
              ? "Notice updated"
              : "Notice published",
        message:
          payload.message ||
          "Your notice list has been refreshed with the latest changes.",
      });
      resetForm();
      setEditingNoticeId("");
      setShowForm(false);
      fetchNotices();
      fetchNoticeSummary();
    } catch (error) {
      console.error("Error saving notice:", error);
      setFeedback({
        type: "error",
        title: "Notice was not saved",
        message: error.message || "Please retry after checking the notice details.",
      });
    }
  };

  const deleteNotice = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteTarget((current) => ({ ...current, busy: true }));
      setFeedback(null);
      const res = await fetch(`/api/notices/${deleteTarget._id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || payload.message || "Failed to archive notice.");
      }

      setFeedback({
        type: "success",
        title: "Notice archived",
        message: `"${deleteTarget.title}" is no longer visible in the active notice list.`,
      });
      setDeleteTarget(null);
      fetchNotices(pagination.page || 1);
      fetchNoticeSummary();
    } catch (error) {
      console.error("Error deleting notice:", error);
      setFeedback({
        type: "error",
        title: "Notice was not archived",
        message: error.message || "Please retry after checking the connection.",
      });
      setDeleteTarget(null);
    }
  };

  const resetForm = () => {
    setNoticeForm({
      title: "",
      content: "",
      type: "GENERAL",
      priority: "NORMAL",
      status: "PUBLISHED",
      visibility: "PRIVATE",
      targetAudience: buildDefaultAudience(),
      grades: [],
      expiryDate: "",
    });
  };

  const toggleGrade = (grade) => {
    const grades = noticeForm.grades.includes(grade)
      ? noticeForm.grades.filter((g) => g !== grade)
      : [...noticeForm.grades, grade];
    setNoticeForm({ ...noticeForm, grades });
  };

  const openEditNotice = (notice) => {
    setEditingNoticeId(notice._id);
    setSelectedNotice(null);
    setNoticeForm({
      title: notice.title || "",
      content: notice.content || "",
      type: notice.type || "GENERAL",
      priority: notice.priority || "NORMAL",
      status: notice.status || "PUBLISHED",
      visibility: notice.visibility || "PRIVATE",
      targetAudience: isStudentBoardMode
        ? {
            students: true,
            teachers: false,
            // Preserve the existing choice — reopening a parents notice to fix
            // a typo must not quietly drop the guardians off it.
            parents: Boolean(notice.targetAudience?.parents),
          }
        : notice.targetAudience || buildDefaultAudience(),
      grades: Array.isArray(notice.grades) ? notice.grades : [],
      expiryDate: notice.expiryDate
        ? new Date(notice.expiryDate).toISOString().slice(0, 16)
        : "",
    });
    setShowForm(true);
  };

  const getTypeColor = (type) => {
    return noticeTypes.find((t) => t.value === type)?.color || "bg-subtle";
  };

  const getPriorityColor = (priority) => {
    return (
      priorities.find((p) => p.value === priority)?.color || "text-muted"
    );
  };

  const formatDate = (date) => formatDateTime(date, calendar);

  const getStatusLabel = (notice) => {
    return notice.status === "DRAFT" ? "Draft" : "Published";
  };

  const sourceForMetrics = summaryNotices.length > 0 ? summaryNotices : notices;
  const totalNoticeCount = pagination.totalItems ?? sourceForMetrics.length;
  const publishedNoticeCount = sourceForMetrics.filter(
    (notice) => notice.status !== "DRAFT"
  ).length;
  const draftNoticeCount = sourceForMetrics.filter(
    (notice) => notice.status === "DRAFT"
  ).length;
  const scheduledNoticeCount = sourceForMetrics.filter(
    (notice) => notice.expiryDate && new Date(notice.expiryDate) > new Date()
  ).length;

  const metricCards = [
    {
      label: "Total Notices",
      value: totalNoticeCount,
      note: "This academic year",
      icon: FaClipboardList,
      tone: "purple",
    },
    {
      label: "Published",
      value: publishedNoticeCount,
      note: "Visible to students",
      icon: FaPaperPlane,
      tone: "emerald",
    },
    {
      label: "Scheduled",
      value: scheduledNoticeCount,
      note: "Have an expiry date",
      icon: FaRegCalendarAlt,
      tone: "amber",
    },
    {
      label: "Drafts",
      value: draftNoticeCount,
      note: "Not published yet",
      icon: FaFileAlt,
      tone: "blue",
    },
  ];

  const metricToneClasses = {
    purple: "border-brand-line bg-brand-soft text-brand-strong",
    emerald: "border-success-line bg-success-soft text-success",
    amber: "border-warning-line bg-warning-soft text-warning",
    blue: "border-brand-line bg-brand-soft text-brand-strong",
  };

  const typeStyles = {
    GENERAL: "border-success-line bg-success-soft text-success",
    URGENT: "border-danger-line bg-danger-soft text-danger",
    EVENT: "border-brand-line bg-brand-soft text-brand-strong",
    HOLIDAY: "border-warning-line bg-warning-soft text-warning",
    SHOWCASE: "border-brand-line bg-brand-soft text-brand-strong",
  };

  const statusStyles = {
    PUBLISHED: "bg-success-soft text-success",
    DRAFT: "bg-brand-soft text-brand-strong",
  };

  const rowAccentStyles = {
    GENERAL: "border-l border-l-success",
    URGENT: "border-l border-l-danger",
    EVENT: "border-l border-l-brand",
    HOLIDAY: "border-l border-l-warning",
    SHOWCASE: "border-l border-l-brand",
  };

  if (selectedNotice) {
    return (
      <div className="space-y-4">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setSelectedNotice(null)}
              className="btn btn-primary transition-colors"
            >
              Back to Notices
            </button>
            <div className="flex items-center gap-2">
              {!isPlatformMode && (
                <>
                  <span
                    className={`badge badge-neutral text-xs font-medium ${getTypeColor(
                      selectedNotice.type
                    )}`}
                  >
                    {selectedNotice.type}
                  </span>
                  <span
                    className={`text-sm font-medium ${getPriorityColor(
                      selectedNotice.priority
                    )}`}
                  >
                    {selectedNotice.priority} Priority
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="font-semibold text-ink mb-2">
                {selectedNotice.title}
              </h1>
              <div className="flex items-center gap-4 text-muted text-sm">
                <span>By {selectedNotice.author?.name}</span>
                <span>-</span>
                <span>{getStatusLabel(selectedNotice)}</span>
                <span>
                  {selectedNotice.publishedAt
                    ? formatDate(selectedNotice.publishedAt)
                    : "Not published yet"}
                </span>
              </div>
            </div>

            <div className="card p-4 sm:p-5">
              {isPlatformMode ? (
                <>
                  <h3 className="font-semibold text-ink mb-3">
                    Notice Delivery
                  </h3>
                  <div className="inline-flex rounded-full bg-ink px-3 py-2 text-sm text-subtle">
                    Visible inside school dashboards
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-semibold text-ink mb-3">
                    Target Audience
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {selectedNotice.targetAudience.students && (
                      <div className="flex items-center gap-2 bg-brand-soft text-brand px-3 py-2 rounded-control">
                        <FaUserGraduate />
                        <span>Students</span>
                      </div>
                    )}
                    {selectedNotice.targetAudience.teachers && (
                      <div className="flex items-center gap-2 bg-success-soft text-success px-3 py-2 rounded-control">
                        <FaChalkboardTeacher />
                        <span>Teachers</span>
                      </div>
                    )}
                    {selectedNotice.targetAudience.parents && (
                      <div className="flex items-center gap-2 bg-brand-soft text-brand px-3 py-2 rounded-control">
                        <FaUserFriends />
                        <span>Parents</span>
                      </div>
                    )}
                  </div>

                  {selectedNotice.grades?.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-ink font-medium mb-2">
                        Specific Grades:
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedNotice.grades.map((grade) => (
                          <span
                            key={grade}
                            className="bg-ink text-muted px-2 py-1 rounded-control text-sm"
                          >
                            {grade}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card p-4 sm:p-5">
              <h3 className="font-semibold text-ink mb-3">Content</h3>
              <div className="max-w-none">
                <p className="text-muted whitespace-pre-wrap leading-relaxed">
                  {selectedNotice.content}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          action={
            feedback.retry ? (
              <button
                type="button"
                onClick={feedback.retry}
                className="btn btn-ghost btn-sm transition-colors"
              >
                Retry
              </button>
            ) : null
          }
        />
      )}

      {/* Header */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-soft text-xl text-brand-strong">
              <FaBullhorn />
            </span>
            <div>
              <h2 className="font-semibold text-ink">{title}</h2>
              <p className="mt-2 max-w-2xl text-base text-muted">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (showForm) {
                resetForm();
                setEditingNoticeId("");
              }
              setShowForm(!showForm);
            }}
            className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaPlus />
            {showForm ? "Cancel" : editingNoticeId ? "Edit Notice" : "Create Notice"}
          </button>
        </div>

        <div className="mt-5 flex gap-3 rounded-card border border-brand-line bg-brand-soft p-4 text-sm font-semibold text-muted">
          <FaInfoCircle className="mt-0.5 shrink-0 text-brand-strong" />
          <p>
            {isPlatformMode
              ? "Platform notices appear inside logged-in school dashboards and notification panels."
              : isStudentBoardMode
                ? "Each notice can go to students only, or to students and their parents. Leave grades empty to send to everyone."
                : "Choose the audience carefully so each notice reaches the right school community members."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="card p-3"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${
                    metricToneClasses[card.tone]
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
            </div>
          );
        })}
      </div>

      {/* Create Notice Form */}
      {showForm && (
        <div className="card p-4 sm:p-5">
          <h3 className="font-semibold text-ink mb-4">
            {editingNoticeId ? "Edit Notice" : "Create New Notice"}
          </h3>

          <form onSubmit={saveNotice} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Notice Title"
                value={noticeForm.title}
                onChange={(e) =>
                  setNoticeForm({ ...noticeForm, title: e.target.value })
                }
                className="input"
                required
                maxLength={200}
              />

              {!isPlatformMode && !isStudentBoardMode && (
                <div className="flex gap-2">
                  <select
                    value={noticeForm.type}
                    onChange={(e) =>
                      setNoticeForm({ ...noticeForm, type: e.target.value })
                    }
                    className="input flex-1"
                  >
                    {noticeTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={noticeForm.priority}
                    onChange={(e) =>
                      setNoticeForm({ ...noticeForm, priority: e.target.value })
                    }
                    className="input flex-1"
                  >
                    {priorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <textarea
              placeholder="Notice Content"
              value={noticeForm.content}
              onChange={(e) =>
                setNoticeForm({ ...noticeForm, content: e.target.value })
              }
              className="input w-full"
              required
              maxLength={2000}
            />

            {isPlatformMode ? (
              <div className="rounded-card border border-brand bg-brand-soft p-4 text-sm text-brand-strong">
                Published platform notices will be shown to schools inside their dashboard notification areas.
              </div>
            ) : isStudentBoardMode ? (
              <fieldset>
                <legend className="mb-2 block font-medium text-muted">
                  Who should receive this notice?
                </legend>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      parents: false,
                      icon: FaUserGraduate,
                      label: "Students only",
                      note: "Appears on the student notice board.",
                    },
                    {
                      parents: true,
                      icon: FaUserFriends,
                      label: "Students and parents",
                      note: "Also delivered to guardians in the Parent App, with read receipts.",
                    },
                  ].map((option) => {
                    const Icon = option.icon;
                    const active =
                      Boolean(noticeForm.targetAudience.parents) ===
                      option.parents;
                    return (
                      <label
                        key={option.label}
                        className={`btn btn-secondary flex cursor-pointer gap-3 transition-colors ${
                          active
                            ? "border-brand-line bg-brand-soft"
                            : "border-line bg-surface hover:border-brand-line"
                        }`}
                      >
                        <input
                          type="radio"
                          name="student-notice-audience"
                          checked={active}
                          onChange={() => setStudentBoardParents(option.parents)}
                          className="mt-1 shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-semibold text-ink">
                            <Icon className="text-brand-strong" />
                            {option.label}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-muted">
                            {option.note}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-muted">
                  Grades below limit which students — and therefore which
                  guardians — this reaches.
                </p>
              </fieldset>
            ) : (
              <div>
                <label className="block text-muted mb-2 font-medium">
                  Target Audience (Select at least one)
                </label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noticeForm.targetAudience.students}
                      onChange={(e) =>
                        setNoticeForm({
                          ...noticeForm,
                          targetAudience: {
                            ...noticeForm.targetAudience,
                            students: e.target.checked,
                          },
                        })
                      }
                      className="rounded-control border-line-strong bg-surface text-brand-strong text-brand"
                    />
                    <FaUserGraduate className="text-brand" />
                    <span className="text-ink">Students</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noticeForm.targetAudience.teachers}
                      onChange={(e) =>
                        setNoticeForm({
                          ...noticeForm,
                          targetAudience: {
                            ...noticeForm.targetAudience,
                            teachers: e.target.checked,
                          },
                        })
                      }
                      className="rounded-control border-line-strong bg-surface text-brand-strong text-success"
                    />
                    <FaChalkboardTeacher className="text-success" />
                    <span className="text-ink">Teachers</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={noticeForm.targetAudience.parents}
                      onChange={(e) =>
                        setNoticeForm({
                          ...noticeForm,
                          targetAudience: {
                            ...noticeForm.targetAudience,
                            parents: e.target.checked,
                          },
                        })
                      }
                      className="rounded-control border-line-strong bg-surface text-brand-strong text-brand"
                    />
                    <FaUserFriends className="text-brand" />
                    <span className="text-ink">Parents</span>
                  </label>
                </div>
              </div>
            )}

            {!isPlatformMode && (
              <div>
                <label className="block text-muted mb-2 font-medium">
                  Specific Grades (Leave empty for all grades)
                </label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {gradeOptions.length === 0 ? (
                    <p className="col-span-full text-sm text-muted">
                      Loading grades...
                    </p>
                  ) : (
                    gradeOptions.map((grade) => (
                      <label
                        key={grade}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={noticeForm.grades.includes(grade)}
                          onChange={() => toggleGrade(grade)}
                          className="rounded-control border-line-strong bg-surface text-brand-strong text-success"
                        />
                        <span className="text-muted text-sm">{grade}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {!isPlatformMode && !isStudentBoardMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-card border border-brand bg-brand-soft p-4 text-sm text-brand-strong">
                  Notices stay visible until you edit, draft, or delete them.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-muted mb-2 font-medium">
                  Save As
                </label>
                <select
                  value={noticeForm.status}
                  onChange={(e) =>
                    setNoticeForm({ ...noticeForm, status: e.target.value })
                  }
                  className="input w-full"
                >
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary font-medium transition-colors"
              >
                {noticeForm.status === "DRAFT"
                  ? "Save as draft"
                  : editingNoticeId
                    ? "Update Notice"
                    : "Publish Notice"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditingNoticeId("");
                  setShowForm(false);
                }}
                className="btn btn-ghost font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card p-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_160px_160px_160px_auto]">
          <div className="relative">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder={
                isStudentBoardMode
                  ? "Search student notices..."
                  : "Search notice title or content..."
              }
              className="input w-full pl-11 pr-4 transition-colors"
            />
          </div>
          {!isPlatformMode && (
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="input transition-colors"
            >
              <option value="">All Types</option>
              {noticeTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          )}
          {!isPlatformMode && (
            <select
              value={filters.grade}
              onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
              className="input transition-colors"
            >
              <option value="">All Grades</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          )}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input transition-colors"
          >
            <option value="">All Status</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
          <button
            type="button"
            onClick={() =>
              setFilters({
                type: "",
                priority: "",
                audience: "",
                status: "",
                grade: "",
                search: "",
              })
            }
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaFilter />
            Clear
          </button>
        </div>
      </div>

      {/* Notices List */}
      <div className="card p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-ink">
            All Notices ({pagination.totalItems ?? notices.length})
          </h3>
          <span className="text-sm font-semibold text-brand-strong">
            Sort by: Newest First
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="card p-4"
              >
                <div className="mb-3 h-4 w-1/2 animate-pulse rounded-control bg-line" />
                <div className="mb-2 h-3 w-full animate-pulse rounded-control bg-line" />
                <div className="h-3 w-3/4 animate-pulse rounded-control bg-line" />
              </div>
            ))}
          </div>
        ) : notices.length > 0 ? (
          <>
            <div className="space-y-4">
              {notices.map((notice) => (
                <div
                  key={notice._id}
                  className={`card p-4 transition-colors hover:border-brand-line hover:bg-surface ${
                    rowAccentStyles[notice.type] || rowAccentStyles.GENERAL
                  }`}
                >
                  <div className="grid gap-4 lg:grid-cols-[1fr_180px_112px] lg:items-center">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`badge badge-neutral inline-flex items-center uppercase ${
                            typeStyles[notice.type] || typeStyles.GENERAL
                          }`}
                        >
                          {notice.type}
                        </span>
                        <span
                          className={`badge badge-neutral inline-flex items-center uppercase ${
                            statusStyles[notice.status] || statusStyles.PUBLISHED
                          }`}
                        >
                          {getStatusLabel(notice)}
                        </span>
                        {!isPlatformMode && notice.grades?.length > 0 && (
                          <span className="badge badge-neutral uppercase">
                            {notice.grades.join(", ")}
                          </span>
                        )}
                        {/* Which notices also went home. Without this the two
                            kinds are indistinguishable in the list, and a
                            school cannot tell whether parents were told. */}
                        {!isPlatformMode && notice.targetAudience?.parents && (
                          <span className="badge badge-brand inline-flex items-center gap-1 uppercase">
                            <FaUserFriends />
                            Parents
                          </span>
                        )}
                      </div>

                      <h4 className="line-clamp-1 text-lg font-semibold text-ink">
                        {notice.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {notice.content}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
                        <span>{notice.author?.name || "School Admin"}</span>
                        <span>
                          {notice.grades?.length > 0
                            ? `${notice.grades.length} grade target${
                                notice.grades.length === 1 ? "" : "s"
                              }`
                            : "All Students"}
                        </span>
                        <span>
                          {notice.publishedAt
                            ? formatDate(notice.publishedAt)
                            : "Not published yet"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span
                        className={`badge badge-neutral inline-flex text-xs ${
                          statusStyles[notice.status] || statusStyles.PUBLISHED
                        }`}
                      >
                        {getStatusLabel(notice)}
                      </span>
                      <p className="mt-1 text-xs font-semibold text-muted">
                        {notice.publishedAt
                          ? formatDate(notice.publishedAt)
                          : "Not published yet"}
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSelectedNotice(notice)}
                        className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
                        title="View notice"
                      >
                        <FaEye />
                      </button>
                      <button
                        onClick={() => openEditNotice(notice)}
                        className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
                        title="Edit notice"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(notice)}
                        className="btn-icon btn-soft-danger inline-flex items-center justify-center transition-colors"
                        title="Archive notice"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
            <PaginationControls
              currentPage={pagination.page || pagination.currentPage || 1}
              totalPages={pagination.totalPages || 1}
              onPageChange={fetchNotices}
              totalItems={pagination.totalItems}
              start={pagination.start}
              end={pagination.end}
            />
          </>
        ) : (
          <EmptyState
            icon={FaBullhorn}
            title="No notices found"
            description="Create your first notice when you are ready to publish an update."
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive this notice?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" will be removed from active notice lists, while keeping the record safely archived.`
            : ""
        }
        confirmLabel="Archive notice"
        tone="danger"
        busy={Boolean(deleteTarget?.busy)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteNotice}
      />
    </div>
  );
}
