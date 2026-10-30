"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft as FaArrowLeft, BookOpen as FaBookOpen, Feather as FaFeatherAlt } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import MagazineArticleCard, {
  formatMagazineDate,
  getCategoryMeta,
} from "@/components/student/MagazineArticleCard";

function IssueCoverArt({ issue, articles }) {
  return (
    <div className="card surface-brand relative min-h-[420px] overflow-hidden p-4 sm:p-5 text-white shadow-pop">
      <div className="absolute left-8 top-8 h-36 w-24 rounded-control bg-surface shadow-pop" />
      <div className="absolute left-28 top-20 h-36 w-24 rounded-control bg-surface shadow-pop" />
      <div className="absolute bottom-20 right-10 h-1.5 w-52 rotate-[-16deg] rounded-full bg-surface" />
      <div className="absolute bottom-28 right-16 h-1.5 w-36 rotate-[-16deg] rounded-full bg-surface" />
      <FaBookOpen className="absolute right-8 top-8 text-2xl text-white" />
      <FaFeatherAlt className="absolute bottom-8 left-10 text-2xl text-white" />

      <div className="relative flex min-h-[360px] flex-col justify-end">
        <p className="text-xs font-semibold uppercase tracking-wide text-white">
          Praavyo School Magazine
        </p>
        <h1 className="mt-4 max-w-xl text-2xl font-semibold leading-tight md:text-2xl">
          {issue.title}
        </h1>
        <p className="mt-4 max-w-lg text-sm font-semibold leading-6 text-white">
          A curated school magazine with {articles.length} selected student{" "}
          {articles.length === 1 ? "writing" : "writings"}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-surface px-3 py-1.5 text-ink">
            {articles.length} {articles.length === 1 ? "writing" : "writings"}
          </span>
          <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-white">
            {formatMagazineDate(issue.publishedAt || issue.weekStart)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function StudentMagazineIssueReader({
  issueId,
  apiBasePath = "/api/student/magazine-issues",
  backHref = "/student/magazine",
  backHrefPattern = "",
  backLabel = "Back to magazines",
  articleHrefPrefix = "/student/magazine/",
}) {
  const [issue, setIssue] = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${apiBasePath}/${issueId}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.message || "Failed to load magazine");
      }

      setIssue(payload.issue || null);
      setArticles(Array.isArray(payload.articles) ? payload.articles : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load magazine");
    } finally {
      setLoading(false);
    }
  }, [apiBasePath, issueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryCounts = useMemo(() => {
    const counts = new Map();
    articles.forEach((article) => {
      const meta = getCategoryMeta(article.category);
      counts.set(meta.label, (counts.get(meta.label) || 0) + 1);
    });
    return Array.from(counts.entries());
  }, [articles]);

  if (loading) {
    return (
      <LoadingState
        title="Opening magazine"
        message="Preparing this issue and its selected student writing."
      />
    );
  }

  if (error || !issue) {
    return (
      <AlertBanner
        type="error"
        title="Unable to open magazine"
        message={error || "Magazine not found."}
      />
    );
  }

  const resolvedBackHref =
    backHrefPattern && issue?.schoolId
      ? backHrefPattern.replace("{schoolId}", issue.schoolId)
      : backHref;

  return (
    <div className="space-y-4 text-ink">
      <Link
        href={resolvedBackHref}
        className="btn btn-secondary inline-flex w-fit items-center gap-2 transition-colors"
      >
        <FaArrowLeft />
        {backLabel}
      </Link>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <IssueCoverArt issue={issue} articles={articles} />

        <aside className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">
            Issue Contents
          </p>
          <h2 className="mt-2 font-semibold text-ink">
            {articles.length} selected {articles.length === 1 ? "piece" : "pieces"}
          </h2>
          <div className="mt-5 space-y-3">
            {articles.map((article, index) => (
              <Link
                key={article.id}
                href={`${articleHrefPrefix}${article.id}`}
                className="card transition-colors hover:border-brand-line hover:bg-surface-2 flex w-full gap-3 p-3 text-left transition-colors hover:border-brand-line hover:bg-surface"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-ink">
                    {article.title}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    {article.authorStudent?.name || "Student"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      {categoryCounts.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {categoryCounts.map(([label, count]) => (
            <span
              key={label}
              className="badge badge-neutral text-xs"
            >
              {label}: {count}
            </span>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {articles.map((article, index) => (
          <MagazineArticleCard
            key={article.id}
            article={article}
            index={index}
            href={`${articleHrefPrefix}${article.id}`}
          />
        ))}
      </section>
    </div>
  );
}
