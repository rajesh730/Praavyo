"use client";

import { useCallback, useEffect, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { BookOpen as FaBookOpen, Eye as FaEye, ListFilter as FaFilter, Search as FaSearch } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import EmptyState from "@/components/EmptyState";
import PaginationControls from "@/components/PaginationControls";
import WritingContent from "@/components/WritingContent";
import {
  WritingCover,
  WritingGallery,
  WritingTags,
} from "@/components/WritingMedia";
import { getWritingCategoryLabel } from "@/lib/writingCategories";
import AppDate from "@/components/common/AppDate";


function categoryTone(category = "") {
  const normalized = category.toLowerCase();
  if (normalized.includes("speech")) return "bg-success-soft text-success";
  if (normalized.includes("poetry")) return "bg-warning-soft text-warning";
  if (normalized.includes("debate")) return "bg-brand-soft text-brand-strong";
  return "bg-brand-soft text-brand-strong";
}

export default function SchoolMagazineReviewManager({
  onStatsChange,
  selectedGrade,
  onGradeChange,
  providedGradeOptions = [],
}) {
  // Remembered until the page is refreshed.
  const [activeGrade, setActiveGrade] = useRememberedState("magazine-review:grade", "ALL");
  const [gradeOptions, setGradeOptions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [search, setSearch] = useRememberedState("magazine-review:search", "");
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 20,
  });
  const effectiveGrade = selectedGrade || activeGrade;
  const effectiveGradeOptions =
    providedGradeOptions.length > 0 ? providedGradeOptions : gradeOptions;

  const loadSubmissions = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({
          status: "POSTED",
          page: String(page),
          limit: "12",
        });
        if (search.trim()) params.append("search", search.trim());
        if (effectiveGrade !== "ALL") params.append("grade", effectiveGrade);
        const res = await fetch(`/api/school/magazine-submissions?${params}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload.message || "Failed to load submissions");
        }

        setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        if (payload.pagination) {
          setPagination(payload.pagination);
          onStatsChange?.({
            reviewTotal: payload.pagination.totalItems || payload.pagination.totalSubmissions || 0,
            activeReviewFilter: "POSTED",
          });
        }
      } catch (loadError) {
        setError(loadError.message || "Failed to load submissions");
      } finally {
        setLoading(false);
      }
    },
    [effectiveGrade, onStatsChange, search]
  );

  useEffect(() => {
    // When the parent already supplies grade options, don't refetch them here —
    // that's a wasted request and the result would be ignored anyway.
    if (providedGradeOptions.length > 0) return;

    async function loadGrades() {
      try {
        const res = await fetch("/api/school/grade-structure", {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        const grades = Array.isArray(payload.grades)
          ? payload.grades.map((grade) => grade.name || grade._id || grade)
          : [];
        setGradeOptions(grades.filter(Boolean));
      } catch {
        setGradeOptions([]);
      }
    }

    void loadGrades();
  }, [providedGradeOptions.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSubmissions(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [effectiveGrade, loadSubmissions]);

  const updateGrade = (grade) => {
    if (onGradeChange) {
      onGradeChange(grade);
      return;
    }
    setActiveGrade(grade);
  };

  const openSubmission = (submission) => {
    setSelectedSubmission(submission);
    setSuccess("");
    setError("");

    // Opening a post marks that specific post read → its unread dot clears.
    if (submission?.isUnread) {
      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id ? { ...item, isUnread: false } : item
        )
      );
      fetch(`/api/school/magazine/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_READ" }),
      }).catch(() => {});
    }
  };

  const handleWallAction = async (submission, action) => {
    if (!submission) return;

    try {
      setBusyId(submission.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/school/magazine/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to update writing");
      }

      setSuccess(payload.message || "Writing updated");
      if (payload.article?.id) {
        setSubmissions((currentSubmissions) =>
          currentSubmissions.map((item) =>
            item.id === payload.article.id
              ? {
                  ...item,
                  showOnSchoolWall:
                    payload.article.showOnSchoolWall ?? item.showOnSchoolWall,
                }
              : item
          )
        );
      }
      setSelectedSubmission(null);
    } catch (reviewError) {
      setError(reviewError.message || "Failed to update writing");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-ink">School Wall</h2>
        <div className="mt-1 h-0.5 w-24 rounded-full bg-brand" />
      </div>

      {error && <AlertBanner type="error" title="School wall failed" message={error} />}
      {success && <AlertBanner type="success" title="School wall updated" message={success} />}

      <div className="card p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-control border border-brand-line bg-brand-soft px-4 text-xs font-semibold uppercase text-brand-strong">
          Posted by Students
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:justify-end">
          <select
            value={effectiveGrade}
            onChange={(event) => updateGrade(event.target.value)}
            className="input"
          >
            <option value="ALL">All grades</option>
            {effectiveGradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          <label className="relative block">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title or student..."
              className="input w-full pl-9 pr-3 lg:w-80"
            />
          </label>
          <button
            type="button"
            onClick={() => loadSubmissions(1)}
            className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-2"
          >
            <FaFilter />
            Filter
          </button>
        </div>
        </div>
      </div>

      {loading ? (
        <LoadingState
          title="Loading school wall"
          message="Preparing student posts for the school wall."
        />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={FaBookOpen}
          title="No posted writing in this view"
          description="Student writing will appear here after students post it to school."
        />
      ) : (
        <div className="space-y-3">
          <div className="card overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[minmax(240px,1.5fr)_150px_110px_150px_130px_210px] gap-3 border-b border-line bg-surface px-4 py-3 text-2xs font-semibold uppercase text-muted">
              <span>Writing</span>
              <span>Student</span>
              <span>Grade</span>
              <span>Type</span>
              <span>Wall</span>
              <span className="text-right">Action</span>
            </div>
            <div>
              {submissions.map((submission) => {
                // Per-post unread: stays marked until the school opens/reads it.
                const isNew = Boolean(submission.isUnread);
                return (
                <div
                  key={submission.id}
                  className={`grid min-w-[980px] grid-cols-[minmax(240px,1.5fr)_150px_110px_150px_130px_210px] gap-3 border-b border-l border-line px-4 py-4 text-sm last:border-b-0 ${
                    isNew ? "border-l-warning bg-warning-soft" : "border-l-transparent"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink">
                        {submission.title}
                      </p>
                      {isNew && (
                        <span className="badge badge-warning shrink-0 uppercase tracking-wide">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-2xs font-semibold text-muted">
                      Posted{" "}
                      <AppDate
                        value={submission.submittedAt || submission.updatedAt}
                        mode="dateTime"
                      />
                    </p>
                  </div>
                  <span className="truncate font-semibold text-ink">
                    {submission.authorStudent?.name || "Student"}
                  </span>
                  <span className="font-semibold text-muted">
                    {submission.authorStudent?.grade || "Grade"}
                  </span>
                  <span
                    className={`badge badge-neutral w-fit uppercase leading-none ${categoryTone(
                      submission.category
                    )}`}
                  >
                    {getWritingCategoryLabel(submission.category)}
                  </span>
                  <span className="font-semibold text-muted">
                    {submission.showOnSchoolWall ? "Visible" : "Hidden"}
                  </span>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openSubmission(submission)}
                      className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <FaEye />
                      Read
                    </button>
                    <button
                      type="button"
                      disabled={busyId === submission.id}
                      onClick={() =>
                        handleWallAction(
                          submission,
                          submission.showOnSchoolWall
                            ? "HIDE_SCHOOL_WALL"
                            : "SHOW_SCHOOL_WALL"
                        )
                      }
                      className="btn btn-primary inline-flex items-center justify-center transition-colors"
                    >
                      {submission.showOnSchoolWall ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <PaginationControls
            currentPage={pagination.page || pagination.currentPage || 1}
            totalPages={pagination.totalPages || 1}
            onPageChange={(page) => loadSubmissions(page)}
            totalItems={pagination.totalItems}
            start={pagination.start}
            end={pagination.end}
          />
        </div>
      )}

      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-control bg-surface p-4 sm:p-5 shadow-pop">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className={`badge badge-neutral inline-flex uppercase ${categoryTone(selectedSubmission.category)}`}>
                    {getWritingCategoryLabel(selectedSubmission.category)}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-ink">
                  {selectedSubmission.title}
                </h3>
                <p className="mt-2 text-sm font-semibold text-muted">
                  {selectedSubmission.authorStudent?.name || "Student"} -{" "}
                  {selectedSubmission.authorStudent?.grade || "Grade"} - Roll{" "}
                  {selectedSubmission.authorStudent?.rollNumber || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="text-sm font-semibold text-muted hover:text-ink"
              >
                Close
              </button>
            </div>

            <WritingCover
              coverImage={selectedSubmission.coverImage}
              images={selectedSubmission.images}
              title={selectedSubmission.title}
              className="mt-5 border border-line"
              imageClassName="h-auto max-h-[26rem] w-full object-contain"
              showCaption
            />
            <WritingTags tags={selectedSubmission.tags} className="mt-4" />
            <WritingContent
              content={selectedSubmission.content}
              className="mt-5 rounded-control border border-line bg-surface p-4 text-sm font-semibold leading-7 text-ink"
            />
            <WritingGallery
              images={selectedSubmission.images}
              coverImage={selectedSubmission.coverImage}
              title={selectedSubmission.title}
              className="mt-5"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={busyId === selectedSubmission.id}
                onClick={() =>
                  handleWallAction(
                    selectedSubmission,
                    selectedSubmission.showOnSchoolWall
                      ? "HIDE_SCHOOL_WALL"
                      : "SHOW_SCHOOL_WALL"
                  )
                }
                className="btn btn-primary inline-flex items-center transition-colors"
              >
                {selectedSubmission.showOnSchoolWall
                  ? "Hide from School Wall"
                  : "Show on School Wall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
