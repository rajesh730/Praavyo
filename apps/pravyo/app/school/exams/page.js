import Link from "next/link";
import { ClipboardCheck, FileSpreadsheet, Lock } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import { isInternalExamLocked } from "@/lib/exams/internalExamLock";

export const dynamic = "force-dynamic";

/**
 * Exams: the two kinds of result a school publishes.
 *
 *   - CAS — the government's continuous assessment for Grades 1–5, by theme,
 *     printed on the Classic report card.
 *   - Internal Exam — the school's own written papers for Grades 1–10, entered
 *     as marks, printed on the Modern report card.
 *
 * Grades 1–5 therefore get two report cards a term, Grades 6–10 one.
 */
const OPTIONS = [
  {
    href: "/school/cas/assessment",
    icon: ClipboardCheck,
    title: "CAS",
    grades: "Grades 1–5",
    text: "Continuous assessment by theme and learning outcome. Results print on the Classic report card.",
  },
  {
    href: "/school/internal-exam/marks",
    icon: FileSpreadsheet,
    title: "Internal Exam",
    grades: "Grades 1–10",
    text: "Your own question papers. Teachers enter marks subject by subject; results print on the Modern report card.",
    lockable: true,
  },
];

export default async function ExamsPage() {
  // Internal Exam stays closed until the Super Admin unlocks it.
  const internalLocked = await isInternalExamLocked();

  return (
    <DashboardLayout>
      <PageHeader
        title="Exams"
        description="Grades 1–5 get a CAS result and an internal exam result. Grades 6–10 get the internal exam result."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map(({ href, icon: Icon, title, grades, text, lockable }) =>
          lockable && internalLocked ? (
            <div key={href} className="card flex gap-4 p-5 opacity-75" aria-disabled="true">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-surface-2 text-muted">
                <Lock aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-ink">{title}</span>
                  <span className="badge badge-neutral text-xs">{grades}</span>
                  <span className="badge badge-warning text-xs">Locked · not ready yet</span>
                </span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </span>
            </div>
          ) : (
          <Link key={href} href={href} className="card group flex gap-4 p-5 transition hover:border-brand">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-brand-soft text-brand">
              <Icon aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-ink group-hover:text-brand">{title}</span>
                <span className="badge badge-neutral text-xs">{grades}</span>
              </span>
              <span className="mt-1 block text-sm text-muted">{text}</span>
            </span>
          </Link>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
