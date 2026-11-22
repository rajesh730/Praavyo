"use client";

import { useCallback, useEffect, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { bsAcademicYearLabel } from "@pravyo/core/nepaliDate";
import { BookOpen as FaBookOpen, Search as FaSearch } from "lucide-react";
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
import PublishingTable, { PlacementSwitch } from "@/components/school/PublishingTable";
import WritingEditForm from "@/components/school/WritingEditForm";


function categoryTone(category = "") {
  const normalized = category.toLowerCase();
  if (normalized.includes("speech")) return "bg-success-soft text-success";
  if (normalized.includes("poetry")) return "bg-warning-soft text-warning";
  if (normalized.includes("debate")) return "bg-brand-soft text-brand-strong";
  return "bg-brand-soft text-brand-strong";
}

// The school uses the defaults. A class teacher's Publishing Desk passes the
// /api/teacher/publishing endpoints, their class grades and trackUnread=false
// (the unread dots are the school's own; a teacher never clears them).
export default function SchoolMagazineReviewManager({
  onStatsChange,
  selectedGrade,
  onGradeChange,
  providedGradeOptions = [],
  listEndpoint = "/api/school/magazine-submissions",
  articleEndpoint = "/api/school/magazine",
  trackUnread = true,
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
  const [editingSubmission, setEditingSubmission] = useState(false);
  const [search, setSearch] = useRememberedState("magazine-review:search", "");
  const [year, setYear] = useRememberedState("magazine-review:year", "");
  const [years, setYears] = useState([]);
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
        if (year) params.append("year", year);
        const res = await fetch(`${listEndpoint}?${params}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload.message || "Failed to load submissions");
        }

        setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        if (Array.isArray(payload.years)) setYears(payload.years);
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
    [effectiveGrade, listEndpoint, onStatsChange, search, year]
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
    setEditingSubmission(false);
    setSuccess("");
    setError("");

    // Opening a post marks that specific post read → its unread dot clears.
    if (trackUnread && submission?.isUnread) {
      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id ? { ...item, isUnread: false } : item
        )
      );
      fetch(`${articleEndpoint}/${submission.id}`, {
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

      const res = await fetch(`${articleEndpoint}/${submission.id}`, {
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
                  isPublished: payload.article.isPublished ?? item.isPublished,
                  isGlobalWallPublished:
                    payload.article.isGlobalWallPublished ?? item.isGlobalWallPublished,
                }
              : item
          )
        );
      }
      setSelectedSubmission((current) =>
        current && payload.article?.id === current.id
          ? {
              ...current,
              showOnSchoolWall: payload.article.showOnSchoolWall ?? current.showOnSchoolWall,
              isPublished: payload.article.isPublished ?? current.isPublished,
              isGlobalWallPublished: payload.article.isGlobalWallPublished ?? current.isGlobalWallPublished,
            }
          : current
      );
    } catch (reviewError) {
      setError(reviewError.message || "Failed to update writing");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Free Writing</h2>
        <div className="mt-1 h-0.5 w-24 rounded-full bg-brand" />
      </div>

      {error && <AlertBanner type="error" title="School wall failed" message={error} />}
      {success && <AlertBanner type="success" title="School wall updated" message={success} />}

      {/* One line: what this is, then grade, year and search. */}
      <div className="card flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
        <p className="text-sm font-semibold text-ink lg:mr-auto">
          Posted by students
          {pagination.totalItems || pagination.totalSubmissions ? (
            <span className="ml-1.5 font-normal text-muted">· {pagination.totalItems || pagination.totalSubmissions}</span>
          ) : null}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select
            value={effectiveGrade}
            onChange={(event) => updateGrade(event.target.value)}
            className="input sm:w-40"
            aria-label="Grade"
          >
            <option value="ALL">All grades</option>
            {effectiveGradeOptions.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          <select value={year} onChange={(event) => setYear(event.target.value)} className="input sm:w-36" aria-label="Academic year">
            <option value="">All years</option>
            {years.map((start) => (
              <option key={start} value={String(start)}>{bsAcademicYearLabel(start)} BS</option>
            ))}
          </select>
          <label className="relative col-span-2 block sm:w-72">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title or student..."
              className="input w-full pl-9 pr-3"
            />
          </label>
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
          <PublishingTable
            rows={submissions}
            isNew={(submission) => Boolean(submission.isUnread)}
            onOpen={openSubmission}
            statusHeader="School wall"
            renderStatus={(submission) => (
              <PlacementSwitch
                on={Boolean(submission.showOnSchoolWall)}
                busy={busyId === submission.id}
                label={`School wall for ${submission.title}`}
                onToggle={() =>
                  handleWallAction(submission, submission.showOnSchoolWall ? "HIDE_SCHOOL_WALL" : "SHOW_SCHOOL_WALL")
                }
              />
            )}
            status2Header="Global wall"
            renderStatus2={(submission) => (
              <PlacementSwitch
                on={Boolean(submission.isPublished)}
                busy={busyId === submission.id}
                label={`Global wall for ${submission.title}`}
                onToggle={() =>
                  handleWallAction(submission, submission.isPublished ? "UNPUBLISH_HOMEPAGE" : "PUBLISH_HOMEPAGE")
                }
              />
            )}
          />

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
              <div className="flex shrink-0 items-center gap-2">
                {!editingSubmission && (
                  <button type="button" onClick={() => setEditingSubmission(true)} className="btn btn-secondary btn-sm">
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSelectedSubmission(null); setEditingSubmission(false); }}
                  className="btn btn-ghost btn-sm"
                >
                  Close
                </button>
              </div>
            </div>

            {editingSubmission ? (
              <WritingEditForm
                article={selectedSubmission}
                endpoint={articleEndpoint}
                onCancel={() => setEditingSubmission(false)}
                onSaved={(saved, message) => {
                  const merge = (item) => (item.id === selectedSubmission.id ? { ...item, ...saved, id: item.id } : item);
                  setSubmissions((current) => current.map(merge));
                  setSelectedSubmission((current) => (current ? merge(current) : current));
                  setEditingSubmission(false);
                  setSuccess(message || "Changes saved");
                }}
              />
            ) : (
            <>

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
            </>
            )}

            {!editingSubmission && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-6 border-t border-line pt-4 text-sm font-semibold text-ink">
              <span className="inline-flex items-center gap-3">
                School wall
                <PlacementSwitch
                  on={Boolean(selectedSubmission.showOnSchoolWall)}
                  busy={busyId === selectedSubmission.id}
                  label="School wall"
                  onToggle={() =>
                    handleWallAction(selectedSubmission, selectedSubmission.showOnSchoolWall ? "HIDE_SCHOOL_WALL" : "SHOW_SCHOOL_WALL")
                  }
                />
              </span>
              <span className="inline-flex items-center gap-3">
                Global wall
                <PlacementSwitch
                  on={Boolean(selectedSubmission.isPublished)}
                  busy={busyId === selectedSubmission.id}
                  label="Global wall"
                  onToggle={() =>
                    handleWallAction(selectedSubmission, selectedSubmission.isPublished ? "UNPUBLISH_HOMEPAGE" : "PUBLISH_HOMEPAGE")
                  }
                />
              </span>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
