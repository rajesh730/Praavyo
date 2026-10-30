"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { BookOpen as FaBookOpen, ChevronRight as FaChevronRight, Feather as FaFeatherAlt } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import StudentQuickNav from "@/components/student/StudentQuickNav";
import useStudentReadingSurface from "@/lib/client/useStudentReadingSurface";

export default function StudentMagazineLibrary() {
  const { data, loading, error } = useStudentReadingSurface({
    endpoint: "/api/student/magazine",
    surface: "student.schoolMagazine",
  });
  const issues = useMemo(() => data?.issues || [], [data]);
  const months = useMemo(
    () => Array.from(new Set(issues.map((issue) => issue.monthLabel).filter(Boolean))),
    [issues]
  );
  const [month, setMonth] = useRememberedState("student-magazine:month", "ALL");
  const visibleIssues =
    month === "ALL"
      ? issues
      : issues.filter((issue) => issue.monthLabel === month);

  if (loading) {
    return (
      <LoadingState
        title="Opening School Magazine"
        message="Loading published magazine issues."
      />
    );
  }
  if (error) {
    return (
      <AlertBanner
        type="error"
        title="Unable to load School Magazine"
        message={error}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-4">
      <StudentQuickNav className="sm:hidden" />
      <header className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="surface-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-white">
            <FaBookOpen />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-strong">
              Curated by your school
            </p>
            <h1 className="mt-1 font-semibold text-ink">
              School Magazine
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Browse published issues and read selected student writing as a collection.
            </p>
          </div>
        </div>
      </header>

      {issues.length === 0 ? (
        <EmptyState
          icon={FaBookOpen}
          title="No published magazine issues"
          description="Issues will appear here after your school curates and publishes them."
        />
      ) : (
        <section className="card p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-ink">Published issues</h2>
              <p className="mt-1 text-sm text-muted">
                {visibleIssues.length} {visibleIssues.length === 1 ? "issue" : "issues"}
              </p>
            </div>
            <label className="block sm:w-64">
              <span className="text-xs font-semibold uppercase text-muted">
                Publication month
              </span>
              <select
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="input mt-2 w-full"
              >
                <option value="ALL">All months</option>
                {months.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleIssues.map((issue) => (
              <Link
                key={issue.id}
                href={`/student/magazine/issues/${issue.id}`}
                className="card transition-colors hover:border-brand-line hover:bg-surface-2 group p-4 transition-colors hover:border-brand-line hover:shadow-pop"
              >
                <div className="card surface-brand relative h-40 overflow-hidden">
                  <div className="absolute left-5 top-6 h-20 w-14 -rotate-6 rounded-control bg-surface shadow-card" />
                  <div className="absolute left-20 top-10 h-20 w-14 rotate-6 rounded-control bg-surface shadow-card" />
                  <FaBookOpen className="absolute right-6 top-8 text-2xl text-white" />
                  <FaFeatherAlt className="absolute bottom-6 left-7 text-2xl text-white" />
                  <span className="badge badge-neutral absolute bottom-4 right-4">
                    {issue.articleCount}{" "}
                    {issue.articleCount === 1 ? "writing" : "writings"}
                  </span>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase text-brand-strong">
                  {issue.monthLabel}
                </p>
                <h3 className="mt-1 font-semibold text-ink group-hover:text-brand-strong">
                  {issue.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                  {issue.coverArticle?.title
                    ? `Featuring “${issue.coverArticle.title}” and other selected writing.`
                    : "A curated collection of student writing."}
                </p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-strong">
                  Open issue <FaChevronRight />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
