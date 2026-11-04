"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { bsAcademicYearLabel, formatMonthYear } from "@pravyo/core/nepaliDate";
import { ArrowLeft as FaArrowLeft, BookOpen as FaBookOpen, CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, SquarePen as FaEdit, House as FaHome, Inbox as FaInbox, Plus as FaPlus, Newspaper as FaRegNewspaper, X as FaTimes } from "lucide-react";
import SchoolMagazineReviewManager from "@/components/school/SchoolMagazineReviewManager";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import WritingContent from "@/components/WritingContent";
import {
  WritingCover,
  WritingGallery,
  WritingTags,
} from "@/components/WritingMedia";
import AppDate from "@/components/common/AppDate";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import { getWritingCategoryLabel } from "@/lib/writingCategories";
import PublishingTable, { PlacementSwitch } from "@/components/school/PublishingTable";
import WritingEditForm from "@/components/school/WritingEditForm";

function getReadMinutes(content) {
  return Math.max(1, Math.ceil(wordCount(content) / 180));
}

/**
 * Where a magazine sits for the filters: its academic year (a session runs
 * from April / Baisakh, shown in BS like the rest of the dates) and its
 * month, both from the date it was created.
 */
function issueFacts(issue) {
  const date = new Date(issue.weekStart || issue.publishedAt || issue.createdAt || Date.now());
  const yearStart = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const month = formatMonthYear(date, "BS");
  return {
    yearKey: String(yearStart),
    yearLabel: `${bsAcademicYearLabel(yearStart)} BS`,
    monthKey: month,
    monthLabel: month,
  };
}

function getArticleFreshDate(article) {
  return new Date(
    article.submittedAt ||
      article.createdAt ||
      article.publishedAt ||
      article.updatedAt ||
      0
  );
}

/** Only writings the student sent to the magazine can go into an issue. */
function isSentToMagazine(article) {
  return article.submissionSource === "MAGAZINE";
}

function isFreshForMagazine(article) {
  const freshDate = getArticleFreshDate(article);
  if (Number.isNaN(freshDate.getTime())) return false;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  return freshDate >= cutoff;
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function MagazineTabButton({
  id,
  activeTab,
  onClick,
  icon: Icon,
  label,
  count = 0,
  dot = false,
}) {
  const isActive = activeTab === id;
  // One clean line: icon, name, count. The active tab is marked by an
  // underline and brand text; the red dot means new posts to look at.
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onClick(id)}
      className={`relative inline-flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4 ${
        isActive ? "text-brand-strong" : "text-muted hover:text-ink"
      }`}
    >
      <span className="relative">
        <Icon aria-hidden size={17} />
        {dot && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" aria-label="New" />}
      </span>
      {label}
      {count > 0 && (
        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-bold ${
          isActive ? "bg-brand text-white" : "bg-surface-2 text-muted"
        }`}>
          {count}
        </span>
      )}
      <span aria-hidden className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full ${isActive ? "bg-brand" : "bg-transparent"}`} />
    </button>
  );
}

function StatusPill({ article }) {
  const magazineIssueTitle = article.magazineIssue?.title;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={`badge badge-neutral uppercase ${
          article.isMagazinePublished
            ? "bg-success-soft text-success"
            : "bg-surface-2 text-muted"
        }`}
      >
        {article.isMagazinePublished ? "Magazine" : "School Wall"}
      </span>
      <span
        className={`badge badge-neutral uppercase ${
          article.isPublished
            ? "bg-brand-soft text-brand-strong"
            : "bg-surface-2 text-muted"
        }`}
      >
        {article.isPublished ? "Homepage" : "Not Homepage"}
      </span>
      {magazineIssueTitle && (
        <span className="badge badge-warning uppercase">
          Used: {magazineIssueTitle}
        </span>
      )}
    </div>
  );
}

function getIssueLabel(article) {
  return article.magazineIssue?.title || "School magazine";
}

function isInIssue(article, issue) {
  if (!article.magazineIssue?.id || !issue?.id) return false;
  return article.magazineIssue.id === issue.id;
}

function WritingTable({ articles, busyId, emptyState, mode, onRead, onAction }) {
  if (articles.length === 0) return emptyState;

  const busy = (article) => busyId === article.id;

  if (mode === "home") {
    return (
      <PublishingTable
        rows={articles}
        statusHeader="Home page"
        onOpen={onRead}
        renderStatus={(article) => (article.isPublished ? "Shown" : "Not shown")}
        renderActions={(article) => (
          <button type="button" disabled={busy(article)}
            onClick={() => onAction(article, article.isPublished ? "UNPUBLISH_HOMEPAGE" : "PUBLISH_HOMEPAGE")}
            className="btn btn-secondary btn-sm whitespace-nowrap">
            {busy(article) ? "Updating…" : article.isPublished ? "Hide from home" : "Show on home"}
          </button>
        )}
      />
    );
  }

  // Writing inside a magazine, or sent to it and waiting to be added: one
  // switch, like School wall / Global wall in Free Writing.
  return (
    <PublishingTable
      rows={articles}
      statusHeader="In magazine"
      onOpen={onRead}
      renderStatus={(article) =>
        article.magazineIssue && !article.isMagazinePublished ? (
          <span className="text-sm text-muted">Used in {getIssueLabel(article)}</span>
        ) : (
          <PlacementSwitch
            on={Boolean(article.isMagazinePublished)}
            busy={busy(article)}
            label={`In magazine: ${article.title}`}
            onText="Added"
            offText="Not added"
            onToggle={() => onAction(article, article.isMagazinePublished ? "UNPUBLISH_MAGAZINE" : "PUBLISH_MAGAZINE")}
          />
        )
      }
      renderActions={(article) => (
        <button type="button" disabled={busy(article)} onClick={() => onAction(article, "DELETE")}
          className="btn btn-soft-danger btn-sm whitespace-nowrap">
          Delete
        </button>
      )}
    />
  );
}

export default function SchoolMagazineManager() {
  const { getIndicator, markSurfaceSeen } = useWorkIndicators();
  // Remembered until the page is refreshed.
  const [rememberedTab, setActiveTab] = useRememberedState("magazine:tab", "wall");
  // "Show To Home" merged into Free Writing (its Global wall switch).
  const activeTab = rememberedTab === "magazine" ? "magazine" : "wall";
  const [activeGrade, setActiveGrade] = useRememberedState("magazine:grade", "ALL");
  const [gradeOptions, setGradeOptions] = useState([]);
  const [readingArticle, setReadingArticleState] = useState(null);
  const [editingArticle, setEditingArticle] = useState(false);
  const setReadingArticle = (article) => {
    setReadingArticleState(article);
    setEditingArticle(false);
  };
  const [approvedArticles, setApprovedArticles] = useState([]);
  const [publishedArticles, setPublishedArticles] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [currentIssue, setCurrentIssue] = useState(null);

  // Clicking the School Wall tab marks its new posts "seen" → the red dot
  // clears until the next new post arrives.
  const handleSelectTab = (id) => {
    setActiveTab(id);
    if (id === "wall") void markSurfaceSeen("school.schoolWall");
  };
  const [magazineIssues, setMagazineIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [selectedIssueMonth, setSelectedIssueMonth] = useState("");
  const [isIssueWorkspaceOpen, setIsIssueWorkspaceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issueBusy, setIssueBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const buildGradeQuery = useCallback((baseParams = {}) => {
    const params = new URLSearchParams(baseParams);
    // The magazine and home lists cover every grade; the School Wall tab
    // has its own grade filter.
    return params.toString();
  }, []);

  const loadArticles = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [approvedRes, publishedRes] = await Promise.all([
        fetch(`/api/school/magazine?${buildGradeQuery({ view: "approved" })}`, {
          cache: "no-store",
        }),
        fetch(`/api/school/magazine?${buildGradeQuery({ view: "magazine" })}`, {
          cache: "no-store",
        }),
      ]);

      const approvedPayload = await approvedRes.json().catch(() => ({}));
      const publishedPayload = await publishedRes.json().catch(() => ({}));

      if (!approvedRes.ok) {
        throw new Error(approvedPayload.message || "Failed to load posted writing");
      }
      if (!publishedRes.ok) {
        throw new Error(publishedPayload.message || "Failed to load published magazine articles");
      }

      setApprovedArticles(
        Array.isArray(approvedPayload.articles) ? approvedPayload.articles : []
      );
      setPublishedArticles(Array.isArray(publishedPayload.articles) ? publishedPayload.articles : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load school magazine");
    } finally {
      setLoading(false);
    }
  }, [buildGradeQuery]);

  const loadMagazineIssues = useCallback(async () => {
    try {
      const res = await fetch("/api/school/magazine-issues", {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to load magazine issues");
      }
      setCurrentIssue(payload.currentIssue || null);
      setMagazineIssues(Array.isArray(payload.issues) ? payload.issues : []);
      setSelectedIssueId((currentSelected) => {
        if (currentSelected) {
          const exists = payload.issues?.some((issue) => issue.id === currentSelected);
          if (exists) return currentSelected;
        }
        return payload.currentIssue?.id || payload.issues?.[0]?.id || "";
      });
    } catch (issueLoadError) {
      setError(
        issueLoadError.message ||
          "Magazine was created, but the issue list could not refresh."
      );
    }
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, publishedRes] = await Promise.all([
        fetch(
          `/api/school/magazine-submissions?${buildGradeQuery({
            status: "POSTED",
            page: "1",
            limit: "1",
          })}`,
          { cache: "no-store" }
        ),
        fetch(`/api/school/magazine?${buildGradeQuery({ view: "approved" })}`, {
          cache: "no-store",
        }),
        fetch(`/api/school/magazine?${buildGradeQuery({ view: "magazine" })}`, {
          cache: "no-store",
        }),
      ]);

      const [pendingPayload, approvedPayload, publishedPayload] =
        await Promise.all([
          pendingRes.json().catch(() => ({})),
          approvedRes.json().catch(() => ({})),
          publishedRes.json().catch(() => ({})),
        ]);

      if (pendingRes.ok) {
        setPendingCount(pendingPayload.pagination?.totalItems || pendingPayload.pagination?.totalSubmissions || 0);
      }
      if (approvedRes.ok) {
        setApprovedArticles(
          Array.isArray(approvedPayload.articles) ? approvedPayload.articles : []
        );
      }
      if (publishedRes.ok) {
        setPublishedArticles(Array.isArray(publishedPayload.articles) ? publishedPayload.articles : []);
      }
      void loadMagazineIssues();
    } catch {
      // Overview metrics are decorative; tab content will surface actionable errors.
    }
  }, [buildGradeQuery, loadMagazineIssues]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Stable identity so the child's load effect isn't re-triggered on every
  // parent re-render (the parent re-renders several times as its own fetches
  // resolve). Only a { refresh: true } report should pull fresh overview data.
  const handleWallStatsChange = useCallback(
    ({ refresh } = {}) => {
      if (refresh) void loadOverview();
    },
    [loadOverview]
  );

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (activeTab !== "wall") {
      loadArticles();
      if (activeTab === "magazine") void loadMagazineIssues();
    } else {
      setLoading(false);
    }
  }, [activeTab, loadArticles, loadMagazineIssues]);

  const handleCreateIssue = async () => {
    try {
      setIssueBusy(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/school/magazine-issues", {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to create magazine");
      }
      setSuccess(payload.message || "Magazine is ready");
      if (payload.issue?.id) {
        setCurrentIssue(payload.issue);
        setMagazineIssues((existingIssues) => {
          const exists = existingIssues.some(
            (issue) => issue.id === payload.issue.id
          );
          return exists
            ? existingIssues.map((issue) =>
                issue.id === payload.issue.id ? payload.issue : issue
              )
            : [payload.issue, ...existingIssues];
        });
        setSelectedIssueId(payload.issue.id);
        // Clear the month filter so the new magazine is in view.
        setSelectedIssueMonth("");
        setIsIssueWorkspaceOpen(true);
      }
      void loadMagazineIssues();
    } catch (issueError) {
      setError(issueError.message || "Failed to create magazine");
    } finally {
      setIssueBusy(false);
    }
  };

  const handlePublishIssue = async (issueId) => {
    try {
      setIssueBusy(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/school/magazine-issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PUBLISH", issueId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to publish magazine");
      }
      setSuccess(payload.message || "Magazine published to students");
      if (payload.issue?.id) {
        setCurrentIssue((current) =>
          current?.id === payload.issue.id ? payload.issue : current
        );
        setMagazineIssues((existingIssues) =>
          existingIssues.map((issue) =>
            issue.id === payload.issue.id ? payload.issue : issue
          )
        );
      }
      await loadMagazineIssues();
    } catch (publishError) {
      setError(publishError.message || "Failed to publish magazine");
    } finally {
      setIssueBusy(false);
    }
  };

  const handleRenameIssue = async (issueId, title) => {
    try {
      setIssueBusy(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/school/magazine-issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RENAME", issueId, title }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to rename magazine");
      setSuccess(payload.message || "Magazine renamed");
      if (payload.issue?.id) {
        setCurrentIssue((current) => (current?.id === payload.issue.id ? payload.issue : current));
        setMagazineIssues((existing) => existing.map((issue) => (issue.id === payload.issue.id ? payload.issue : issue)));
      }
      return true;
    } catch (renameError) {
      setError(renameError.message || "Failed to rename magazine");
      return false;
    } finally {
      setIssueBusy(false);
    }
  };

  const handleDeleteIssue = async (issueId) => {
    if (!window.confirm("Delete this magazine issue?\n\nIt will be removed from the school magazine. The student writings in it are not deleted.")) return;
    try {
      setIssueBusy(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/school/magazine-issues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to delete magazine");
      }

      setSuccess(payload.message || "Magazine deleted");
      setMagazineIssues((existingIssues) =>
        existingIssues.filter((issue) => issue.id !== issueId)
      );
      setCurrentIssue((current) => (current?.id === issueId ? null : current));
      if (selectedIssueId === issueId) {
        setSelectedIssueId("");
        setIsIssueWorkspaceOpen(false);
      }
      await loadArticles();
      await loadMagazineIssues();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete magazine");
    } finally {
      setIssueBusy(false);
    }
  };

  const handleToggleIssueHome = async (issue) => {
    try {
      setIssueBusy(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/school/magazine-issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: issue.showOnHome ? "HIDE_HOME" : "SHOW_HOME",
          issueId: issue.id,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to update home showcase");
      }

      setSuccess(payload.message || "Magazine home visibility updated");
      if (payload.issue?.id) {
        setCurrentIssue((current) =>
          current?.id === payload.issue.id ? payload.issue : current
        );
        setMagazineIssues((existingIssues) =>
          existingIssues.map((item) =>
            item.id === payload.issue.id ? payload.issue : item
          )
        );
      }
      await loadMagazineIssues();
    } catch (toggleError) {
      setError(toggleError.message || "Failed to update home showcase");
    } finally {
      setIssueBusy(false);
    }
  };

  const handleAction = async (articleId, action, options = {}) => {
    if (action === "DELETE") {
      const title = options.title ? `“${options.title}”` : "this writing";
      if (!window.confirm(`Delete ${title}?

It is removed from the magazine, the school wall, the global wall and the student's portfolio.`)) return;
    }
    try {
      setBusyId(articleId);
      setError("");
      setSuccess("");

      if (action === "DELETE") {
        const res = await fetch(`/api/school/magazine/${articleId}`, { method: "DELETE" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || "Failed to delete writing");
        setSuccess(payload.message || "Writing deleted");
        if (readingArticle?.id === articleId) setReadingArticle(null);
        await loadArticles();
        await loadOverview();
        await loadMagazineIssues();
        return;
      }

      const res = await fetch(`/api/school/magazine/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(options.magazineIssueId
            ? { magazineIssueId: options.magazineIssueId }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to update article");
      }

      setSuccess(payload.message || "Writing updated");
      await loadArticles();
      await loadOverview();
      if (action.includes("MAGAZINE")) await loadMagazineIssues();
    } catch (actionError) {
      setError(actionError.message || "Failed to update article");
    } finally {
      setBusyId("");
    }
  };



  return (
    <div className="space-y-4 text-ink">
      <h1 className="font-semibold leading-tight">Student Publishing</h1>

      <section className="card px-2 sm:px-3">
        <div role="tablist" aria-label="Student publishing" className="-mb-px flex overflow-x-auto">
          <MagazineTabButton
            id="wall"
            activeTab={activeTab}
            onClick={handleSelectTab}
            icon={FaInbox}
            label="Free Writing"
            count={pendingCount}
            dot={getIndicator("school.magazine").count > 0}
          />
          <MagazineTabButton
            id="magazine"
            activeTab={activeTab}
            onClick={handleSelectTab}
            icon={FaRegNewspaper}
            label="School Magazine"
            count={magazineIssues.length}
          />
        </div>
      </section>

      <div className="grid gap-5">
        <main className="min-w-0">
          {activeTab === "wall" ? (
            <SchoolMagazineReviewManager
              selectedGrade={activeGrade}
              onGradeChange={setActiveGrade}
              providedGradeOptions={gradeOptions}
              onStatsChange={handleWallStatsChange}
            />
          ) : activeTab === "magazine" ? (
            <PublishingPanel
              mode="magazine"
              loading={loading}
              error={error}
              success={success}
              approvedArticles={approvedArticles}
              publishedArticles={publishedArticles}
              currentIssue={currentIssue}
              magazineIssues={magazineIssues}
              selectedIssueId={selectedIssueId}
              onSelectIssue={setSelectedIssueId}
              selectedIssueMonth={selectedIssueMonth}
              onSelectIssueMonth={setSelectedIssueMonth}
              isIssueWorkspaceOpen={isIssueWorkspaceOpen}
              onOpenIssueWorkspace={() => setIsIssueWorkspaceOpen(true)}
              onCloseIssueWorkspace={() => setIsIssueWorkspaceOpen(false)}
              issueBusy={issueBusy}
              busyId={busyId}
              onCreateIssue={handleCreateIssue}
              onPublishIssue={handlePublishIssue}
              onDeleteIssue={handleDeleteIssue}
              onToggleIssueHome={handleToggleIssueHome}
              onRenameIssue={handleRenameIssue}
              onAction={handleAction}
              onRead={setReadingArticle}
            />
          ) : null}
        </main>

      </div>

      {readingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-control bg-surface p-4 sm:p-5 shadow-pop">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="badge badge-brand uppercase">
                  {getWritingCategoryLabel(readingArticle.category)}
                </span>
                <h3 className="mt-3 font-semibold text-ink">
                  {readingArticle.title}
                </h3>
                <p className="mt-2 text-sm font-semibold text-muted">
                  {readingArticle.authorStudent?.name || "Student"} -{" "}
                  {readingArticle.authorStudent?.grade || "Grade"} - Roll{" "}
                  {readingArticle.authorStudent?.rollNumber || "-"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs font-semibold text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <FaCalendarAlt />
                    Posted <AppDate value={readingArticle.submittedAt || readingArticle.updatedAt} />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FaBookOpen />
                    {getReadMinutes(readingArticle.content)} min read
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!editingArticle && (
                  <button type="button" onClick={() => setEditingArticle(true)} className="btn btn-secondary btn-sm">
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReadingArticle(null)}
                  className="btn-icon btn-ghost flex items-center justify-center"
                  aria-label="Close article"
                >
                  <FaTimes />
                </button>
              </div>
            </div>
            {editingArticle ? (
              <WritingEditForm
                article={readingArticle}
                onCancel={() => setEditingArticle(false)}
                onSaved={(saved, message) => {
                  const merge = (item) => (item.id === readingArticle.id ? { ...item, ...saved, id: item.id } : item);
                  setApprovedArticles((current) => current.map(merge));
                  setPublishedArticles((current) => current.map(merge));
                  setReadingArticleState((current) => (current ? merge(current) : current));
                  setEditingArticle(false);
                  setSuccess(message || "Changes saved");
                }}
              />
            ) : (
            <>
            <WritingCover
              coverImage={readingArticle.coverImage}
              images={readingArticle.images}
              title={readingArticle.title}
              className="mt-5 border border-line"
              imageClassName="h-auto max-h-[26rem] w-full object-contain"
              showCaption
            />
            <WritingTags tags={readingArticle.tags} className="mt-4" />
            <WritingContent
              content={readingArticle.content}
              className="mt-5 rounded-control border border-line bg-surface p-4 text-sm font-semibold leading-7 text-ink"
            />
            <WritingGallery
              images={readingArticle.images}
              coverImage={readingArticle.coverImage}
              title={readingArticle.title}
              className="mt-5"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
              <span>{wordCount(readingArticle.content)} words</span>
              <StatusPill article={readingArticle} />
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PublishingPanel({
  mode,
  loading,
  error,
  success,
  approvedArticles,
  publishedArticles,
  currentIssue,
  magazineIssues,
  selectedIssueId,
  onSelectIssue,
  selectedIssueMonth,
  onSelectIssueMonth,
  isIssueWorkspaceOpen,
  onOpenIssueWorkspace,
  onCloseIssueWorkspace,
  issueBusy,
  busyId,
  onCreateIssue,
  onPublishIssue,
  onDeleteIssue,
  onToggleIssueHome,
  onRenameIssue = async () => false,
  onAction,
  onRead,
}) {
  const panelConfig = {
    magazine: {
      title: "School Magazine",
      eyebrow: "School Magazine",
      helper:
        "Create a monthly magazine issue, then choose from the writing students sent to the magazine.",
      loadingTitle: "Loading magazine writing",
      loadingMessage: "Preparing student writing for the magazine issue.",
      emptyTitle: "No writing ready for magazine",
      emptyDescription:
        "Writing appears here when a student chooses Send to: School magazine.",
      currentLabel: "In Latest Magazine",
      count: publishedArticles.length,
      icon: FaRegNewspaper,
    },
    home: {
      title: "Show To Home",
      eyebrow: "Public Homepage Selection",
      helper:
        "Writing stays hidden from public by default. Read first, choose the best pieces, then show them on the Praavyo home page.",
      loadingTitle: "Loading public choices",
      loadingMessage: "Preparing student writing for public homepage selection.",
      emptyTitle: "No writing ready for public home",
      emptyDescription:
        "Student writing will appear here after students post it to school. It remains hidden from public until you show it.",
      currentLabel: "Shown Publicly",
      count: publishedArticles.length,
      icon: FaHome,
    },
  }[mode];
  const Icon = panelConfig.icon;
  const allMagazineIssues = useMemo(() => {
    if (mode !== "magazine") return [];
    const issueMap = new Map();
    if (currentIssue?.id) issueMap.set(currentIssue.id, currentIssue);
    magazineIssues.forEach((issue) => {
      if (issue?.id) issueMap.set(issue.id, issue);
    });
    return Array.from(issueMap.values()).sort(
      (a, b) =>
        new Date(b.weekStart || b.publishedAt || 0) -
        new Date(a.weekStart || a.publishedAt || 0)
    );
  }, [currentIssue, magazineIssues, mode]);
  const selectedIssue =
    mode === "magazine"
      ? allMagazineIssues.find((issue) => issue.id === selectedIssueId) ||
        currentIssue ||
        allMagazineIssues[0] ||
        null
      : null;
  const [issueYear, setIssueYear] = useRememberedState("magazine:issue-year", "");
  const [issueStatus, setIssueStatus] = useRememberedState("magazine:issue-status", "");
  const issueYears = useMemo(() => {
    const map = new Map();
    allMagazineIssues.forEach((issue) => {
      const facts = issueFacts(issue);
      map.set(facts.yearKey, facts.yearLabel);
    });
    return [...map.entries()].sort((x, y) => Number(y[0]) - Number(x[0]));
  }, [allMagazineIssues]);
  const issuesInYear = allMagazineIssues.filter((issue) => !issueYear || issueFacts(issue).yearKey === issueYear);
  const issueMonths = useMemo(() => {
    const map = new Map();
    issuesInYear.forEach((issue) => {
      const facts = issueFacts(issue);
      if (!map.has(facts.monthKey)) map.set(facts.monthKey, { key: facts.monthKey, label: facts.monthLabel });
    });
    return [...map.values()];
  }, [issuesInYear]);
  const activeMonth = issueMonths.some((month) => month.key === selectedIssueMonth) ? selectedIssueMonth : "";
  const visibleMagazineIssues = issuesInYear.filter(
    (issue) =>
      (!activeMonth || issueFacts(issue).monthKey === activeMonth) &&
      (!issueStatus || issue.status === issueStatus)
  );
  const issueFiltersOn = Boolean(issueYear || activeMonth || issueStatus);
  const selectedMagazineArticles =
    mode === "magazine"
      ? approvedArticles.filter(
          (article) => article.isMagazinePublished && isInIssue(article, selectedIssue)
        )
      : publishedArticles;
  const availableMagazineArticles =
    mode === "magazine"
      ? selectedIssue
        ? approvedArticles.filter(
            (article) =>
              !article.isMagazinePublished &&
              !article.magazineIssue &&
              isSentToMagazine(article) &&
              // written for this magazine (older pieces, sent before
              // students picked a magazine, still show while fresh)
              (article.requestedIssue
                ? article.requestedIssue === selectedIssue.id
                : isFreshForMagazine(article))
          )
        : []
      : approvedArticles;
  const activeCount =
    mode === "magazine" ? selectedMagazineArticles.length : panelConfig.count;

  return (
    <div className="space-y-4">
      {error && <AlertBanner type="error" title="Could not load writing" message={error} />}
      {success && <AlertBanner type="success" title="Writing updated" message={success} />}

      {loading ? (
        <LoadingState
          title={panelConfig.loadingTitle}
          message={panelConfig.loadingMessage}
        />
      ) : (
        <>
          {mode === "magazine" && isIssueWorkspaceOpen && selectedIssue && (
            // One line: back · name (rename) · status · date and count · the one action.
            <section className="card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <button type="button" onClick={onCloseIssueWorkspace}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
                    <FaArrowLeft aria-hidden /> Magazines
                  </button>
                  <span aria-hidden className="text-line-strong">/</span>
                  <IssueTitle
                    key={selectedIssue.id + selectedIssue.title}
                    issue={selectedIssue}
                    busy={issueBusy}
                    onRename={(title) => onRenameIssue(selectedIssue.id, title)}
                  />
                  <span className={`badge text-xs ${selectedIssue.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
                    {selectedIssue.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                  <span className="text-sm text-muted">
                    <AppDate value={selectedIssue.publishedAt || selectedIssue.weekStart} /> ·{" "}
                    {selectedMagazineArticles.length} writing{selectedMagazineArticles.length === 1 ? "" : "s"}
                  </span>
                </div>
                {selectedIssue.status !== "PUBLISHED" && (
                  <button
                    type="button"
                    onClick={() => onPublishIssue(selectedIssue.id)}
                    disabled={issueBusy || selectedMagazineArticles.length === 0}
                    title={selectedMagazineArticles.length === 0 ? "Add writing first" : ""}
                    className="btn btn-primary inline-flex items-center justify-center gap-2"
                  >
                    <FaCheckCircle aria-hidden /> Publish to students
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                {selectedIssue.status === "PUBLISHED"
                  ? "Published. Students read it in the magazine section, and it is closed for new writing."
                  : "Open for writing. Students can choose this magazine when they write; switch on the writing you want, then publish."}
              </p>
            </section>
          )}

          {mode === "magazine" && !isIssueWorkspaceOpen && (
            <section className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-brand-strong">
                    Created Magazines
                  </p>
                  <h3 className="mt-2 font-semibold text-ink">
                    {allMagazineIssues.length
                      ? `${visibleMagazineIssues.length} of ${allMagazineIssues.length} magazine${allMagazineIssues.length === 1 ? "" : "s"}`
                      : "Open a magazine to manage its writing"}
                  </h3>
                  {issueFiltersOn && (
                    <button type="button" className="mt-1 text-xs font-semibold text-brand hover:underline"
                      onClick={() => { setIssueYear(""); setIssueStatus(""); onSelectIssueMonth(""); }}>
                      Clear filters
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
                  {allMagazineIssues.length > 0 && (
                    <>
                      <label className="block min-w-0 sm:w-40">
                        <span className="text-2xs font-semibold uppercase text-muted">Academic year</span>
                        <select value={issueYear} onChange={(event) => { setIssueYear(event.target.value); onSelectIssueMonth(""); }}
                          className="input mt-2 w-full">
                          <option value="">All years</option>
                          {issueYears.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                      </label>
                      <label className="block min-w-0 sm:w-44">
                        <span className="text-2xs font-semibold uppercase text-muted">Month</span>
                        <select value={activeMonth} onChange={(event) => onSelectIssueMonth(event.target.value)}
                          className="input mt-2 w-full">
                          <option value="">All months</option>
                          {issueMonths.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}
                        </select>
                      </label>
                      <label className="block min-w-0 sm:w-36">
                        <span className="text-2xs font-semibold uppercase text-muted">Status</span>
                        <select value={issueStatus} onChange={(event) => setIssueStatus(event.target.value)}
                          className="input mt-2 w-full">
                          <option value="">All</option>
                          <option value="DRAFT">Draft (open for writing)</option>
                          <option value="PUBLISHED">Published</option>
                        </select>
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onCreateIssue}
                    disabled={issueBusy}
                    className="btn btn-primary inline-flex items-center justify-center gap-2 self-end"
                  >
                    <FaPlus />
                    {issueBusy ? "Creating..." : "Create Magazine"}
                  </button>
                </div>
              </div>

              {allMagazineIssues.length === 0 ? (
                <p className="mt-4 rounded-control border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
                  No magazines yet. Create the first magazine to begin.
                </p>
              ) : visibleMagazineIssues.length === 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
                  No magazines match these filters.
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setIssueYear(""); setIssueStatus(""); onSelectIssueMonth(""); }}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <IssueTable
                  issues={visibleMagazineIssues}
                  selectedId={selectedIssue?.id}
                  busy={issueBusy}
                  onOpen={(issue) => {
                    onSelectIssue(issue.id);
                    onOpenIssueWorkspace();
                  }}
                  onPublish={(issue) => onPublishIssue(issue.id)}
                  onToggleHome={onToggleIssueHome}
                  onDelete={(issue) => onDeleteIssue(issue.id)}
                />
              )}
            </section>
          )}

          {mode !== "magazine" && (
          <section className="card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wide text-brand-strong">
                  {panelConfig.eyebrow}
                </p>
                <h2 className="mt-2 flex items-center gap-2 font-semibold text-ink">
                  <Icon className="text-brand-strong" />
                  {panelConfig.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">
                  {panelConfig.helper}
                </p>
              </div>
              <div className="rounded-control border border-brand-line bg-brand-soft px-4 py-3 text-right">
                <div className="text-2xl font-semibold text-ink">
                  {activeCount}
                </div>
                <div className="mt-1 text-2xs font-semibold uppercase text-brand-strong">
                  {panelConfig.currentLabel}
                </div>
              </div>
            </div>
          </section>
          )}

          {mode === "magazine" && isIssueWorkspaceOpen && selectedIssue && selectedMagazineArticles.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-semibold text-ink">
                Inside {selectedIssue?.title || "Magazine"} ({selectedMagazineArticles.length})
              </h3>
              <WritingTable
                articles={selectedMagazineArticles}
                busyId={busyId}
                mode={mode}
                onRead={onRead}
                onAction={(article, action) =>
                  onAction(article.id, action, {
                    magazineIssueId: selectedIssue?.id,
                    title: article.title,
                  })
                }
                emptyState={null}
              />
            </section>
          )}

          {(mode !== "magazine" || (isIssueWorkspaceOpen && selectedIssue)) && (
          <section className="space-y-3">
            <h3 className="font-semibold text-ink">
              {mode === "magazine" ? "Sent to this magazine" : "Available School Wall Writing"} ({availableMagazineArticles.length})
            </h3>
            {availableMagazineArticles.length === 0 ? (
              <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
                {mode === "magazine" && !selectedIssue
                  ? "Create or open a magazine to add writing."
                  : mode === "magazine"
                    ? selectedIssue?.status === "PUBLISHED"
                      ? "This magazine is published, so students can no longer send writing to it."
                      : "No writing has been sent to this magazine yet. Students choose “Send to: School magazine” and then this magazine when they write."
                    : "No fresh unused writing is available right now."}
              </p>
            ) : (
              <WritingTable
                articles={availableMagazineArticles}
                busyId={busyId}
                mode={mode}
                onRead={onRead}
                onAction={(article, action) =>
                  onAction(article.id, action, {
                    magazineIssueId: selectedIssue?.id,
                    title: article.title,
                  })
                }
                emptyState={null}
              />
            )}
          </section>
          )}
        </>
      )}
    </div>
  );
}

/** The open magazine's name, with an inline rename. */
function IssueTitle({ issue, busy, onRename }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(issue.title || "");
  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onRename(title)) setEditing(false);
        }}
      >
        <input className="input max-w-md flex-1" value={title} autoFocus maxLength={120}
          onChange={(event) => setTitle(event.target.value)} aria-label="Magazine name" required />
        <button type="submit" disabled={busy || !title.trim()} className="btn btn-primary btn-sm">Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTitle(issue.title || ""); setEditing(false); }}>Cancel</button>
      </form>
    );
  }
  return (
    <h2 className="inline-flex items-center gap-1.5 text-lg font-bold text-ink">
      {issue.title}
      <button type="button" onClick={() => setEditing(true)} aria-label="Rename magazine" title="Rename"
        className="grid h-7 w-7 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-brand">
        <FaEdit aria-hidden size={15} />
      </button>
    </h2>
  );
}

/**
 * The school's magazine issues as a table: name, date, writings, status,
 * home-page visibility and the actions. Clicking a row opens the issue to
 * manage its writing. On phones the same rows stack.
 */
function IssueTable({ issues, selectedId, busy, onOpen, onPublish, onToggleHome, onDelete }) {
  const stop = (fn) => (event) => {
    event.stopPropagation();
    fn();
  };

  const status = (issue) => (
    <span className={`badge whitespace-nowrap text-xs ${issue.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
      {issue.status === "PUBLISHED" ? "Published" : "Draft"}
    </span>
  );

  const actions = (issue) => (
    <div className="flex flex-wrap justify-end gap-2">
      {issue.status !== "PUBLISHED" && (
        <button type="button" onClick={stop(() => onPublish(issue))} disabled={busy || (issue.articleCount || 0) === 0}
          title={(issue.articleCount || 0) === 0 ? "Add writing first" : ""} className="btn btn-primary btn-sm whitespace-nowrap">
          Publish
        </button>
      )}
      <button type="button" onClick={stop(() => onDelete(issue))} disabled={busy} className="btn btn-soft-danger btn-sm whitespace-nowrap">
        Delete
      </button>
    </div>
  );

  const homeSwitch = (issue) => (
    <PlacementSwitch
      on={Boolean(issue.showOnHome)}
      busy={busy}
      disabled={issue.status !== "PUBLISHED"}
      title={issue.status !== "PUBLISHED" ? "Publish the magazine first" : ""}
      label={`Home page: ${issue.title}`}
      onToggle={() => onToggleHome(issue)}
    />
  );

  return (
    <div className="mt-4 overflow-hidden rounded-card border border-line">
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-4 py-3">Magazine</th>
            <th scope="col" className="px-4 py-3">Date</th>
            <th scope="col" className="px-4 py-3 text-center">Writings</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Home page</th>
            <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {issues.map((issue) => (
            <tr key={issue.id} onClick={() => onOpen(issue)}
              className={`cursor-pointer transition-colors ${selectedId === issue.id ? "bg-brand-soft" : "hover:bg-surface-2"}`}>
              <td className="px-4 py-3 font-semibold text-ink">{issue.title}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted"><AppDate value={issue.publishedAt || issue.weekStart} /></td>
              <td className="px-4 py-3 text-center font-semibold tabular-nums text-ink">{issue.articleCount || 0}</td>
              <td className="px-4 py-3">{status(issue)}</td>
              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{homeSwitch(issue)}</td>
              <td className="px-4 py-3">{actions(issue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {issues.map((issue) => (
          <li key={issue.id} className={selectedId === issue.id ? "bg-brand-soft" : ""}>
            <button type="button" onClick={() => onOpen(issue)} className="block w-full px-4 pt-3 text-left">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-semibold text-ink">{issue.title}</span>
                {status(issue)}
              </span>
              <span className="mt-1 block text-xs text-muted">
                <AppDate value={issue.publishedAt || issue.weekStart} /> · {issue.articleCount || 0} writings
              </span>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-2">
              <span className="inline-flex items-center gap-2 text-xs text-muted">Home page {homeSwitch(issue)}</span>
              {actions(issue)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
