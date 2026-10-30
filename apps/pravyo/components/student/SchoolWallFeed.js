"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { BookOpen as FaBookOpen, ChevronRight as FaChevronRight, Feather as FaFeatherAlt, Shield as FaShieldAlt } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import AppDate from "@/components/common/AppDate";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import StudentQuickNav from "@/components/student/StudentQuickNav";
import { WritingPreview } from "@/components/WritingContent";
import { WritingCover, WritingTags } from "@/components/WritingMedia";
import { normalizeWritingCategory } from "@/lib/writingCategories";
import useStudentReadingSurface from "@/lib/client/useStudentReadingSurface";

const CATEGORIES = {
  BLOG_ARTICLE: "Blog Article",
  POEM: "Poem",
  RESEARCH: "Research",
  OPINION: "Opinion",
  CREATIVE_WRITING: "Creative Writing",
};

function initials(name = "") {
  return String(name || "Student")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function gradeLabel(grade) {
  if (!grade) return "Student";
  return /^grade\b/i.test(grade) ? grade : `Grade ${grade}`;
}

export default function SchoolWallFeed() {
  const { data, loading, error } = useStudentReadingSurface({
    endpoint: "/api/student/school-wall",
    surface: "student.schoolWall",
  });
  const [category, setCategory] = useRememberedState("school-wall:category", "ALL");
  const items = useMemo(() => data?.items || [], [data]);
  const visibleItems = useMemo(
    () =>
      category === "ALL"
        ? items
        : items.filter(
            (item) => normalizeWritingCategory(item.category) === category
          ),
    [category, items]
  );
  const availableCategories = useMemo(
    () =>
      Object.keys(CATEGORIES).filter((value) =>
        items.some(
          (item) => normalizeWritingCategory(item.category) === value
        )
      ),
    [items]
  );

  if (loading) {
    return (
      <LoadingState
        title="Opening School Wall"
        message="Loading the latest student writing."
      />
    );
  }
  if (error) {
    return (
      <AlertBanner type="error" title="Unable to load School Wall" message={error} />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-4">
      <StudentQuickNav className="sm:hidden" />
      <header className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="surface-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-white">
            <FaFeatherAlt />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">
              Live student writing
            </p>
            <h1 className="mt-1 font-semibold text-ink">
              School Wall
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Recent writing shared by students in your school, ordered newest first.
            </p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={FaFeatherAlt}
          title="No writing on the Wall yet"
          description="Approved student writing will appear here when your school publishes it."
        />
      ) : (
        <section className="card p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
            <button
              type="button"
              onClick={() => setCategory("ALL")}
              className={`btn btn-ghost btn-sm ${
                category === "ALL"
                  ? "bg-brand text-white"
                  : "bg-brand-soft text-brand-strong"
              }`}
            >
              All {items.length}
            </button>
            {availableCategories.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`btn btn-ghost btn-sm ${
                  category === value
                    ? "bg-brand text-white"
                    : "bg-brand-soft text-brand-strong"
                }`}
              >
                {CATEGORIES[value]}
              </button>
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <EmptyState
              icon={FaBookOpen}
              title="No writing in this category"
              description="Choose another category to continue reading."
            />
          ) : (
            <div className="mt-4 space-y-4">
              {visibleItems.map((article) => {
                const author = article.authorStudent?.name || "Student";
                return (
                  <article
                    key={article.id}
                    className="card p-4 sm:p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-strong">
                        {initials(author)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {author}
                        </p>
                        <p className="truncate text-xs font-semibold text-muted">
                          <FaShieldAlt className="mr-1 inline text-brand" />
                          {gradeLabel(article.authorStudent?.grade)}
                          {article.publishedAt && (
                            <>
                              {" · "}
                              <AppDate value={article.publishedAt} />
                            </>
                          )}
                        </p>
                      </div>
                      <span className="badge badge-brand">
                        {CATEGORIES[normalizeWritingCategory(article.category)] ||
                          "Writing"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-ink">
                          {article.title || "Student writing"}
                        </h2>
                        <WritingPreview
                          content={article.content}
                          maxLength={300}
                          className="mt-2 line-clamp-4 text-sm leading-6 text-muted"
                        />
                      </div>
                      <WritingCover
                        coverImage={article.coverImage}
                        images={article.images}
                        title={article.title}
                        className="h-24 w-28 shrink-0 sm:h-28 sm:w-40"
                      />
                    </div>
                    <WritingTags tags={article.tags} className="mt-3" />
                    <Link
                      href={`/student/school-wall/${article.id}`}
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-strong"
                    >
                      Read writing <FaChevronRight />
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
