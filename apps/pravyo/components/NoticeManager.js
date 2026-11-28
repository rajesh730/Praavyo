"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import {
  Megaphone as FaBullhorn,
  SquarePen as FaEdit,
  Plus as FaPlus,
  Trash2 as FaTrash,
  Search as FaSearch,
  GraduationCap as FaUserGraduate,
  Presentation as FaChalkboardTeacher,
  Users as FaUserFriends,
  ArrowLeft,
  X,
  Send,
  FileText,
  MailCheck,
  CircleAlert,
  Clock,
  Eye,
  Globe,
  UsersRound,
} from "lucide-react";
import NoticeFamilyPicker from "@/components/notices/NoticeFamilyPicker";
import { buildGradeLabels, normalizeGradeValue } from "@/lib/schoolGrades";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate, formatRelativeDateTime, formatWeekday } from "@/lib/nepaliDate";
import DatePickerField from "@pravyo/cas/components/ui/DatePickerField";
import { dateOfIso, isoOfDate } from "@pravyo/cas/components/ui/NepaliCalendar";
import DateTile from "@/components/common/DateTile";
import EmptyState from "@/components/EmptyState";
import PaginationControls from "@/components/PaginationControls";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const NOTICE_TYPES = [
  { value: "GENERAL", label: "General", badge: "badge-neutral" },
  { value: "URGENT", label: "Urgent", badge: "badge-danger" },
  { value: "EVENT", label: "Event", badge: "badge-brand" },
  { value: "HOLIDAY", label: "Holiday", badge: "badge-warning" },
  { value: "SHOWCASE", label: "Showcase", badge: "badge-brand" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const EMPTY_FILTERS = { type: "", priority: "", audience: "", status: "", grade: "", search: "" };
const TITLE_MAX = 200;
const CONTENT_MAX = 2000;

/** The day a notice stops showing → the last moment of that local day. */
function endOfDayIso(iso) {
  const date = dateOfIso(iso);
  if (!date) return null;
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
}

const isUrgent = (notice) => notice.type === "URGENT" || notice.priority === "URGENT";

// Chosen families arrive populated ({ _id, name, grade }) or as bare ids.
const familiesOf = (notice) =>
  (notice.targetStudents || []).map((student) =>
    typeof student === "object" && student
      ? { id: String(student._id || student.id), name: student.name || "Student", grade: student.grade || "" }
      : { id: String(student), name: "Student", grade: "" }
  );

export default function NoticeManager({
  scopeMode = "school",
  title = "Notice Board",
  subtitle = "Manage and publish notices for your school",
  fixedAudience = null,
  // Opens the list filtered to one audience ("students" | "teachers" |
  // "parents"), e.g. when an old Student Notices link is followed.
  initialAudience = "",
}) {
  const { calendar } = useCalendarPreference();
  const nepali = calendar === "BS";
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [editingNoticeId, setEditingNoticeId] = useState("");
  // Remembered until refresh; each notice screen keeps its own filters.
  const [filters, setFilters] = useRememberedState(
    `notices:${scopeMode}:${fixedAudience || "all"}:filters`,
    EMPTY_FILTERS
  );
  useEffect(() => {
    if (!initialAudience) return undefined;
    const timer = setTimeout(
      () => setFilters((current) => ({ ...current, audience: initialAudience })),
      0
    );
    return () => clearTimeout(timer);
  }, [initialAudience, setFilters]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalItems: 0, limit: 20 });
  const [feedback, setFeedback] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const formRef = useRef(null);

  const isPlatformMode = scopeMode === "platform";
  // The Student Notices board. Students are always an audience here; what the
  // school chooses is whether the child's guardians receive it as well, so this
  // flag means "student board", NOT "students only".
  const isStudentBoardMode = fixedAudience === "students";
  // The school's notices to its teachers: teachers fixed, nobody else.
  const isTeacherBoardMode = fixedAudience === "teachers";
  const isFixedBoard = isStudentBoardMode || isTeacherBoardMode;
  const TEACHERS_ONLY = { students: false, teachers: true, parents: false };

  const buildDefaultAudience = useCallback(
    () => ({
      students: isStudentBoardMode,
      teachers: isTeacherBoardMode,
      // Default off: adding parents is an explicit decision, and a notice
      // written for students ("bring your PE kit") is not automatically
      // something every guardian needs pushed to them.
      parents: false,
    }),
    [isStudentBoardMode, isTeacherBoardMode]
  );

  const blankForm = useCallback(
    () => ({
      title: "",
      content: "",
      type: "GENERAL",
      priority: "NORMAL",
      status: "PUBLISHED",
      visibility: "PRIVATE",
      targetAudience: buildDefaultAudience(),
      grades: [],
      // Parents: "GRADES" = every guardian of the chosen grades;
      // "CHOSEN" = only the guardians of `targetStudents`.
      parentScope: "GRADES",
      targetStudents: [],
      // An AD day, "YYYY-MM-DD"; the notice stops showing after it.
      expiryDate: "",
    }),
    [buildDefaultAudience]
  );

  const [noticeForm, setNoticeForm] = useState(blankForm);
  const [gradeOptions, setGradeOptions] = useState([]);
  const setField = (field, value) => setNoticeForm((prev) => ({ ...prev, [field]: value }));

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
      if (!isPlatformMode && filters.priority) params.append("priority", filters.priority);
      if (filters.status) params.append("status", filters.status);
      if (!isPlatformMode && filters.grade) params.append("grade", filters.grade);
      if (!isPlatformMode && isStudentBoardMode) {
        params.append("audience", "students");
      } else if (!isPlatformMode && isTeacherBoardMode) {
        params.append("audience", "teachers");
      } else if (!isPlatformMode && filters.audience) {
        params.append("audience", filters.audience);
      }
      if (filters.search.trim()) params.append("search", filters.search.trim());
      params.append("scope", isPlatformMode ? "PLATFORM" : "SCHOOL");

      const res = await fetch(`/api/notices?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to load notices.");
      }
      // /api/notices returns the standard envelope, so the payload is under
      // `data` (docs/ARCHITECTURE.md §3).
      const payload = data.data || {};
      setNotices(payload.notices || []);
      if (payload.pagination) setPagination(payload.pagination);
    } catch (error) {
      console.error("Error fetching notices:", error);
      setNotices([]);
      setFeedback({
        type: "error",
        title: "Notices could not be loaded",
        message: error.message || "Please retry. If it continues, check your connection.",
        retryPage: page,
      });
    } finally {
      setLoading(false);
    }
  }, [filters, isPlatformMode, isStudentBoardMode, isTeacherBoardMode]);

  useEffect(() => {
    const timer = setTimeout(() => fetchNotices(1), 300);
    return () => clearTimeout(timer);
  }, [fetchNotices]);

  useEffect(() => {
    let isActive = true;
    const fetchGradeOptions = async () => {
      try {
        const res = await fetch("/api/school/grade-structure", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load grade options");
        const data = await res.json();
        const grades = (data.grades || data.data?.grades || [])
          .map((grade) => normalizeGradeValue(grade.name || grade._id || grade))
          .filter(Boolean);
        if (isActive) setGradeOptions(grades.length > 0 ? grades : buildGradeLabels());
      } catch {
        if (isActive) setGradeOptions(buildGradeLabels());
      }
    };
    if (!isPlatformMode) fetchGradeOptions();
    return () => {
      isActive = false;
    };
  }, [isPlatformMode]);

  const closeForm = () => {
    setNoticeForm(blankForm());
    setEditingNoticeId("");
    setShowForm(false);
  };

  const openNewNotice = () => {
    setNoticeForm(blankForm());
    setEditingNoticeId("");
    setSelectedNotice(null);
    setShowForm(true);
  };

  // The all-audiences board narrowed to "Chosen families": every ticked
  // audience is narrowed to them (their parents, the children themselves,
  // the teachers of their grades).
  const choosingFamilies = !isPlatformMode && !isFixedBoard && noticeForm.parentScope === "CHOSEN";

  const saveNotice = async (status) => {
    if (!isPlatformMode && !isFixedBoard) {
      const { students, teachers, parents } = noticeForm.targetAudience;
      if (!students && !teachers && !parents) {
        setFeedback({
          type: "warning",
          title: "Choose who receives it",
          message: "Select at least one audience — Students, Teachers or Parents — before saving.",
        });
        return;
      }
      if (choosingFamilies && noticeForm.targetStudents.length === 0) {
        setFeedback({
          type: "warning",
          title: "Choose the families",
          message: "Tick at least one family, or choose \"Everyone in the grades below\" instead.",
        });
        return;
      }
    }

    try {
      setSaving(true);
      setFeedback(null);
      const isEditing = Boolean(editingNoticeId);
      const { parentScope: _parentScope, targetStudents: chosenFamilies, ...formFields } = noticeForm;
      const res = await fetch(isEditing ? `/api/notices/${editingNoticeId}` : "/api/notices", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formFields,
          status,
          // Chosen families reach their guardians whatever their grade, so
          // grades are cleared (the parent list would otherwise also require
          // a grade match).
          grades: choosingFamilies
            ? []
            : gradeOptions.length
              ? noticeForm.grades.filter((grade) => gradeOptions.includes(normalizeGradeValue(grade)))
              : noticeForm.grades,
          // Only the all-audiences board manages chosen families; the fixed
          // boards leave the field out so an existing choice is untouched.
          ...(!isPlatformMode && !isFixedBoard
            ? { targetStudents: choosingFamilies ? chosenFamilies.map((family) => family.id) : [] }
            : {}),
          // A notice for a few families is never shown publicly.
          visibility: choosingFamilies ? "PRIVATE" : noticeForm.visibility,
          expiryDate: noticeForm.expiryDate ? endOfDayIso(noticeForm.expiryDate) : null,
          // Students are fixed on this board; `parents` is the school's
          // choice and must be carried through rather than reset.
          targetAudience: isStudentBoardMode
            ? { students: true, teachers: false, parents: Boolean(noticeForm.targetAudience.parents) }
            : isTeacherBoardMode
            ? TEACHERS_ONLY
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
        title: status === "DRAFT" ? "Saved as a draft" : isEditing ? "Notice updated" : "Notice published",
        message:
          status === "DRAFT"
            ? "Nobody sees a draft until you publish it."
            : isEditing && noticeForm.status !== "DRAFT"
              ? "The board shows your changes. Anyone already told is not notified again."
              : isPlatformMode
                ? "It is on every school dashboard now."
                : `${audienceText({ ...noticeForm, grades: choosingFamilies ? [] : noticeForm.grades, targetStudents: choosingFamilies ? noticeForm.targetStudents : [] })} — being notified now.`,
      });
      closeForm();
      fetchNotices();
    } catch (error) {
      console.error("Error saving notice:", error);
      setFeedback({
        type: "error",
        title: "Notice was not saved",
        message: error.message || "Please retry after checking the notice details.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitWith = (status) => {
    // Use the browser's own required-field checks for both buttons.
    if (formRef.current && !formRef.current.reportValidity()) return;
    saveNotice(status);
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
        message: `"${deleteTarget.title}" is no longer on the board.`,
      });
      if (selectedNotice?._id === deleteTarget._id) setSelectedNotice(null);
      setDeleteTarget(null);
      fetchNotices(pagination.page || 1);
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

  const toggleGrade = (grade) =>
    setNoticeForm((prev) => ({
      ...prev,
      grades: prev.grades.includes(grade)
        ? prev.grades.filter((item) => item !== grade)
        : [...prev.grades, grade],
    }));

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
      targetAudience: isTeacherBoardMode
        ? TEACHERS_ONLY
        : isStudentBoardMode
        ? {
            students: true,
            teachers: false,
            // Preserve the existing choice — reopening a parents notice to fix
            // a typo must not quietly drop the guardians off it.
            parents: Boolean(notice.targetAudience?.parents),
          }
        : notice.targetAudience || buildDefaultAudience(),
      grades: Array.isArray(notice.grades) ? notice.grades : [],
      parentScope: notice.targetStudents?.length ? "CHOSEN" : "GRADES",
      targetStudents: familiesOf(notice),
      expiryDate: notice.expiryDate ? isoOfDate(new Date(notice.expiryDate)) : "",
    });
    setShowForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** "आज, दिउँसो २:१४" / "Today, 02:14 PM", or the full date further away. */
  const when = (value) => (value ? formatRelativeDateTime(value, calendar) : "");

  /** "कात्तिक २५ सम्म" / "Until Nov 11". */
  const untilLabel = (value) =>
    nepali
      ? `${formatDate(value, calendar, { withYear: false })} सम्म`
      : `Until ${formatDate(value, calendar, { withYear: false })}`;

  const typeOf = (value) => NOTICE_TYPES.find((type) => type.value === value) || NOTICE_TYPES[0];
  const tileTone = (notice) => (notice.status === "DRAFT" ? "muted" : isUrgent(notice) ? "danger" : "brand");
  const tileDate = (notice) => notice.publishedAt || notice.updatedAt || notice.createdAt;
  const audienceText = (notice) => {
    if (isPlatformMode) return "All schools";
    const who = [
      notice.targetAudience?.students && "Students",
      notice.targetAudience?.teachers && "Teachers",
      notice.targetAudience?.parents && "Parents",
    ].filter(Boolean);
    const families = notice.targetStudents?.length || 0;
    const reach = families
      ? `${families} chosen ${families === 1 ? "family" : "families"}`
      : notice.grades?.length
        ? notice.grades.join(", ")
        : "All grades";
    return `${who.join(" + ") || "No audience"} · ${reach}`;
  };

  const filtersActive = Object.entries(filters).some(([key, value]) => key !== "status" && value);

  // ------------------------------------------------------------------ detail
  if (selectedNotice) {
    const notice = selectedNotice;
    const type = typeOf(notice.type);
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelectedNotice(null)} className="btn btn-ghost -ml-2">
          <ArrowLeft aria-hidden /> All notices
        </button>

        <article className="card overflow-hidden">
          <header className={`flex gap-4 border-b border-line p-4 sm:p-5 ${isUrgent(notice) ? "bg-danger-soft" : "bg-surface-2"}`}>
            <DateTile value={tileDate(notice)} tone={tileTone(notice)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {!isPlatformMode && !isFixedBoard && <span className={`badge ${type.badge}`}>{type.label}</span>}
                {notice.status === "DRAFT"
                  ? <span className="badge badge-neutral">Draft — not sent</span>
                  : <span className="badge badge-success">On the board</span>}
                {notice.priority === "HIGH" && <span className="badge badge-warning">High priority</span>}
                {notice.priority === "URGENT" && <span className="badge badge-danger"><CircleAlert /> Urgent</span>}
                {notice.expiryDate && <span className="badge badge-warning" lang={nepali ? "ne" : undefined}><Clock /> {untilLabel(notice.expiryDate)}</span>}
              </div>
              <h1 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">{notice.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {notice.author?.name || "School"} ·{" "}
                <span lang={nepali ? "ne" : undefined}>
                  {notice.publishedAt
                    ? `${formatWeekday(notice.publishedAt, calendar)}, ${when(notice.publishedAt)}`
                    : "Not published yet"}
                </span>
              </p>
            </div>
          </header>

          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1fr_17rem]">
            <p className="whitespace-pre-wrap text-base leading-7 text-body">{notice.content}</p>

            <aside className="space-y-4 lg:border-l lg:border-line lg:pl-5">
              <div>
                <p className="eyebrow">Sent to</p>
                {isPlatformMode ? (
                  <p className="mt-1.5 text-sm text-ink">Every school dashboard</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {notice.targetAudience?.students && <span className="badge badge-brand"><FaUserGraduate /> Students</span>}
                    {notice.targetAudience?.teachers && <span className="badge badge-success"><FaChalkboardTeacher /> Teachers</span>}
                    {notice.targetAudience?.parents && <span className="badge badge-brand"><FaUserFriends /> Parents</span>}
                  </div>
                )}
              </div>
              {!isPlatformMode && (notice.targetStudents?.length ? (
                <div>
                  <p className="eyebrow">Chosen families</p>
                  <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto text-sm text-ink">
                    {familiesOf(notice).map((family) => (
                      <li key={family.id}>
                        {family.name}
                        {family.grade ? <span className="text-muted"> · {family.grade}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <p className="eyebrow">Grades</p>
                  <p className="mt-1.5 text-sm text-ink">{notice.grades?.length ? notice.grades.join(", ") : "All grades"}</p>
                </div>
              ))}
              {!isPlatformMode && notice.visibility === "PUBLIC" && (
                <div>
                  <p className="eyebrow">Public</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink"><Globe aria-hidden /> Also on your school website</p>
                </div>
              )}
              <div>
                <p className="eyebrow">Shows until</p>
                <p className="mt-1.5 text-sm text-ink" lang={nepali && notice.expiryDate ? "ne" : undefined}>
                  {notice.expiryDate
                    ? `${formatWeekday(notice.expiryDate, calendar)}, ${formatDate(notice.expiryDate, calendar)}`
                    : "Until you archive it"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <button type="button" className="btn btn-secondary" onClick={() => openEditNotice(notice)}>
                  <FaEdit aria-hidden /> Edit
                </button>
                <button type="button" className="btn btn-soft-danger" onClick={() => setDeleteTarget(notice)}>
                  <FaTrash aria-hidden /> Archive
                </button>
                {!isPlatformMode && notice.targetAudience?.parents && notice.status !== "DRAFT" && (
                  <Link href={`/school/notices/${notice._id}/delivery`} className="btn btn-soft w-full">
                    <MailCheck aria-hidden /> Who has read it
                  </Link>
                )}
              </div>
            </aside>
          </div>
        </article>

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Archive this notice?"
          message={deleteTarget ? `"${deleteTarget.title}" leaves the board. The record is kept, archived.` : ""}
          confirmLabel="Archive notice"
          tone="danger"
          busy={Boolean(deleteTarget?.busy)}
          onClose={() => setDeleteTarget(null)}
          onConfirm={deleteNotice}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------- list
  const previewDate = new Date();
  return (
    <div className="space-y-4">
      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          action={feedback.retryPage ? (
            <button type="button" onClick={() => fetchNotices(feedback.retryPage)} className="btn btn-ghost btn-sm">Retry</button>
          ) : null}
        />
      )}

      {/* Header */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
            <FaBullhorn aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        {!showForm && (
          <button type="button" onClick={openNewNotice} className="btn btn-primary">
            <FaPlus aria-hidden /> New notice
          </button>
        )}
      </div>

      {/* Composer */}
      {showForm && (
        <section className="card overflow-hidden" aria-labelledby="notice-composer-title">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
            <h3 id="notice-composer-title" className="font-semibold text-ink">
              {editingNoticeId ? "Edit notice" : "New notice"}
            </h3>
            <button type="button" className="btn-icon btn-ghost btn-sm" aria-label="Close" onClick={closeForm}>
              <X aria-hidden />
            </button>
          </div>

          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              saveNotice("PUBLISHED");
            }}
            className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_19rem]"
          >
            <div className="space-y-5">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="notice-title" className="label">Title</label>
                  <span className="text-2xs text-subtle tabular-nums">{noticeForm.title.length}/{TITLE_MAX}</span>
                </div>
                <input
                  id="notice-title"
                  type="text"
                  placeholder="e.g. School closed on Friday for Tihar"
                  value={noticeForm.title}
                  onChange={(event) => setField("title", event.target.value)}
                  className="input"
                  required
                  maxLength={TITLE_MAX}
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="notice-content" className="label">Message</label>
                  <span className="text-2xs text-subtle tabular-nums">{noticeForm.content.length}/{CONTENT_MAX}</span>
                </div>
                <textarea
                  id="notice-content"
                  rows={6}
                  placeholder="Write the notice the way you would read it out in assembly."
                  value={noticeForm.content}
                  onChange={(event) => setField("content", event.target.value)}
                  className="input w-full"
                  required
                  maxLength={CONTENT_MAX}
                />
              </div>

              {!isPlatformMode && !isFixedBoard && (
                <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
                  <fieldset>
                    <legend className="label">Type</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {NOTICE_TYPES.map((type) => {
                        const active = noticeForm.type === type.value;
                        return (
                          <button
                            key={type.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setField("type", type.value)}
                            className={`btn btn-sm rounded-full border ${
                              active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-body hover:bg-surface-2"
                            }`}
                          >
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <div>
                    <label htmlFor="notice-priority" className="label">Priority</label>
                    <select
                      id="notice-priority"
                      value={noticeForm.priority}
                      onChange={(event) => setField("priority", event.target.value)}
                      className="input w-full"
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority.value} value={priority.value}>{priority.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {isPlatformMode ? (
                <p className="rounded-card border border-brand-line bg-brand-soft p-3 text-sm text-brand-strong">
                  Published platform notices appear inside every school dashboard.
                </p>
              ) : isTeacherBoardMode ? (
                <p className="rounded-card border border-brand-line bg-brand-soft p-3 text-sm text-brand-strong">
                  Sent to your teachers: their notification bell, their Notices page and their phone or laptop.
                  Choose grades below to reach only the teachers of those grades.
                </p>
              ) : isStudentBoardMode ? (
                <fieldset>
                  <legend className="label">Who receives it?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { parents: false, icon: FaUserGraduate, label: "Students only", note: "On the student notice board." },
                      { parents: true, icon: FaUserFriends, label: "Students and parents", note: "Also sent to guardians in the Parent App, with read receipts." },
                    ].map((option) => {
                      const Icon = option.icon;
                      const active = Boolean(noticeForm.targetAudience.parents) === option.parents;
                      return (
                        <label
                          key={option.label}
                          className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                            active ? "border-brand bg-brand-soft" : "border-line-strong bg-surface hover:border-brand-line"
                          }`}
                        >
                          <input
                            type="radio"
                            name="student-notice-audience"
                            checked={active}
                            onChange={() => setStudentBoardParents(option.parents)}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                              <Icon className="text-brand-strong" aria-hidden /> {option.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted">{option.note}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <fieldset className="space-y-3">
                  <legend className="label">Who receives it? <span className="font-normal text-muted">(tick one or more)</span></legend>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "students", label: "Students", icon: FaUserGraduate, note: "Student notice board" },
                      { key: "teachers", label: "Teachers", icon: FaChalkboardTeacher, note: "Teacher bell and Notices page" },
                      { key: "parents", label: "Parents", icon: FaUserFriends, note: "Parent App, with read receipts" },
                    ].map((option) => {
                      const Icon = option.icon;
                      const active = Boolean(noticeForm.targetAudience[option.key]);
                      return (
                        <label
                          key={option.key}
                          className={`flex min-w-[10rem] flex-1 cursor-pointer items-start gap-2.5 rounded-card border p-3 transition-colors sm:flex-none ${
                            active ? "border-brand bg-brand-soft" : "border-line-strong bg-surface hover:border-brand-line"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() =>
                              setField("targetAudience", { ...noticeForm.targetAudience, [option.key]: !active })
                            }
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                              <Icon className="text-brand-strong" aria-hidden /> {option.label}
                            </span>
                            <span className="mt-0.5 block text-2xs text-muted">{option.note}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setField("targetAudience", { students: true, teachers: true, parents: true })}
                    className="btn btn-ghost btn-sm"
                  >
                    <UsersRound aria-hidden /> Everyone — students, teachers and parents
                  </button>

                  {(noticeForm.targetAudience.students || noticeForm.targetAudience.teachers || noticeForm.targetAudience.parents) && (
                    <div className="space-y-2 rounded-card border border-line p-3">
                      <p className="text-sm font-semibold text-ink">Which ones?</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            value: "GRADES",
                            label: "Everyone in the grades below",
                            note: "All ticked groups, in the chosen grades (or all grades).",
                          },
                          {
                            value: "CHOSEN",
                            label: "Chosen families only",
                            note: "Tick children. Students: only these children. Parents: their guardians. Teachers: of their grades.",
                          },
                        ].map((option) => {
                          const active = noticeForm.parentScope === option.value;
                          return (
                            <label
                              key={option.value}
                              className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                                active ? "border-brand bg-brand-soft" : "border-line-strong bg-surface hover:border-brand-line"
                              }`}
                            >
                              <input
                                type="radio"
                                name="notice-parent-scope"
                                checked={active}
                                onChange={() => setField("parentScope", option.value)}
                                className="mt-0.5 shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink">{option.label}</span>
                                <span className="mt-0.5 block text-xs text-muted">{option.note}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {choosingFamilies && (
                        <NoticeFamilyPicker
                          value={noticeForm.targetStudents}
                          onChange={(families) => setField("targetStudents", families)}
                          gradeOptions={gradeOptions}
                        />
                      )}
                    </div>
                  )}
                </fieldset>
              )}

              {!isPlatformMode && !choosingFamilies && (
                <fieldset>
                  <legend className="label">Grades</legend>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={noticeForm.grades.length === 0}
                      onClick={() => setField("grades", [])}
                      className={`btn btn-sm rounded-full border ${
                        noticeForm.grades.length === 0 ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-body hover:bg-surface-2"
                      }`}
                    >
                      All grades
                    </button>
                    {gradeOptions.length === 0 ? (
                      <span className="self-center text-xs text-muted">Loading grades…</span>
                    ) : (
                      gradeOptions.map((grade) => {
                        const active = noticeForm.grades.includes(grade);
                        return (
                          <button
                            key={grade}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleGrade(grade)}
                            className={`btn btn-sm rounded-full border ${
                              active ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-body hover:bg-surface-2"
                            }`}
                          >
                            {grade}
                          </button>
                        );
                      })
                    )}
                  </div>
                  {isStudentBoardMode && noticeForm.targetAudience.parents && (
                    <p className="mt-1.5 text-xs text-muted">Grades decide which students — and so which guardians — it reaches.</p>
                  )}
                </fieldset>
              )}

              <div className="max-w-sm">
                <label htmlFor="notice-until" className="label">
                  Show until <span className="font-normal text-muted">(optional)</span>
                </label>
                <DatePickerField
                  id="notice-until"
                  value={noticeForm.expiryDate}
                  onChange={(value) => setField("expiryDate", value)}
                  calendar={calendar}
                  min={isoOfDate(new Date())}
                  placeholder={nepali ? "नहटाएसम्म देखिन्छ" : "Stays up until you archive it"}
                />
                <p className="mt-1 text-xs text-muted">After this day it leaves the board by itself.</p>
              </div>

              {!isPlatformMode && !choosingFamilies && (
                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line p-3">
                  <input
                    type="checkbox"
                    checked={noticeForm.visibility === "PUBLIC"}
                    onChange={(event) => setField("visibility", event.target.checked ? "PUBLIC" : "PRIVATE")}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Globe className="text-brand-strong" aria-hidden /> Also show on our school website
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Anyone visiting your connected website sees it under Notices (Settings → Website).
                    </span>
                  </span>
                </label>
              )}

              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <button type="submit" disabled={saving} className="btn btn-primary">
                  <Send aria-hidden />
                  {saving ? "Saving…" : editingNoticeId && noticeForm.status !== "DRAFT" ? "Update notice" : "Publish now"}
                </button>
                {(!editingNoticeId || noticeForm.status === "DRAFT") && (
                  <button type="button" disabled={saving} onClick={() => submitWith("DRAFT")} className="btn btn-secondary">
                    <FileText aria-hidden /> Save as draft
                  </button>
                )}
                <button type="button" onClick={closeForm} className="btn btn-ghost">Cancel</button>
              </div>
            </div>

            {/* What students (and parents) will see. */}
            <aside className="hidden lg:block">
              <p className="eyebrow mb-2 flex items-center gap-1.5"><Eye aria-hidden /> Preview</p>
              <div className="rounded-card border border-line bg-surface-2 p-3">
                <div className="card flex gap-3 p-3">
                  <DateTile value={previewDate} tone={isUrgent(noticeForm) ? "danger" : "brand"} />
                  <div className="min-w-0">
                    <p className={`line-clamp-2 font-semibold ${noticeForm.title ? "text-ink" : "text-subtle"}`}>
                      {noticeForm.title || "Notice title"}
                    </p>
                    <p className={`mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-5 ${noticeForm.content ? "text-body" : "text-subtle"}`}>
                      {noticeForm.content || "Your message appears here."}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-2xs text-muted">
                  {isPlatformMode
                    ? "Every school dashboard"
                    : audienceText({
                        ...noticeForm,
                        targetAudience: isStudentBoardMode ? { ...noticeForm.targetAudience, students: true } : noticeForm.targetAudience,
                        targetStudents: choosingFamilies ? noticeForm.targetStudents : [],
                      })}
                  {noticeForm.expiryDate && <span lang={nepali ? "ne" : undefined}> · {untilLabel(dateOfIso(noticeForm.expiryDate))}</span>}
                </p>
              </div>
            </aside>
          </form>
        </section>
      )}

      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="tabs shrink-0" role="tablist" aria-label="Notice status">
          {[
            ["", "All"],
            ["PUBLISHED", "Published"],
            ["DRAFT", "Drafts"],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={filters.status === value}
              onClick={() => setFilters({ ...filters, status: value })}
              className="tab"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            placeholder="Search title or message"
            aria-label="Search notices"
            className="input w-full pl-9"
          />
        </div>
        {!isPlatformMode && (
          <div className="flex flex-wrap gap-2">
            {!isFixedBoard && (
              <select
                value={filters.audience}
                onChange={(event) => setFilters({ ...filters, audience: event.target.value })}
                aria-label="Recipients"
                className="input min-w-0 flex-1 lg:w-40"
              >
                <option value="">All recipients</option>
                <option value="students">Student notices</option>
                <option value="teachers">Teacher notices</option>
                <option value="parents">Parent notices</option>
              </select>
            )}
            {!isFixedBoard && (
              <select
                value={filters.type}
                onChange={(event) => setFilters({ ...filters, type: event.target.value })}
                aria-label="Type"
                className="input min-w-0 flex-1 lg:w-36"
              >
                <option value="">All types</option>
                {NOTICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            )}
            <select
              value={filters.grade}
              onChange={(event) => setFilters({ ...filters, grade: event.target.value })}
              aria-label="Grade"
              className="input min-w-0 flex-1 lg:w-36"
            >
              <option value="">All grades</option>
              {gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </div>
        )}
        {filtersActive && (
          <button type="button" onClick={() => setFilters({ ...EMPTY_FILTERS, status: filters.status })} className="btn btn-ghost btn-sm self-start lg:self-auto">
            <X aria-hidden /> Clear
          </button>
        )}
      </div>

      {/* List */}
      <section className="card overflow-hidden" aria-label="Notices">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">
            {filters.status === "DRAFT" ? "Drafts" : filters.status === "PUBLISHED" ? "Published" : "All notices"}
            <span className="ml-1.5 font-normal text-muted tabular-nums">{pagination.totalItems ?? notices.length}</span>
          </h3>
          <span className="text-xs text-muted">Urgent first, then newest</span>
        </div>

        {loading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3].map((index) => (
              <div key={index} className="flex gap-4 p-4">
                <div className="skeleton h-[4.5rem] w-14" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : notices.length > 0 ? (
          <>
            <ul className="divide-y divide-line">
              {notices.map((notice) => {
                const type = typeOf(notice.type);
                const draft = notice.status === "DRAFT";
                return (
                  <li
                    key={notice._id}
                    className={`group relative flex gap-3.5 p-4 transition-colors hover:bg-surface-2 sm:gap-4 ${
                      isUrgent(notice) && !draft ? "bg-danger-soft/40" : ""
                    }`}
                  >
                    {isUrgent(notice) && !draft && <span className="absolute inset-y-0 left-0 w-1 bg-danger" aria-hidden />}
                    <DateTile value={tileDate(notice)} tone={tileTone(notice)} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {draft && <span className="badge badge-neutral">Draft</span>}
                        {!isPlatformMode && !isFixedBoard && notice.type !== "GENERAL" && (
                          <span className={`badge ${type.badge}`}>{type.label}</span>
                        )}
                        {notice.priority === "URGENT" && notice.type !== "URGENT" && <span className="badge badge-danger">Urgent</span>}
                        {notice.priority === "HIGH" && <span className="badge badge-warning">High priority</span>}
                        {!isPlatformMode && notice.targetAudience?.parents && (
                          // Which notices also went home — otherwise a school
                          // cannot tell whether parents were told.
                          <span className="badge badge-brand"><FaUserFriends /> Parents</span>
                        )}
                        {notice.expiryDate && <span className="badge badge-warning" lang={nepali ? "ne" : undefined}><Clock /> {untilLabel(notice.expiryDate)}</span>}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedNotice(notice)}
                        className="mt-1 block max-w-full text-left after:absolute after:inset-0 after:content-['']"
                      >
                        <h4 className="line-clamp-1 text-base font-semibold text-ink group-hover:text-brand-strong">{notice.title}</h4>
                      </button>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{notice.content}</p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        <span lang={nepali ? "ne" : undefined}>
                          {draft ? `Edited ${when(tileDate(notice))}` : when(notice.publishedAt)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{audienceText(notice)}</span>
                        {notice.author?.name && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{notice.author.name}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* Above the row's click area, so they act on their own. */}
                    <div className="relative z-10 flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                      <button
                        type="button"
                        onClick={() => openEditNotice(notice)}
                        className="btn-icon btn-ghost btn-sm"
                        title="Edit notice"
                        aria-label={`Edit ${notice.title}`}
                      >
                        <FaEdit aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(notice)}
                        className="btn-icon btn-ghost btn-sm text-muted hover:!bg-danger-soft hover:!text-danger"
                        title="Archive notice"
                        aria-label={`Archive ${notice.title}`}
                      >
                        <FaTrash aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line px-4 py-3">
              <PaginationControls
                currentPage={pagination.page || pagination.currentPage || 1}
                totalPages={pagination.totalPages || 1}
                onPageChange={fetchNotices}
                totalItems={pagination.totalItems}
                start={pagination.start}
                end={pagination.end}
              />
            </div>
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={FaBullhorn}
              title={filtersActive || filters.status ? "No notices match" : "No notices yet"}
              description={
                filtersActive || filters.status
                  ? "Try another search, or clear the filters."
                  : "Write your first notice — it appears on the board as soon as you publish it."
              }
            />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive this notice?"
        message={deleteTarget ? `"${deleteTarget.title}" leaves the board. The record is kept, archived.` : ""}
        confirmLabel="Archive notice"
        tone="danger"
        busy={Boolean(deleteTarget?.busy)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteNotice}
      />
    </div>
  );
}
