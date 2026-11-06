import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, Clock, GraduationCap, Presentation, School, Users } from "lucide-react";
import AppDate from "@/components/common/AppDate";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicShareButton from "@/components/public/PublicShareButton";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import PublicTrainingCertificates from "@/components/public/PublicTrainingCertificates";
import { PublicPageShell } from "@/components/public/PublicLayout";
import { getPublicTraining } from "@/lib/publicTrainings";

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getPublicTraining(id);
  if (!data) return { title: "Training" };
  return {
    title: data.training.title,
    description: data.training.description || `A Praavyo training — ${data.totals.schools} schools, ${data.totals.certificates} certificates.`,
  };
}

const STAGE = {
  REGISTERED: { label: "Registered", badge: "badge-neutral" },
  TRAINED: { label: "Trained", badge: "badge-warning" },
  CERTIFIED: { label: "Certified", badge: "badge-success" },
};

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="card p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-2 text-brand-strong"><Icon aria-hidden /></span>
        <span className="min-w-0">
          <span className="block truncate text-2xs font-semibold uppercase tracking-wide text-muted">{label}</span>
          <strong className="mt-0.5 block break-words text-sm text-ink">{children}</strong>
        </span>
      </div>
    </div>
  );
}

export default async function PublicTrainingPage({ params }) {
  const { id } = await params;
  const data = await getPublicTraining(id);

  if (!data) {
    return (
      <PublicPageShell className="bg-surface-2">
        <PublicSiteNav active="trainings" />
        <div className="mx-auto max-w-5xl p-6 text-muted">Training not found.</div>
      </PublicPageShell>
    );
  }

  const { training, schools, certificates, totals } = data;
  const forTeachers = training.audience === "TEACHERS";

  return (
    <PublicPageShell className="bg-surface-2">
      <PublicSiteNav active="trainings" />
      <section className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="trainings" />

        <main className="min-w-0 space-y-4">
          <article className="card p-5 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/trainings" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-strong"><ArrowLeft aria-hidden /> All trainings</Link>
              <PublicShareButton
                href={`/trainings/${training.id}`}
                title={training.title}
                label="Share training"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-brand-strong transition-colors hover:bg-surface-2"
              />
            </div>
            <div className="mt-5 max-w-4xl">
              <div className="flex flex-wrap gap-2">
                <span className="badge badge-brand">Praavyo training</span>
                <span className="badge badge-neutral">For {forTeachers ? "teachers" : "students"}</span>
                <span className={`badge ${training.registrationOpen ? "badge-success" : "badge-warning"}`}>{training.registrationOpen ? "Registration open" : "Registration closed"}</span>
              </div>
              <h1 className="mt-4 break-words text-3xl font-semibold leading-tight text-ink">{training.title}</h1>
              {training.description && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-base leading-8 text-muted">{training.description}</p>}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Fact icon={forTeachers ? Presentation : GraduationCap} label="Who">{forTeachers ? "Teachers" : training.grades.length ? training.grades.join(", ") : "All grades"}</Fact>
              <Fact icon={Clock} label="Duration">{training.duration || "—"}</Fact>
              <Fact icon={CalendarDays} label="Register by">{training.registrationDeadline ? <AppDate value={training.registrationDeadline} /> : "Open until closed"}</Fact>
              <Fact icon={Users} label="Organiser">Praavyo</Fact>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Fact icon={School} label="Schools">{totals.schools}</Fact>
              <Fact icon={Users} label={forTeachers ? "Teachers registered" : "Students registered"}>{totals.registered}</Fact>
              <Fact icon={BadgeCheck} label="Certificates">{totals.certificates}</Fact>
            </div>
          </article>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink"><School className="text-brand-strong" aria-hidden /> Participating schools</h2>
              <span className="badge badge-neutral tabular-nums">{schools.length}</span>
            </div>
            {schools.length === 0 ? (
              <p className="m-4 rounded-control bg-surface-2 p-4 text-sm font-semibold text-muted">No school has registered yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {schools.map((school) => (
                  <li key={school.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link href={`/schools/${school.id}`} className="font-semibold text-ink hover:text-brand-strong">{school.name}</Link>
                      {school.location && <p className="truncate text-xs text-muted">{school.location}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={`badge ${STAGE[school.stage].badge}`}>{STAGE[school.stage].label}</span>
                      <span className="tabular-nums">{school.registered} registered</span>
                      <span className="tabular-nums">· {school.certified} certified</span>
                      {school.trainingDate && <span>· trained <AppDate value={school.trainingDate} /></span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PublicTrainingCertificates certificates={certificates} />

          <section className="card p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Want this training at your school?</h2>
                <p className="mt-1 text-sm leading-6 text-muted">Schools register from their Praavyo dashboard → Platform Events → Trainings.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/login" className="btn btn-secondary">Login</Link>
                <Link href="/register" className="btn btn-primary">Register school <ArrowRight aria-hidden /></Link>
              </div>
            </div>
          </section>
        </main>
      </section>
    </PublicPageShell>
  );
}
