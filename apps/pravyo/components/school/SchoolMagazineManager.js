"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { BookOpen as FaBookOpen, CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Eye as FaEye, FileText as FaFileAlt, House as FaHome, Inbox as FaInbox, Plus as FaPlus, Newspaper as FaRegNewspaper, X as FaTimes } from "lucide-react";
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

function getReadMinutes(content) {
  return Math.max(1, Math.ceil(wordCount(content) / 180));
}

function formatIssueMonth(issue) {
  const date = new Date(issue.weekStart || issue.publishedAt || issue.createdAt || new Date());
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
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
  helper,
  count = 0,
  tone = "neutral",
  dot = false,
}) {
  const isActive = activeTab === id;
  // On the brand-coloured active tab the count is a white pill with brand text;
  // white-on-white made the number invisible.
  const pillClass = isActive
    ? "bg-white text-brand-strong"
    : tone === "attention"
    ? "bg-warning-soft text-warning"
    : "bg-brand-soft text-brand-strong";
  // The red "new activity here" dot stays visible (even on the active tab)
  // until the tab is clicked, which marks its content seen.
  const showDot = dot;

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-pressed={isActive}
      // Card-style tab, not `.btn`: the button height clipped the two-line
      // label, and `.btn-secondary:hover` turned the active tab's background
      // grey under white text.
      className={`flex min-h-14 w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        isActive
          ? "border-brand bg-brand text-white shadow-sm"
          : "border-line bg-surface text-brand-strong hover:border-brand-line hover:bg-brand-soft/40"
      }`}
    >
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${
          isActive
            ? "border-white/30 bg-white/15 text-white"
            : "border-brand-line bg-brand-soft text-brand-strong"
        }`}
      >
        <Icon />
        {showDot && (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-danger" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span
          className={`mt-0.5 block text-2xs font-semibold ${
            isActive ? "text-white" : "text-muted"
          }`}
        >
          {helper}
        </span>
      </span>
      {count > 0 && (
        <span
          className={`ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-2xs font-semibold ${pillClass}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function MetricCard({ label, value, icon: Icon, tone }) {
  return (
    <div className={`card px-4 py-4 ${tone}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface">
          <Icon />
        </span>
        <strong className="text-2xl font-semibold text-ink">{value}</strong>
      </div>
      <div className="mt-2 text-2xs font-semibold text-muted">{label}</div>
    </div>
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

function ModeStatusPill({ article, mode }) {
  if (mode === "magazine") {
    if (article.isMagazinePublished) {
      return (
        <span className="badge badge-success w-fit uppercase">
          Shown
        </span>
      );
    }
    if (article.magazineIssue && !article.isMagazinePublished) {
      return (
        <span className="badge badge-warning w-fit uppercase">
          Used: {getIssueLabel(article)}
        </span>
      );
    }
    return (
      <span className="badge badge-neutral w-fit uppercase">
        Hidden
      </span>
    );
  }

  return article.isPublished ? (
    <span className="badge badge-brand w-fit uppercase">
      Shown Public
    </span>
  ) : (
    <span className="badge badge-neutral w-fit uppercase">
      Hidden Public
    </span>
  );
}

function WritingTable({ articles, busyId, emptyState, mode, onRead, onAction }) {
  if (articles.length === 0) return emptyState;

  const modeConfig = {
    magazine: {
      actionLabel: (article) =>
        article.isMagazinePublished
          ? "Hide"
          : article.magazineIssue
          ? "Used"
          : "Add",
      action: (article) =>
        article.isMagazinePublished ? "UNPUBLISH_MAGAZINE" : "PUBLISH_MAGAZINE",
      locked: (article) =>
        Boolean(article.magazineIssue) && !article.isMagazinePublished,
      title: (article) =>
        article.magazineIssue && !article.isMagazinePublished
          ? `Already used in ${getIssueLabel(article)}`
          : undefined,
      className:
        "bg-brand text-white hover:bg-brand-strong",
    },
    home: {
      actionLabel: (article) => (article.isPublished ? "Hide" : "Show"),
      action: (article) =>
        article.isPublished ? "UNPUBLISH_HOMEPAGE" : "PUBLISH_HOMEPAGE",
      locked: () => false,
      title: () => undefined,
      className: "bg-brand text-white hover:bg-brand-strong",
    },
  }[mode];

  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[920px] grid-cols-[minmax(230px,1.45fr)_140px_90px_125px_190px_170px] gap-3 border-b border-line bg-surface px-4 py-3 text-2xs font-semibold uppercase text-muted">
        <span>Writing</span>
        <span>Student</span>
        <span>Grade</span>
        <span>Type</span>
        <span>Status</span>
        <span className="text-right">Action</span>
      </div>
      <div>
        {articles.map((article) => {
          const locked = modeConfig.locked(article);

          return (
            <div
              key={article.id}
              className="grid min-w-[920px] grid-cols-[minmax(230px,1.45fr)_140px_90px_125px_190px_170px] gap-3 border-b border-line px-4 py-4 text-sm last:border-b-0"
            >
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{article.title}</p>
              <p className="mt-1 text-2xs font-semibold text-muted">
                Posted <AppDate value={article.submittedAt || article.updatedAt} mode="dateTime" />
              </p>
            </div>
            <span className="truncate font-semibold text-ink">
              {article.authorStudent?.name || "Student"}
            </span>
            <span className="font-semibold text-muted">
              {article.authorStudent?.grade || "Grade"}
            </span>
            <span className="font-semibold text-muted">
              {getWritingCategoryLabel(article.category)}
            </span>
            <ModeStatusPill article={article} mode={mode} />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => onRead(article)}
                className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
              >
                <FaEye />
                Read
              </button>
              <button
                type="button"
                onClick={() => onAction(article, modeConfig.action(article))}
                disabled={busyId === article.id || locked}
                title={modeConfig.title(article)}
                className={`btn btn-ghost inline-flex min-w-20 items-center justify-center transition-colors ${modeConfig.className}`}
              >
                {busyId === article.id ? "Updating..." : modeConfig.actionLabel(article)}
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SchoolMagazineManager() {
  const { getIndicator, markSurfaceSeen } = useWorkIndicators();
  // Remembered until the page is refreshed.
  const [activeTab, setActiveTab] = useRememberedState("magazine:tab", "wall");
  const [activeGrade, setActiveGrade] = useRememberedState("magazine:grade", "ALL");
  const [gradeOptions, setGradeOptions] = useState([]);
  const [readingArticle, setReadingArticle] = useState(null);
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
    if (activeGrade !== "ALL") params.set("grade", activeGrade);
    return params.toString();
  }, [activeGrade]);

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
      setSelectedIssueMonth((currentMonth) => {
        if (currentMonth) return currentMonth;
        const firstIssue = payload.currentIssue || payload.issues?.[0];
        return firstIssue ? `${firstIssue.year}-${firstIssue.month}` : "";
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
        setSelectedIssueMonth(`${payload.issue.year}-${payload.issue.month}`);
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
    try {
      setBusyId(articleId);
      setError("");
      setSuccess("");

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

  const shownPublicly = approvedArticles.filter((article) => article.isPublished).length;

  const metrics = [
    ["School Wall Posts", pendingCount, FaFileAlt, "border-brand-line bg-brand-soft text-brand-strong"],
    ["Fresh For Magazine", approvedArticles.filter((article) => !article.magazineIssue && isFreshForMagazine(article)).length, FaCheckCircle, "border-success-line bg-success-soft text-success"],
    ["Created Magazines", magazineIssues.length, FaCalendarAlt, "border-warning-line bg-warning-soft text-warning"],
    ["In Magazines", publishedArticles.length, FaBookOpen, "border-brand-line bg-brand-soft text-brand-strong"],
  ];

  return (
    <div className="space-y-4 text-ink">
      <section className="card p-4">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xl text-brand-strong">
              <FaBookOpen />
            </span>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-brand-strong">
                Student Publishing
              </p>
              <h1 className="mt-2 font-semibold leading-tight">Student Publishing</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">
                School Wall, School Magazine, and Show To Home are separate
                publishing decisions.
              </p>
              <p className="mt-3 max-w-2xl rounded-control border border-brand-line bg-brand-soft px-4 py-3 text-xs font-semibold leading-5 text-brand-strong">
                Students post freely to the school wall. Your school chooses
                what stays visible on the school wall, what becomes a school
                magazine piece, and what appears on the public home page.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(([label, value, Icon, tone]) => (
              <MetricCard key={label} label={label} value={value} icon={Icon} tone={tone} />
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <div className="grid gap-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-center">
          <MagazineTabButton
            id="wall"
            activeTab={activeTab}
            onClick={handleSelectTab}
            icon={FaInbox}
            label="School Wall"
            helper="Student posts"
            count={pendingCount}
            dot={getIndicator("school.magazine").count > 0}
          />
          <MagazineTabButton
            id="magazine"
            activeTab={activeTab}
            onClick={handleSelectTab}
            icon={FaRegNewspaper}
            label="School Magazine"
            helper="Created magazines"
            count={magazineIssues.length}
          />
          <MagazineTabButton
            id="home"
            activeTab={activeTab}
            onClick={handleSelectTab}
            icon={FaHome}
            label="Show To Home"
            helper="Shown publicly"
            count={shownPublicly}
          />
          <label className="flex items-center gap-2 text-sm font-semibold text-muted">
            Grade
            <select
              value={activeGrade}
              onChange={(event) => setActiveGrade(event.target.value)}
              className="input min-w-32"
            >
              <option value="ALL">All</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
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
              onAction={handleAction}
              onRead={setReadingArticle}
            />
          ) : activeTab === "home" ? (
            <PublishingPanel
              mode="home"
              loading={loading}
              error={error}
              success={success}
              approvedArticles={approvedArticles}
              publishedArticles={approvedArticles.filter((article) => article.isPublished)}
              currentIssue={null}
              magazineIssues={[]}
              selectedIssueId=""
              onSelectIssue={() => {}}
              selectedIssueMonth=""
              onSelectIssueMonth={() => {}}
              isIssueWorkspaceOpen={false}
              onOpenIssueWorkspace={() => {}}
              onCloseIssueWorkspace={() => {}}
              issueBusy={false}
              busyId={busyId}
              onCreateIssue={() => {}}
              onPublishIssue={() => {}}
              onDeleteIssue={() => {}}
              onToggleIssueHome={() => {}}
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
              <button
                type="button"
                onClick={() => setReadingArticle(null)}
                className="btn-icon btn-ghost flex items-center justify-center"
                aria-label="Close article"
              >
                <FaTimes />
              </button>
            </div>
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
  onAction,
  onRead,
}) {
  const panelConfig = {
    magazine: {
      title: "School Magazine",
      eyebrow: "School Magazine",
      helper:
        "Create a monthly magazine issue, then select the best unused student writing for it.",
      loadingTitle: "Loading magazine writing",
      loadingMessage: "Preparing student writing for the magazine issue.",
      emptyTitle: "No writing ready for magazine",
      emptyDescription:
        "Student writing will appear here after students post it to school.",
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
  const issueMonths = useMemo(() => {
    const monthMap = new Map();
    allMagazineIssues.forEach((issue) => {
      const key = `${issue.year}-${issue.month}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          label: formatIssueMonth(issue),
        });
      }
    });
    return Array.from(monthMap.values());
  }, [allMagazineIssues]);
  const filteredMagazineIssues =
    mode === "magazine" && selectedIssueMonth
      ? allMagazineIssues.filter(
          (issue) => `${issue.year}-${issue.month}` === selectedIssueMonth
        )
      : allMagazineIssues;
  const visibleMagazineIssues =
    filteredMagazineIssues.length > 0
      ? filteredMagazineIssues
      : allMagazineIssues;
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
              isFreshForMagazine(article)
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
            <section className="card p-4">
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-success">
                    Open Magazine
                  </p>
                  <h2 className="mt-2 flex items-center gap-2 font-semibold text-ink">
                    <FaRegNewspaper className="text-success" />
                    {selectedIssue.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-success">
                      <FaCalendarAlt />
                      <AppDate value={selectedIssue.publishedAt || selectedIssue.weekStart} />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-brand-strong">
                      <FaBookOpen />
                      {selectedMagazineArticles.length} selected
                    </span>
                    <span className={`inline-flex rounded-full px-3 py-1 ${
                      selectedIssue.status === "PUBLISHED"
                        ? "bg-success-soft text-success"
                        : "bg-warning-soft text-warning"
                    }`}>
                      {selectedIssue.status === "PUBLISHED" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted">
                    Manage the writing inside this magazine. Add fresh student
                    writing, remove mistakes, then publish to students when ready.
                  </p>
                </div>
                <div className="flex flex-col justify-between gap-3 rounded-control border border-success-line bg-success-soft p-4">
                  <div>
                    <div className="text-2xl font-semibold text-ink">
                      {selectedMagazineArticles.length}
                    </div>
                    <div className="mt-1 text-2xs font-semibold uppercase text-success">
                      In Open Magazine
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onCloseIssueWorkspace}
                    className="btn btn-secondary inline-flex items-center justify-center"
                  >
                    Back to Magazines
                  </button>
                  {selectedIssue && selectedIssue.status !== "PUBLISHED" && (
                    <button
                      type="button"
                      onClick={() => onPublishIssue(selectedIssue.id)}
                      disabled={issueBusy || selectedMagazineArticles.length === 0}
                      className="btn btn-primary inline-flex items-center justify-center gap-2"
                    >
                      <FaCheckCircle />
                      Publish to Students
                    </button>
                  )}
                </div>
              </div>
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
                    Open a magazine to manage its writing
                  </h3>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  {issueMonths.length > 0 && (
                    <label className="block min-w-0 sm:w-64">
                      <span className="text-2xs font-semibold uppercase text-muted">
                        Filter by month
                      </span>
                      <select
                        value={selectedIssueMonth}
                        onChange={(event) => {
                          const nextMonth = event.target.value;
                          onSelectIssueMonth(nextMonth);
                          const nextIssue = allMagazineIssues.find(
                            (issue) => `${issue.year}-${issue.month}` === nextMonth
                          );
                          if (nextIssue) onSelectIssue(nextIssue.id);
                        }}
                        className="input mt-2 w-full"
                      >
                        {issueMonths.map((month) => (
                          <option key={month.key} value={month.key}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={onCreateIssue}
                    disabled={issueBusy}
                    className="btn btn-primary inline-flex items-center justify-center gap-2"
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
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleMagazineIssues.map((issue) => {
                    const isSelected = selectedIssue?.id === issue.id;
                    const openIssue = () => {
                      onSelectIssue(issue.id);
                      onOpenIssueWorkspace();
                    };

                    return (
                    <article
                      key={issue.id}
                      role="button"
                      tabIndex={0}
                      onClick={openIssue}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openIssue();
                        }
                      }}
                      className={`card p-4 text-left text-ink transition-colors cursor-pointer ${
                        isSelected
                          ? "border-brand bg-brand-soft"
                          : "border-line bg-surface hover:border-brand-line"
                      }`}
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold">{issue.title}</div>
                      <span
                        className={`badge badge-neutral uppercase ${
                          issue.status === "PUBLISHED"
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                        }`}
                      >
                        {issue.status === "PUBLISHED" ? "Published" : "Draft"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-muted">
                      <AppDate value={issue.publishedAt || issue.weekStart} />
                    </div>
                    <div className="badge badge-neutral mt-3 inline-flex uppercase">
                      {issue.articleCount || 0} writings
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {issue.status !== "PUBLISHED" && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onPublishIssue(issue.id);
                          }}
                          disabled={issueBusy || (issue.articleCount || 0) === 0}
                          className="btn btn-primary btn-sm inline-flex items-center justify-center"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleIssueHome(issue);
                        }}
                        disabled={issueBusy || issue.status !== "PUBLISHED"}
                        className={`btn btn-ghost btn-sm inline-flex items-center justify-center ${
                          issue.showOnHome
                            ? "bg-brand-soft text-brand-strong hover:bg-brand-soft"
                            : "bg-brand-soft text-brand-strong hover:bg-brand-soft"
                        }`}
                      >
                        {issue.showOnHome ? "Hide from Home" : "Show to Home"}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteIssue(issue.id);
                        }}
                        disabled={issueBusy}
                        className="btn btn-soft-danger btn-sm inline-flex items-center justify-center"
                      >
                        Delete
                      </button>
                    </div>
                    </article>
                  )})}
                </div>
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
                  })
                }
                emptyState={null}
              />
            </section>
          )}

          {(mode !== "magazine" || (isIssueWorkspaceOpen && selectedIssue)) && (
          <section className="space-y-3">
            <h3 className="font-semibold text-ink">
              Available School Wall Writing ({availableMagazineArticles.length})
            </h3>
            {availableMagazineArticles.length === 0 ? (
              <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm font-semibold text-muted">
                {mode === "magazine" && !selectedIssue
                  ? "Create or open a magazine to add writing."
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
