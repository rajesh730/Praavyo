import Link from "next/link";
import { ClipboardCheck, FileSpreadsheet } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Schools can open CAS and Internal Exam workspaces from this chooser.
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
  },
];

export default function ExamsPage() {
  return (
    <DashboardLayout>
      <PageHeader
        title="Exams"
        description="Manage CAS for Grades 1–5 and Internal Exam marks for Grades 1–10."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map(({ href, icon: Icon, title, grades, text }) => (
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
        ))}
      </div>
    </DashboardLayout>
  );
}
