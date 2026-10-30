import Link from "next/link";
import mongoose from "mongoose";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db";
import Student from "@/models/Student";
import User from "@/models/User";
import Achievement from "@/models/Achievement";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import "@/models/Event";
import { getActiveCertificateFilter } from "@/lib/certificates";
import { WritingPreview } from "@/components/WritingContent";
import {
  serializeWritingImage,
  serializeWritingImages,
  WritingCover,
  WritingTags,
} from "@/components/WritingMedia";
import AppDate from "@/components/common/AppDate";
import EnrollmentRange from "@/components/common/EnrollmentRange";
import {
  formatAuthoredEra,
  getAuthoredSchoolName,
} from "@/lib/writingProvenance";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import PublicShareButton from "@/components/public/PublicShareButton";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import StatTile from "@/components/ui/StatTile";
import { ArrowRight as FaArrowRight, BookOpen as FaBookOpen, BadgeCheck as FaCertificate, CircleCheck as FaCheckCircle, Feather as FaFeatherAlt, GraduationCap as FaGraduationCap, Medal as FaMedal, PenTool as FaPenNib, Trophy as FaTrophy } from "lucide-react";
import { academicYearDisplayLabel } from "@pravyo/core/nepaliDate";

export const revalidate = 60;

function displayAcademicYear(entry) {
  return academicYearDisplayLabel(entry?.academicYear, {
    yearStart: entry?.academicYearStart,
  });
}

// Prerender nothing at build; cache each visited profile on demand.
export async function generateStaticParams() {
  return [];
}

function formatPlacement(value) {
  if (value === "RUNNER_UP") return "1st Runner Up";
  if (value === "THIRD_PLACE") return "2nd Runner Up";
  return String(value || "Participant").replaceAll("_", " ");
}

function getCategoryLabel(value) {
  const label = String(value || "Writing").replaceAll("_", " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Group a student's writings by the school they were authored at, ordered to
// match the school-journey timeline (current/most-recent era first). Each piece
// stays owned by its origin school; this just organizes the portfolio so a
// transferred student's work reads as distinct chapters per school.
function groupWritingsBySchool(writings = [], journey = []) {
  const order = new Map(
    journey.map((entry, index) => [String(entry.schoolId), index])
  );
  const groups = new Map();

  for (const writing of writings) {
    const schoolId = writing.school?._id ? String(writing.school._id) : "";
    const key = schoolId || getAuthoredSchoolName(writing, "");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        schoolId,
        schoolName: getAuthoredSchoolName(writing, writing.school?.schoolName),
        writings: [],
      });
    }
    groups.get(key).writings.push(writing);
  }

  // Schools present in the journey sort by their timeline position; any others
  // (e.g. origin school missing from enrollment history) fall to the end.
  return [...groups.values()].sort((a, b) => {
    const ai = order.has(a.schoolId) ? order.get(a.schoolId) : Number.MAX_SAFE_INTEGER;
    const bi = order.has(b.schoolId) ? order.get(b.schoolId) : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

async function getPortfolioData(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  await connectDB();

  const student = await Student.findOne({
    _id: id,
    isDeleted: { $ne: true },
    status: { $ne: "INACTIVE" },
  })
    .select("name firstName lastName grade school createdAt enrollments")
    .populate("school", "schoolName schoolLocation")
    .lean();

  if (!student) return null;

  const schoolObjectId = student.school?._id || student.school;

  const [achievementsRaw, writingsRaw, schoolProfile] = await Promise.all([
    Achievement.find({
      student: id,
      isPublic: true,
      ...getActiveCertificateFilter(),
    })
      .sort({ awardedAt: -1 })
      .select(
        "title placement level awardedAt certificateUrl certificateCode certificateRecipientName teamName recipientType event"
      )
      .populate(
        "event",
        "title date eventScope publicResultsEnabled resultsPublished"
      )
      .limit(40)
      .lean(),
    SchoolMagazineArticle.find({
      authorStudent: id,
      status: "APPROVED",
      isPublished: true,
      isDeleted: { $ne: true },
    })
      .select(
        "title content category images coverImage tags publishedAt updatedAt authorSchoolNameSnapshot authorGrade authorAcademicYear"
      )
      .populate("school", "schoolName")
      .sort({ publishedAt: -1, updatedAt: -1 })
      .limit(24)
      .lean(),
    schoolObjectId
      ? SchoolShowcaseProfile.findOne({ school: schoolObjectId })
          .select("coverImageUrl")
          .lean()
      : null,
  ]);

  // Only surface achievements tied to genuinely public, published events.
  const achievements = achievementsRaw.filter(
    (achievement) =>
      achievement.event?.eventScope === "PLATFORM" &&
      achievement.event?.publicResultsEnabled &&
      achievement.event?.resultsPublished
  );

  // Privacy gate: do not create browsable profiles for students who have no
  // publicly published footprint of their own.
  if (achievements.length === 0 && writingsRaw.length === 0) {
    return null;
  }

  const eventIds = new Set(
    achievements.map((a) => String(a.event?._id || a.event)).filter(Boolean)
  );

  // Build the multi-school journey from enrollment history (newest first).
  const enrollments = Array.isArray(student.enrollments)
    ? student.enrollments
    : [];
  const enrollmentSchoolIds = Array.from(
    new Set(enrollments.map((entry) => String(entry.school)).filter(Boolean))
  );
  const journeySchools = enrollmentSchoolIds.length
    ? await User.find({ _id: { $in: enrollmentSchoolIds } })
        .select("schoolName name")
        .lean()
    : [];
  const journeySchoolNameById = new Map(
    journeySchools.map((s) => [String(s._id), s.schoolName || s.name || "School"])
  );
  const journey = enrollments
    .map((entry) => ({
      schoolId: String(entry.school),
      schoolName:
        entry.schoolNameSnapshot ||
        journeySchoolNameById.get(String(entry.school)) ||
        "School",
      grade: entry.grade,
      academicYear: entry.academicYear,
      academicYearStart: entry.academicYearStart ?? null,
      status: entry.status,
      startedAt: entry.startedAt || null,
      endedAt: entry.endedAt || null,
    }))
    .sort(
      (a, b) =>
        (b.academicYearStart ?? 0) - (a.academicYearStart ?? 0)
    );
  const schoolsCount = enrollmentSchoolIds.length || (schoolObjectId ? 1 : 0);

  return {
    student,
    schoolProfile: schoolProfile || null,
    achievements,
    writings: writingsRaw.map((writing) => ({
      ...writing,
      coverImage: serializeWritingImage(writing.coverImage),
      images: serializeWritingImages(writing.images),
    })),
    journey,
    stats: {
      achievements: achievements.length,
      wins: achievements.filter((a) => a.placement === "WINNER").length,
      certificates: achievements.filter((a) => a.certificateUrl).length,
      writings: writingsRaw.length,
      competitions: eventIds.size,
      schools: schoolsCount,
    },
  };
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const data = await getPortfolioData(resolvedParams.id);
  if (!data) return { title: "Student portfolio not found" };

  const name = data.student.name || "Student";
  const school = data.student.school?.schoolName || "their school";
  const { achievements, writings, wins } = data.stats;
  const highlights = [
    achievements ? `${achievements} achievement${achievements === 1 ? "" : "s"}` : "",
    wins ? `${wins} win${wins === 1 ? "" : "s"}` : "",
    writings ? `${writings} published piece${writings === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const title = `${name} — Verified Student Portfolio`;
  const description = highlights.length
    ? `${name} at ${school}: ${highlights.join(", ")} — verified on Praavyo.`
    : `Verified achievements, certificates, and writing by ${name} at ${school}, on Praavyo.`;
  const url = `/students/${resolvedParams.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "Praavyo",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function EmptyPanel({ icon: Icon, title, description }) {
  return (
    <div className="card flex min-h-44 flex-col items-center justify-center border-dashed p-4 sm:p-5 text-center">
      <Icon className="text-3xl text-warning" />
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function AchievementRow({ achievement }) {
  const isWinner = achievement.placement === "WINNER";
  return (
    <article className="card flex h-full items-start gap-4 p-4 transition-colors hover:border-brand-line">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${
          isWinner ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"
        }`}
      >
        {isWinner ? <FaTrophy /> : <FaMedal />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge badge-neutral uppercase ${
              isWinner ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"
            }`}
          >
            {formatPlacement(achievement.placement)}
          </span>
          {achievement.event?.title && (
            <span className="text-xs font-semibold text-muted">
              {achievement.event.title}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-sm font-semibold text-ink">
          {achievement.title}
        </h3>
        <p className="mt-1 text-xs text-muted">
          <AppDate value={achievement.awardedAt || achievement.event?.date} />
        </p>
        {achievement.certificateUrl && (
          <a
            href={achievement.certificateUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong"
          >
            <FaCertificate /> View certificate
            {achievement.certificateCode ? ` · ${achievement.certificateCode}` : ""}
          </a>
        )}
      </div>
    </article>
  );
}

function WritingCard({ writing }) {
  return (
    <Link
      href={`/writings/${writing._id}`}
      className="card transition-colors hover:border-brand-line hover:bg-surface-2 block h-full p-4 transition-colors hover:border-brand-line"
    >
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-success uppercase">
          Published
        </span>
        <span className="badge badge-brand uppercase">
          {getCategoryLabel(writing.category)}
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-ink">
        {writing.title}
      </h3>
      <WritingCover coverImage={writing.coverImage} images={writing.images} title={writing.title} className="mt-3 aspect-[16/9]" />
      {formatAuthoredEra(writing) && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-2xs font-semibold text-muted">
          <FaGraduationCap className="text-brand-strong" />
          {formatAuthoredEra(writing)}
        </p>
      )}
      <WritingPreview
        content={writing.content}
        maxLength={140}
        className="mt-2 line-clamp-3 text-xs leading-5 text-muted"
      />
      <WritingTags tags={writing.tags} className="mt-3" />
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong">
        Read writing <FaArrowRight />
      </p>
    </Link>
  );
}

export default async function StudentPortfolioPage({ params }) {
  const resolvedParams = await params;
  const data = await getPortfolioData(resolvedParams.id);

  if (!data) notFound();

  const { student, schoolProfile, achievements, writings, journey, stats } = data;
  const hasJourney = Array.isArray(journey) && journey.length > 0;
  const writingGroups = groupWritingsBySchool(writings, journey);
  // Only split into per-school chapters when the work actually spans schools.
  const groupWritings = writingGroups.length > 1;
  const name = student.name || "Student";
  const schoolId = student.school?._id ? String(student.school._id) : "";
  const schoolName = student.school?.schoolName || "School";
  const schoolLogoUrl = schoolProfile?.coverImageUrl || "";

  return (
    <main className="min-h-screen bg-surface-2 pb-24 text-ink">
      <PublicSiteNav active="schools" />

      <div className="mx-auto max-w-5xl space-y-4 px-0 py-4 sm:px-6 sm:py-5">
        {/* breadcrumb + share */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
          <div className="flex items-center gap-2">
            <Link href="/" className="hover:text-brand-strong">
              Home
            </Link>
            <span>/</span>
            {schoolId ? (
              <Link href={`/schools/${schoolId}`} className="hover:text-brand-strong">
                {schoolName}
              </Link>
            ) : (
              <span>{schoolName}</span>
            )}
            <span>/</span>
            <span>{name}</span>
          </div>
          <PublicShareButton
            href={`/students/${student._id}`}
            title={`${name} — Student Portfolio`}
            label="Share Portfolio"
            className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-brand-strong shadow-card transition-colors hover:bg-surface"
          />
        </div>

        {/* hero */}
        <section className="card overflow-hidden shadow-pop">
          <div className="surface-brand relative px-5 py-7 sm:px-6">
            <div className="absolute inset-0" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <span className="badge badge-neutral inline-flex items-center gap-2 text-xs uppercase tracking-wide">
                <FaCheckCircle />
                Verified student portfolio
              </span>
              <span className="text-sm font-semibold">
                {stats.achievements + stats.writings} public records
              </span>
            </div>
          </div>

          <div className="px-5 pb-6 sm:px-6">
            <div className="card -mt-5 p-5 sm:p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="card flex shrink-0 flex-col items-center gap-2 p-3 text-center">
                  <SchoolLogoMark
                    imageUrl={schoolLogoUrl}
                    name={schoolName}
                    className="h-24 w-24"
                    iconClassName="text-3xl"
                    shapeClassName="rounded-card"
                  />
                  <span className="max-w-28 truncate text-2xs font-semibold uppercase text-muted">
                    {schoolName}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-semibold leading-tight text-ink md:text-3xl">
                      {name}
                    </h1>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success">
                      <FaCheckCircle title="Verified by Praavyo" />
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-muted">
                    {student.grade && (
                      <span className="inline-flex items-center gap-1.5">
                        <FaGraduationCap className="text-brand-strong" /> {student.grade}
                      </span>
                    )}
                    {schoolId ? (
                      <Link
                        href={`/schools/${schoolId}`}
                        className="inline-flex items-center gap-1.5 hover:text-brand-strong"
                      >
                        <SchoolLogoMark
                          imageUrl={schoolLogoUrl}
                          name={schoolName}
                          className="h-6 w-6"
                          iconClassName="text-xs"
                          shapeClassName="rounded-control"
                        />
                        {schoolName}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <SchoolLogoMark
                          imageUrl={schoolLogoUrl}
                          name={schoolName}
                          className="h-6 w-6"
                          iconClassName="text-xs"
                          shapeClassName="rounded-control"
                        />
                        {schoolName}
                      </span>
                    )}
                    {student.createdAt && (
                      <span>
                        On Praavyo since{" "}
                        <AppDate value={student.createdAt} mode="monthYear" />
                      </span>
                    )}
                  </div>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
                    A verified record of {name.split(" ")[0]}&apos;s achievements,
                    certificates, and published writing — recognized through events and
                    showcases on Praavyo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* stats */}
        <section className="grid grid-cols-2 gap-3 px-4 sm:gap-4 sm:px-0 md:grid-cols-4">
          <StatTile icon={FaTrophy} accent="amber" label="Achievements" value={stats.achievements} />
          <StatTile icon={FaMedal} accent="amber" label="Wins" value={stats.wins} />
          <StatTile icon={FaCertificate} accent="purple" label="Certificates" value={stats.certificates} />
          <StatTile icon={FaFeatherAlt} accent="purple" label="Published Writing" value={stats.writings} />
        </section>

        {/* school journey */}
        {hasJourney && journey.length > 1 && (
          <section className="card p-5 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
                <FaGraduationCap className="text-brand-strong" />
                School Journey
              </h2>
              <span className="badge badge-neutral text-xs">
                {stats.schools} {stats.schools === 1 ? "school" : "schools"}
              </span>
            </div>
            <ol className="relative mt-4 space-y-4 border-l border-line pl-6">
              {journey.map((entry, index) => {
                const isCurrent = entry.status === "CURRENT";
                return (
                  <li
                    key={`${entry.schoolId}-${entry.academicYearStart}-${index}`}
                    className="relative"
                  >
                    <span
                      className={`absolute top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line shadow-card ${
                        isCurrent ? "bg-success" : "bg-brand"
                      }`}
                      style={{ left: "-31px" }}
                    />
                    <div className="card flex items-start gap-3 p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface text-brand-strong shadow-card">
                        <FaGraduationCap />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">
                          {entry.schoolName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {entry.grade}
                          {displayAcademicYear(entry)
                            ? ` · ${displayAcademicYear(entry)}`
                            : ""}
                        </p>
                        <EnrollmentRange
                          entry={entry}
                          className="mt-1 block text-xs font-semibold text-brand-strong"
                        />
                      </div>
                      {isCurrent && (
                        <span className="badge badge-success uppercase">
                          Current
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* achievements */}
        <section className="card p-5 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
              <FaTrophy className="text-warning" />
              Achievements & Certificates
            </h2>
            <span className="badge badge-neutral text-xs">
              {achievements.length} records
            </span>
          </div>
          {achievements.length === 0 ? (
            <div className="mt-5">
              <EmptyPanel
                icon={FaTrophy}
                title="No public achievements yet"
                description="Verified event results and certificates will appear here once published."
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {achievements.map((achievement) => (
                <AchievementRow key={String(achievement._id)} achievement={achievement} />
              ))}
            </div>
          )}
        </section>

        {/* writings */}
        <section className="card p-5 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
              <FaPenNib className="text-brand-strong" />
              Published Writing
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="badge badge-brand text-xs">
                {writings.length} pieces
              </span>
              <Link href="/student-voices" className="text-sm font-semibold text-brand-strong">
                Explore student voices
              </Link>
            </div>
          </div>
          {writings.length === 0 ? (
            <div className="mt-5">
              <EmptyPanel
                icon={FaBookOpen}
                title="No published writing yet"
                description="Approved and published articles by this student will appear here."
              />
            </div>
          ) : groupWritings ? (
            <div className="mt-5 space-y-4">
              {writingGroups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 border-b border-line pb-2">
                    <FaGraduationCap className="text-brand-strong" />
                    <h3 className="text-sm font-semibold text-ink">
                      {group.schoolName}
                    </h3>
                    <span className="badge badge-neutral">
                      {group.writings.length}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.writings.map((writing) => (
                      <WritingCard key={String(writing._id)} writing={writing} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {writings.map((writing) => (
                <WritingCard key={String(writing._id)} writing={writing} />
              ))}
            </div>
          )}
        </section>

        {/* trust / CTA */}
        <section className="surface-brand relative overflow-hidden rounded-card p-4 sm:p-5 shadow-pop">
          <div className="absolute inset-0" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-xl">
                <FaCheckCircle />
              </span>
              <div>
                <h2 className="text-lg font-semibold">
                  Every achievement here is verified by Praavyo
                </h2>
                <p className="mt-1 text-sm font-semibold leading-6">
                  Results, certificates, and writing are published through their
                  schools and recognized on the Praavyo platform.
                </p>
              </div>
            </div>
            <Link
              href="/schools"
              className="btn btn-ghost inline-flex items-center justify-center gap-2 transition-colors"
            >
              Explore schools
              <FaArrowRight />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
