import Link from "next/link";
import { BadgeCheck, ChevronRight, GraduationCap, Presentation, School } from "lucide-react";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import { PublicPageShell } from "@/components/public/PublicLayout";
import { getPublicTrainings } from "@/lib/publicTrainings";

export const revalidate = 60;

export const metadata = {
  title: "Trainings",
  description: "Courses Praavyo runs at schools — AI, Canva and more — with every participating school and certificate.",
};

export default async function PublicTrainingsPage() {
  const trainings = await getPublicTrainings();

  return (
    <PublicPageShell className="bg-surface-2">
      <PublicSiteNav active="trainings" />
      <section className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="trainings" />

        <main className="min-w-0 space-y-4">
          <div className="card p-5">
            <p className="eyebrow">Praavyo trainings</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Trainings</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Courses Praavyo runs at schools — AI, Canva and more. See every participating school and every certificate issued.
            </p>
          </div>

          {trainings.length === 0 ? (
            <div className="card p-6 text-center text-sm font-semibold text-muted">No trainings yet.</div>
          ) : (
            <ul className="space-y-3">
              {trainings.map((training) => {
                const Icon = training.audience === "TEACHERS" ? Presentation : GraduationCap;
                return (
                  <li key={training.id}>
                    <Link href={`/trainings/${training.id}`} className="card flex items-center gap-4 p-4 transition-colors hover:border-brand-line">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-strong"><Icon aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={`badge ${training.registrationOpen ? "badge-success" : "badge-warning"}`}>{training.registrationOpen ? "Registration open" : "Registration closed"}</span>
                          <span className="badge badge-neutral">For {training.audience === "TEACHERS" ? "teachers" : "students"}</span>
                          {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
                        </span>
                        <span className="mt-1 block truncate font-semibold text-ink">{training.title}</span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                          <span className="inline-flex items-center gap-1"><School aria-hidden /> {training.schoolCount} school{training.schoolCount === 1 ? "" : "s"}</span>
                          <span className="inline-flex items-center gap-1"><BadgeCheck aria-hidden /> {training.certificateCount} certificate{training.certificateCount === 1 ? "" : "s"}</span>
                          {training.audience !== "TEACHERS" && training.grades.length > 0 && <span>{training.grades.join(", ")}</span>}
                        </span>
                      </span>
                      <ChevronRight className="shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </section>
    </PublicPageShell>
  );
}
