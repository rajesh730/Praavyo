import Link from "next/link";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Student from "@/models/Student";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import Achievement from "@/models/Achievement";
import { getActiveCertificateFilter } from "@/lib/certificates";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicShareButton from "@/components/public/PublicShareButton";
import ExpandableStoryText from "@/components/public/ExpandableStoryText";
import { stripWritingMarkup } from "@/components/WritingContent";
import {
  serializeWritingImage,
  serializeWritingImages,
  WritingCover,
  WritingTags,
} from "@/components/WritingMedia";
import { normalizeImageUrl } from "@/lib/imageUrls";
import { formatPlacement } from "@/lib/displayFormat";
import { ArrowRight as FaArrowRight, BookOpen as FaBookOpen, CircleCheck as FaCheckCircle, Mail as FaEnvelope, Globe as FaGlobe, GraduationCap as FaGraduationCap, MapPin as FaMapMarkerAlt, Medal as FaMedal, PenTool as FaPenNib, Phone as FaPhone, School as FaSchool, Star as FaStar, Trophy as FaTrophy, UserRound as FaUserTie } from "lucide-react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaTwitter, FaYoutube } from "react-icons/fa";

export const revalidate = 60;

// Prerender nothing at build; cache each visited school page on demand.
export async function generateStaticParams() {
  return [];
}

function ensureHttp(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const SOCIAL_PLATFORMS = [
  { key: "facebook", label: "Facebook", icon: FaFacebookF, hover: "hover:bg-brand hover:text-white hover:border-brand" },
  { key: "instagram", label: "Instagram", icon: FaInstagram, hover: "hover:bg-danger hover:text-white hover:border-danger" },
  { key: "linkedin", label: "LinkedIn", icon: FaLinkedinIn, hover: "hover:bg-brand-strong hover:text-white hover:border-brand" },
  { key: "tiktok", label: "TikTok", icon: FaTiktok, hover: "hover:bg-ink hover:text-white hover:border-line-strong" },
  { key: "youtube", label: "YouTube", icon: FaYoutube, hover: "hover:bg-danger hover:text-white hover:border-danger" },
  { key: "twitter", label: "X (Twitter)", icon: FaTwitter, hover: "hover:bg-ink hover:text-white hover:border-line-strong" },
];

function getSocialEntries(socialLinks = {}) {
  return SOCIAL_PLATFORMS.map((platform) => ({
    ...platform,
    url: ensureHttp(socialLinks?.[platform.key]),
  })).filter((platform) => platform.url);
}

function formatDate(value) {
  if (!value) return "Date to be announced";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getPreview(value = "", maxLength = 120) {
  const text = stripWritingMarkup(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getReadTime(content = "") {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function getCategoryLabel(value) {
  const label = String(value || "Writing").replaceAll("_", " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function gradeSortValue(value) {
  const match = String(value || "").match(/\d+/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(match[0], 10);
}

function formatGradeSummary(grades = []) {
  const normalized = Array.from(
    new Set(grades.map((grade) => String(grade || "").trim()).filter(Boolean))
  ).sort((a, b) => gradeSortValue(a) - gradeSortValue(b) || a.localeCompare(b));

  if (normalized.length === 0) return "";
  if (normalized.length === 1) return normalized[0];

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  return `${first} to ${last}`;
}

function formatConfiguredGradeRange(config = {}) {
  const level = config.schoolLevel || config;
  const minGrade = Number.parseInt(level.minGrade, 10);
  const maxGrade = Number.parseInt(level.maxGrade, 10);

  if (!Number.isFinite(maxGrade)) return "";

  const safeMinGrade = Number.isFinite(minGrade) ? minGrade : 1;
  if (safeMinGrade === maxGrade) return `Grade ${maxGrade}`;
  return `Grade ${safeMinGrade} to Grade ${maxGrade}`;
}

function formatConfigLabel(value) {
  const text = String(value || "").replaceAll("_", " ").trim();
  if (!text) return "";
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getSchoolData(id) {
  await connectDB();

  const school = await User.findOne({
    _id: id,
    role: "SCHOOL_ADMIN",
    status: { $in: ["APPROVED", "SUBSCRIBED"] },
  })
    .select(
      "schoolName principalName schoolLocation website establishedYear schoolConfig"
    )
    .lean();

  if (!school) return null;

  const [
    profile,
    achievements,
    homeMagazines,
    studentCount,
    teacherCount,
    grades,
  ] =
    await Promise.all([
      SchoolShowcaseProfile.findOne({ school: id, visibility: "PUBLIC" }).lean(),
      Achievement.find({
        school: id,
        isPublic: true,
        ...getActiveCertificateFilter(),
      })
        .sort({ awardedAt: -1 })
        .select(
          "title placement level awardedAt totalScore scorePercentage certificateUrl certificateRecipientName recipientType teamName"
        )
        .populate("student", "name grade")
        .populate("event", "eventScope publicResultsEnabled resultsPublished")
        .limit(6)
        .lean(),
      getSchoolHomeMagazines(id),
      Student.countDocuments({
        school: id,
        status: "ACTIVE",
        isDeleted: { $ne: true },
      }),
      TeacherMembership.countDocuments({
        school: id,
        status: "ACTIVE",
      }),
      Student.distinct("grade", {
        school: id,
        status: "ACTIVE",
        isDeleted: { $ne: true },
      }),
    ]);

  return {
    school,
    profile,
    achievements: achievements.filter(
      (achievement) =>
        achievement.event?.eventScope === "PLATFORM" &&
        achievement.event?.publicResultsEnabled &&
        achievement.event?.resultsPublished
    ),
    magazines: homeMagazines,
    studentCount,
    teacherCount,
    grades,
  };
}

async function getSchoolHomeMagazines(schoolId) {
  const issues = await MagazineIssue.find({
    school: schoolId,
    status: "PUBLISHED",
    showOnHome: true,
  })
    .select("title publishedAt homeShownAt weekStart")
    .sort({ homeShownAt: -1, publishedAt: -1, weekStart: -1, createdAt: -1 })
    .limit(6)
    .lean();

  if (issues.length === 0) return [];

  const issueIds = issues.map((issue) => issue._id);
  const articles = await SchoolMagazineArticle.find({
    school: schoolId,
    magazineIssue: { $in: issueIds },
    isMagazinePublished: true,
    isDeleted: { $ne: true },
  })
    .select("title content images coverImage tags magazineIssue")
    .sort({ magazinePublishedAt: 1, updatedAt: 1 })
    .lean();

  const articlesByIssue = articles.reduce((map, article) => {
    const key = String(article.magazineIssue);
    const list = map.get(key) || [];
    list.push(article);
    map.set(key, list);
    return map;
  }, new Map());

  return issues
    .map((issue) => {
      const issueArticles = articlesByIssue.get(String(issue._id)) || [];
      if (issueArticles.length === 0) return null;
      const firstArticle = issueArticles[0];

      return {
        _id: String(issue._id),
        type: "MAGAZINE",
        href: `/magazines/${issue._id}`,
        title: issue.title || "School Magazine",
        content:
          issueArticles.length === 1
            ? firstArticle.content
            : `${firstArticle.title}: ${getPreview(firstArticle.content, 100)}`,
        coverImage: serializeWritingImage(firstArticle.coverImage),
        images: serializeWritingImages(firstArticle.images),
        tags: firstArticle.tags || [],
        publicDate: issue.homeShownAt || issue.publishedAt || issue.weekStart,
        articleCount: issueArticles.length,
      };
    })
    .filter(Boolean);
}

function HeroFallbackArt() {
  return (
    <div className="surface-brand absolute inset-0">
      <div className="absolute bottom-0 left-0 right-0 h-36" />
      <div className="absolute bottom-10 right-12 hidden h-28 w-48 rounded-card bg-white/10 md:block" />
      <div className="absolute right-28 top-12 hidden h-16 w-36 -rotate-6 rounded-card bg-white/10 md:block" />
      <FaSchool className="absolute bottom-14 right-24 hidden text-3xl text-white/40 md:block" />
      <FaGraduationCap className="absolute bottom-16 left-16 hidden text-3xl text-white/40 md:block" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, href }) {
  const content = (
    <div className="border border-line-strong bg-surface p-4 shadow-card transition-colors hover:border-brand-line sm:rounded-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
          <Icon />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink">{value}</p>
          <p className="text-xs font-semibold text-muted">{label}</p>
        </div>
      </div>
      {href && (
        <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong">
          View details <FaArrowRight />
        </span>
      )}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function EmptyPanel({ icon: Icon, title, description, actionHref, actionLabel }) {
  return (
    <div className="card flex min-h-56 flex-col items-center justify-center border-dashed p-4 sm:p-5 text-center">
      <Icon className="text-3xl text-warning" />
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
        {description}
      </p>
      {actionHref && (
        <Link
          href={actionHref}
          className="btn btn-secondary mt-5 inline-flex items-center gap-2 transition-colors"
        >
          {actionLabel}
          <FaArrowRight />
        </Link>
      )}
    </div>
  );
}

function AchievementCard({ achievement }) {
  const recipient =
    achievement.certificateRecipientName ||
    achievement.student?.name ||
    achievement.teamName ||
    "Student";
  const isWinner = achievement.placement === "WINNER";

  return (
    <article className="card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${
            isWinner ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"
          }`}
        >
          {isWinner ? <FaTrophy /> : <FaMedal />}
        </span>
        <div className="min-w-0">
          <span
            className={`badge badge-neutral uppercase ${
              isWinner
                ? "bg-warning-soft text-warning"
                : "bg-surface-2 text-muted"
            }`}
          >
            {formatPlacement(achievement.placement)}
          </span>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-ink">
            {achievement.recipientType !== "TEAM" && achievement.student?._id ? (
              <Link
                href={`/students/${achievement.student._id}`}
                className="hover:text-brand-strong"
              >
                {recipient}
              </Link>
            ) : (
              recipient
            )}
          </h3>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-muted">
            {achievement.title}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatDate(achievement.awardedAt)}
          </p>
          {achievement.certificateUrl && (
            <a
              href={achievement.certificateUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong"
            >
              View certificate
              <FaArrowRight />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function WritingCard({ writing }) {
  const isMagazine = writing.type === "MAGAZINE";

  return (
    <Link
      href={isMagazine ? writing.href || "#writings" : `/writings/${writing._id}`}
      className="card transition-colors hover:border-brand-line hover:bg-surface-2 block min-w-[190px] p-3 text-ink transition-colors hover:border-line"
    >
      {writing.coverImage?.url || writing.images?.some((image) => image?.url) ? (
        <WritingCover coverImage={writing.coverImage} images={writing.images} title={writing.title} className="h-28" />
      ) : (
      <div className="card surface-brand relative h-28 overflow-hidden">
        <div className="card absolute right-8 top-7 h-14 w-24" />
        <FaBookOpen className="absolute right-5 top-5 text-3xl text-white" />
        <FaPenNib className="absolute bottom-5 left-5 text-2xl text-white" />
      </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="badge badge-success uppercase">
          Published
        </span>
        <span className="badge badge-brand uppercase">
          {isMagazine ? "Magazine" : getCategoryLabel(writing.category)}
        </span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-ink">
        {writing.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
        {getPreview(writing.content)}
      </p>
      <WritingTags tags={writing.tags} className="mt-3" />
      <p className="mt-3 text-xs font-semibold text-muted">
        {isMagazine
          ? `${writing.articleCount || 0} selected writings`
          : `By ${writing.authorStudent?.name || "Student"} - ${getReadTime(
              writing.content
            )} min read`}
      </p>
    </Link>
  );
}

function AtGlance({ school, studentCount, teacherCount, grades }) {
  const config = school.schoolConfig || {};
  const gradeSummary =
    formatConfiguredGradeRange(config) || formatGradeSummary(grades);
  const schoolType =
    formatConfigLabel(config.schoolType) ||
    formatConfigLabel(config.schoolLevel?.type) ||
    formatConfigLabel(config.levelType);
  const medium =
    formatConfigLabel(config.medium) ||
    formatConfigLabel(config.instructionMedium);

  const items = [
    ["Principal", school.principalName],
    ["Grades", gradeSummary],
    ["Total Students", studentCount ? String(studentCount) : ""],
    ["Teachers", teacherCount ? String(teacherCount) : ""],
    ["School Type", schoolType],
    ["Medium", medium],
  ].filter(([, value]) => value);

  return (
    <section className="card p-4">
      <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
        <FaSchool className="text-brand-strong" />
        School at a Glance
      </h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm font-semibold text-muted">
            Public school details are not available yet.
          </p>
        ) : items.map(([label, value]) => {
          const isExcessOnMobile = ["Total Students", "Teachers"].includes(label);
          return (
            <div
              key={label}
              className={`items-center justify-between gap-4 ${
                isExcessOnMobile ? "hidden sm:flex" : "flex"
              }`}
            >
              <span className="text-sm font-semibold text-muted">{label}</span>
              <strong className="text-right text-sm text-ink">{value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SocialIconLinks({ entries, variant = "light" }) {
  if (!entries || entries.length === 0) return null;
  const base =
    variant === "dark"
      ? "border-white/30 bg-white/15 text-white hover:bg-white/25"
      : "border-line-strong bg-surface text-muted";
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(({ key, label, icon: Icon, url, hover }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          title={label}
          className={`btn-icon btn-ghost flex items-center justify-center transition-colors ${base} ${hover}`}
        >
          <Icon />
        </a>
      ))}
    </div>
  );
}

function ConnectCard({ websiteUrl, socialLinks, contactEmail, contactPhone }) {
  const socialEntries = getSocialEntries(socialLinks);
  const links = [
    websiteUrl && {
      icon: FaGlobe,
      label: "Website",
      value: websiteUrl.replace(/^https?:\/\//i, ""),
      href: ensureHttp(websiteUrl),
    },
    contactEmail && {
      icon: FaEnvelope,
      label: "Email",
      value: contactEmail,
      href: `mailto:${contactEmail}`,
    },
    contactPhone && {
      icon: FaPhone,
      label: "Phone",
      value: contactPhone,
      href: `tel:${contactPhone.replace(/\s+/g, "")}`,
    },
  ].filter(Boolean);

  if (links.length === 0 && socialEntries.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
        <FaGlobe className="text-brand-strong" />
        Connect
      </h2>
      {links.length > 0 && (
        <div className="mt-4 space-y-2">
          {links.map(({ icon: Icon, label, value, href }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="btn btn-secondary flex items-center gap-3 transition-colors"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface text-brand-strong shadow-card">
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                  {label}
                </span>
                <span className="block truncate text-sm font-semibold text-ink">
                  {value}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
      {socialEntries.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">
            Follow us
          </p>
          <SocialIconLinks entries={socialEntries} variant="light" />
        </div>
      )}
    </section>
  );
}

export default async function PublicSchoolPage({ params }) {
  const resolvedParams = await params;
  const data = await getSchoolData(resolvedParams.id);

  if (!data) {
    return (
      <main className="min-h-screen bg-surface-2 pb-32 text-ink md:pb-0">
        <PublicSiteNav active="schools" />
        <div className="mx-auto max-w-5xl p-0 sm:p-6">
          <p className="rounded-card border border-line-strong bg-surface p-4 sm:p-5 text-muted">
            School not found.
          </p>
        </div>
      </main>
    );
  }

  const {
    school,
    profile,
    achievements,
    magazines,
    studentCount,
    teacherCount,
    grades,
  } = data;
  const metrics = profile?.highlightMetrics || {};
  const coverImage = normalizeImageUrl(profile?.coverImageUrl);
  const bannerImage = normalizeImageUrl(profile?.bannerImageUrl);
  const socialEntries = getSocialEntries(profile?.socialLinks);
  const websiteUrl = profile?.websiteUrl || school.website || "";
  const motto = profile?.motto || "";
  return (
    <main className="min-h-screen bg-surface-2 pb-24 text-ink">
      <PublicSiteNav active="schools" />

      <div className="mx-auto grid max-w-[1500px] gap-5 px-0 py-5 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="schools" variant="school" />

        <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
          <div className="flex items-center gap-2">
            <Link href="/" className="hover:text-brand-strong">
              Home
            </Link>
            <span>/</span>
            <Link href="/schools" className="hover:text-brand-strong">
              Schools
            </Link>
            <span>/</span>
            <span>{school.schoolName}</span>
          </div>
          <div className="flex gap-2">
            <PublicShareButton
              href={`/schools/${school._id}`}
              title={school.schoolName}
              label="Share Profile"
              className="inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-3 py-2 text-brand-strong transition-colors hover:bg-surface"
            />
          </div>
        </div>

        <section
          id="overview"
          className="scroll-mt-28 relative left-1/2 w-screen -translate-x-1/2 overflow-hidden border border-line-strong bg-surface shadow-pop sm:left-auto sm:w-auto sm:translate-x-0 sm:rounded-card"
        >
          <div className="relative min-h-[360px]">
            {bannerImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <HeroFallbackArt />
            )}
            <div className="absolute inset-0" />
            <div className="relative z-10 grid min-h-[360px] gap-4 p-4 md:p-6 lg:items-end">
              <div className="self-end rounded-card border border-white/15 bg-black/25 p-4 backdrop-blur-sm md:p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="card flex h-24 w-24 items-center justify-center overflow-hidden text-3xl font-semibold text-brand shadow-pop">
                    {coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverImage}
                        alt={`${school.schoolName} logo`}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      (school.schoolName || "S").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h1
                      className="text-3xl font-semibold leading-tight md:text-3xl"
                      style={{ color: "#ffffff" }}
                    >
                      {school.schoolName}
                      <FaCheckCircle className="ml-3 inline text-2xl text-success" />
                    </h1>
                    <p
                      className="mt-2 max-w-2xl text-sm font-semibold leading-6 md:text-base"
                      style={{ color: "rgba(255,255,255,0.96)" }}
                    >
                      {profile?.tagline ||
                        "A school building identity through talent, activities, and showcases."}
                    </p>
                    {motto && (
                      <p
                        className="mt-1.5 text-sm font-semibold italic"
                        style={{ color: "rgba(255,255,255,0.82)" }}
                      >
                        &ldquo;{motto}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className="mt-5 flex flex-wrap items-center gap-4 text-sm font-semibold"
                  style={{ color: "rgba(255,255,255,0.94)" }}
                >
                  {school.principalName && (
                    <span className="inline-flex items-center gap-2">
                      <FaUserTie /> {school.principalName}
                    </span>
                  )}
                  {school.schoolLocation && (
                    <span className="inline-flex items-center gap-2">
                      <FaMapMarkerAlt /> {school.schoolLocation}
                    </span>
                  )}
                  {school.establishedYear && (
                    <span>Established {school.establishedYear}</span>
                  )}
                  {websiteUrl && (
                    <a
                      href={ensureHttp(websiteUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 hover:text-white"
                    >
                      <FaGlobe /> Visit website
                    </a>
                  )}
                </div>

                {socialEntries.length > 0 && (
                  <div className="mt-4">
                    <SocialIconLinks entries={socialEntries} variant="dark" />
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

        <section className="relative left-1/2 grid w-screen -translate-x-1/2 grid-cols-2 gap-4 sm:left-auto sm:w-auto sm:translate-x-0">
          <MetricCard
            icon={FaTrophy}
            label="Awards Earned"
            value={metrics.awardsCount || achievements.length || 0}
            href="#achievements"
          />
          <MetricCard
            icon={FaGraduationCap}
            label="Students Recognized"
            value={studentCount || 0}
          />
        </section>

        <div className="relative left-1/2 grid w-screen -translate-x-1/2 gap-5 sm:left-auto sm:w-auto sm:translate-x-0 lg:grid-cols-[minmax(0,1fr)_420px]">
          <main className="space-y-4">
            <section
              id="story"
              className="scroll-mt-28 border border-line-strong bg-surface p-4 shadow-card sm:rounded-card"
            >
              <h2 className="text-lg font-semibold text-ink">
                School Story
              </h2>
              <div className="mt-4">
                <ExpandableStoryText
                  text={
                    profile?.summary ||
                    "This school has not added a public showcase summary yet. The profile will grow as verified results and achievements are published."
                  }
                  limit={120}
                />
              </div>
            </section>

            <section
              id="achievements"
              className="scroll-mt-28 border border-line-strong bg-surface p-4 shadow-card sm:rounded-card"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
                  <FaTrophy className="text-warning" />
                  Achievements
                </h2>
                <Link href="/events" className="text-sm font-semibold text-brand-strong">
                  View all achievements
                </Link>
              </div>
              {achievements.length === 0 ? (
                <div className="mt-5">
                  <EmptyPanel
                    icon={FaTrophy}
                    title="No public achievements yet"
                    description="Published certificates and event results will appear here."
                    actionHref="/events"
                    actionLabel="Explore events"
                  />
                </div>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {achievements.slice(0, 4).map((achievement) => (
                    <AchievementCard
                      key={achievement._id}
                      achievement={achievement}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4">
            <div id="glance" className="scroll-mt-28">
                  <AtGlance
                    school={school}
                    studentCount={studentCount}
                    teacherCount={teacherCount}
                    grades={grades}
                  />
            </div>
            <ConnectCard
              websiteUrl={websiteUrl}
              socialLinks={profile?.socialLinks}
              contactEmail={profile?.contactEmail}
              contactPhone={profile?.contactPhone}
            />
          </aside>
        </div>

        <section
          id="writings"
          className="surface-brand scroll-mt-28 relative left-1/2 w-screen -translate-x-1/2 border border-line p-4 shadow-card sm:left-auto sm:w-auto sm:translate-x-0 sm:rounded-card"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-white">
              <FaBookOpen className="text-white" />
              School Magazines
            </h2>
          </div>
          {magazines.length === 0 ? (
            <div className="mt-5">
              <EmptyPanel
                icon={FaBookOpen}
                title="No public magazines yet"
                description="Published school magazine issues will appear here after the school adds them to home."
                actionHref="/student-voices"
                actionLabel="Explore student voices"
              />
            </div>
          ) : (
            <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
              {magazines.map((magazine) => (
                <WritingCard key={magazine._id} writing={magazine} />
              ))}
            </div>
          )}
        </section>

        <section className="surface-brand relative left-1/2 w-screen -translate-x-1/2 overflow-hidden p-5 shadow-pop sm:left-auto sm:w-auto sm:translate-x-0 sm:rounded-card">
          <div className="absolute inset-0" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-white/30 bg-white/15 text-xl text-white"
                aria-hidden="true"
              >
                <FaStar />
              </span>
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "#ffffff" }}
                >
                  Showcase your school to a wider community
                </h2>
                <p
                  className="mt-1 text-sm font-semibold leading-6"
                  style={{ color: "rgba(255,255,255,0.9)" }}
                >
                  Achievements and magazines help more students discover
                  your school story.
                </p>
              </div>
            </div>
            <Link
              href="/register"
              className="btn btn-ghost inline-flex items-center justify-center gap-2 transition-colors"
              style={{ color: "var(--color-brand)" }}
            >
              Register school
              <FaArrowRight />
            </Link>
          </div>
        </section>
        </div>
      </div>

      <footer className="border-t border-line-strong px-4 py-6 text-center text-sm text-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} Praavyo. Student talent, school recognition, public events, and verified certificates.{" "}
            <Link href="/privacy" className="font-semibold hover:text-brand-strong">Privacy</Link>
            {" · "}
            <Link href="/terms" className="font-semibold hover:text-brand-strong">Terms</Link>
            {" · "}
            <Link href="/contact" className="font-semibold hover:text-brand-strong">Contact</Link>
          </p>
          {socialEntries.length > 0 ? (
            <SocialIconLinks entries={socialEntries} variant="light" />
          ) : (
            <div className="flex justify-center gap-4 text-brand-strong">
              <FaFacebookF />
              <FaTwitter />
              <FaInstagram />
              <FaYoutube />
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}
