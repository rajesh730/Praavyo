import Link from "next/link";
import connectDB from "@/lib/db";
import Achievement from "@/models/Achievement";
import { getActiveCertificateFilter } from "@/lib/certificates";
import { formatPlacement } from "@/lib/displayFormat";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import { ArrowRight as FaArrowRight, Award as FaAward, BadgeCheck as FaCertificate, Medal as FaMedal, School as FaSchool, Trophy as FaTrophy } from "lucide-react";
import AppDate from "@/components/common/AppDate";
import "@/models/Event";
import "@/models/Student";
import "@/models/User";

export const revalidate = 60;

export const metadata = {
  title: "Winners",
  description: "Public Praavyo winners, certificates, and school achievements.",
};

async function getWinners() {
  await connectDB();

  const achievements = await Achievement.find({
    isPublic: true,
    ...getActiveCertificateFilter(),
  })
    .select("title placement level awardedAt certificateUrl certificateRecipientName")
    .sort({ awardedAt: -1, createdAt: -1 })
    .limit(40)
    .populate("student", "name grade")
    .populate("school", "schoolName")
    .populate("event", "title eventScope publicResultsEnabled resultsPublished")
    .lean();

  return achievements
    .filter(
      (achievement) =>
        achievement.event?.eventScope === "PLATFORM" &&
        achievement.event?.publicResultsEnabled &&
        achievement.event?.resultsPublished
    )
    .map((achievement) => ({
    id: String(achievement._id),
    studentName:
      achievement.certificateRecipientName ||
      achievement.student?.name ||
      "Student",
    grade: achievement.student?.grade || "",
    schoolName: achievement.school?.schoolName || "School",
    schoolHref: achievement.school?._id ? `/schools/${achievement.school._id}` : "/schools",
    eventTitle: achievement.event?.title || achievement.title || "Event",
    eventHref: achievement.event?._id ? `/events/${achievement.event._id}` : "/events",
    certificateHref: achievement.certificateUrl || "",
    placement: achievement.placement,
    date: achievement.awardedAt,
  }));
}

function WinnerCard({ winner, featured = false }) {
  return (
    <article className={`card p-4 ${featured ? "md:p-7" : ""}`}>
      <div className="flex items-start gap-4">
        <span className={`${featured ? "h-20 w-20 text-3xl" : "h-14 w-14 text-xl"} flex shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning`}>
          <FaTrophy />
        </span>
        <div className="min-w-0 flex-1">
          <span className="badge badge-warning uppercase">
            {formatPlacement(winner.placement)}
          </span>
          <h2 className={`${featured ? "mt-4 text-3xl" : "mt-3 text-xl"} font-semibold leading-tight text-ink`}>
            {winner.studentName}
          </h2>
          <p className="mt-2 text-sm font-semibold text-muted">
            {winner.eventTitle}
          </p>
          <Link
            href={winner.schoolHref}
            className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-brand-strong"
          >
            <FaSchool />
            {winner.schoolName}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <div>
          <p className="text-2xs font-semibold uppercase text-muted">Awarded</p>
          <p className="mt-1 text-sm font-semibold text-ink"><AppDate value={winner.date} fallback="Recently" /></p>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase text-muted">Certificate</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {winner.certificateHref ? "Issued" : "Not public"}
          </p>
        </div>
        <div className="flex items-end justify-start gap-2 sm:justify-end">
          <Link
            href={winner.eventHref}
            className="btn btn-secondary btn-sm inline-flex items-center justify-center"
          >
            Event
          </Link>
          {winner.certificateHref && (
            <a
              href={winner.certificateHref}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm inline-flex items-center justify-center"
            >
              Certificate
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function WinnersPage() {
  const winners = await getWinners();
  const featured = winners[0] || null;
  const schools = new Set(winners.map((winner) => winner.schoolName)).size;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <PublicSiteNav active="winners" searchPlaceholder="Search winners and achievements..." />

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-6 pb-16 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="winners" />

        <div className="min-w-0 space-y-4">
          <section className="card p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase text-brand-strong">
              Winners
            </p>
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <h1 className="text-3xl font-semibold leading-tight text-ink md:text-3xl">
                  Celebrated students, certificates, and school success.
                </h1>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-muted">
                  A focused public record of Praavyo achievements. Each winner links
                  back to the event, school, and certificate when available.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  [winners.length, "Awards", FaAward],
                  [schools, "Schools", FaSchool],
                  ["Public", "Certificates", FaCertificate],
                ].map(([value, label, Icon]) => (
                  <div key={label} className="rounded-card bg-surface-2 p-4 text-center">
                    <Icon className="mx-auto text-brand-strong" />
                    <p className="mt-2 text-xl font-semibold text-ink">{value}</p>
                    <p className="text-2xs font-semibold uppercase text-muted">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {featured ? (
            <WinnerCard winner={featured} featured />
          ) : (
            <section className="card border-dashed p-6 text-center">
              <FaMedal className="mx-auto text-3xl text-warning" />
              <h2 className="mt-4 text-xl font-semibold text-ink">
                No public winners yet
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted">
                Winners will appear after results and certificates are published.
              </p>
              <Link
                href="/events"
                className="btn btn-primary mt-5 inline-flex items-center gap-2"
              >
                Explore Events
                <FaArrowRight />
              </Link>
            </section>
          )}

          {winners.length > 1 && (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {winners.slice(1).map((winner) => (
                <WinnerCard key={winner.id} winner={winner} />
              ))}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
