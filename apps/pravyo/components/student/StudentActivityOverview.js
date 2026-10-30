"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award as FaAward, BookOpen as FaBookOpen, CalendarDays as FaCalendarAlt, BadgeCheck as FaCertificate, Check as FaCheck, Download as FaDownload, ExternalLink as FaExternalLinkAlt, Earth as FaGlobeAsia, House as FaHome, PenTool as FaPenNib, School as FaSchool, Share2 as FaShareAlt, X as FaTimes, Trophy as FaTrophy, CircleUser as FaUserCircle } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import StatTile from "@/components/ui/StatTile";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import { formatPlacement, formatDate } from "@/lib/displayFormat";
import Glyph from "@/components/ui/Glyph";
import PdfDownloadLink from "@pravyo/cas/components/PdfDownloadLink";

const CELEBRATION_WINDOW_DAYS = 30;
const CELEBRATION_DISMISS_KEY = "pravyo:celebrated-certificates";

function formatWritingLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRecentlyIssued(value) {
  if (!value) return false;
  const issued = new Date(value).getTime();
  if (Number.isNaN(issued)) return false;
  const ageDays = (Date.now() - issued) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= CELEBRATION_WINDOW_DAYS;
}

function CelebrationBanner({ achievement, firstName, onDismiss }) {
  const placement = formatPlacement(achievement.placement);
  const eventTitle = achievement.event?.title || achievement.title || "an event";
  const isWin = ["WINNER", "RUNNER_UP", "THIRD_PLACE"].includes(
    String(achievement.placement || "").toUpperCase()
  );

  return (
    <section className="surface-brand relative overflow-hidden rounded-card p-5 shadow-card">
      <div className="pointer-events-none absolute -right-6 -top-8 opacity-15">
        <Glyph emoji="🎉" />
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="btn-icon btn-ghost absolute right-3 top-3 flex items-center justify-center transition-colors"
      >
        <FaTimes className="text-xs" />
      </button>

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-2xl">
            {isWin ? "🏆" : "🎓"}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white">
              Congratulations{firstName ? `, ${firstName}` : ""}!
            </p>
            <h2 className="mt-1 font-semibold leading-tight">
              You earned a {placement} certificate in {eventTitle}
            </h2>
            <p className="mt-1 text-sm font-semibold text-white">
              Your verified certificate is ready to view, download, and share.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={achievement.certificateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaCertificate /> View
          </Link>
          <PdfDownloadLink
            href={`${achievement.certificateUrl}?download=pdf`}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaDownload /> Download
          </PdfDownloadLink>
        </div>
      </div>
    </section>
  );
}

function SchoolIdentityCard({ student }) {
  if (!student?.schoolName) return null;

  const details = [
    student.grade ? `Grade ${student.grade}` : "",
    student.rollNumber ? `Roll ${student.rollNumber}` : "",
    student.iemisNumber ? `IEMIS ${student.iemisNumber}` : "",
    student.schoolLocation,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="card flex items-center gap-4 p-4">
      <SchoolLogoMark
        imageUrl={student.schoolLogoUrl}
        name={student.schoolName}
        className="h-14 w-14"
        shapeClassName="rounded-card"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
          School
        </p>
        <h2 className="truncate font-semibold text-ink">
          {student.schoolName}
        </h2>
        {details && (
          <p className="mt-0.5 truncate text-sm font-semibold text-muted">
            {details}
          </p>
        )}
      </div>
    </section>
  );
}

function PublicProfileCard({ studentId, name }) {
  const [copied, setCopied] = useState(false);
  const href = `/students/${studentId}`;

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}${href}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      /* clipboard unavailable */
    }
  };

  return (
    <section className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-2 text-xl text-brand-strong">
          <FaUserCircle />
        </span>
        <div>
          <h2 className="font-semibold text-ink">
            Your public profile is live
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            Share a verified portfolio of {name ? `${name}'s` : "your"} achievements,
            certificates, and writing with family and the world.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
        >
          <FaExternalLinkAlt /> View profile
        </Link>
        <button
          type="button"
          onClick={copyLink}
          className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
        >
          {copied ? <FaCheck className="text-success" /> : <FaShareAlt />}
          {copied ? "Link copied" : "Share"}
        </button>
      </div>
    </section>
  );
}

function CertificatesAndAchievements({ achievements }) {
  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-2 text-brand-strong">
          <FaCertificate />
        </span>
        <div>
          <h2 className="font-semibold text-ink">
            My Certificates & Achievements
          </h2>
          <p className="text-sm font-semibold text-muted">
            Verified results and issued certificates from your school.
          </p>
        </div>
      </div>

      {achievements.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={FaTrophy}
            title="No achievements yet"
            description="When your school publishes verified results, they will appear here."
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {achievements.map((certificate) => (
            <article
              key={certificate.id}
              className="card flex min-w-0 flex-col gap-3 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-xl text-warning shadow-card">
                  <Glyph emoji="🎓" />
                </span>
                <span className="badge badge-neutral uppercase">
                  {formatPlacement(certificate.placement)}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="break-words font-semibold leading-snug text-ink">
                  {certificate.event?.title || certificate.title}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <FaCalendarAlt className="text-brand-strong" />
                  {formatDate(certificate.certificateIssuedAt || certificate.awardedAt)}
                </p>
                {certificate.certificateCode ? (
                  <p className="mt-1 break-all text-2xs font-semibold uppercase tracking-wide text-subtle">
                    ID: {certificate.certificateCode}
                  </p>
                ) : (
                  <p className="mt-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
                    Certificate not issued yet
                  </p>
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {certificate.certificateUrl ? (
                  <>
                    <Link
                      href={certificate.certificateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm inline-flex flex-1 items-center justify-center gap-1.5 transition-colors"
                    >
                      <FaCertificate /> View Certificate
                    </Link>
                    <PdfDownloadLink
                      href={`${certificate.certificateUrl}?download=pdf`}
                      className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <FaDownload /> Download PDF
                    </PdfDownloadLink>
                  </>
                ) : (
                  <span className="badge badge-neutral inline-flex w-full items-center justify-center border-dashed text-xs">
                    Certificate pending
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WritingInsightTile({ icon: Icon, label, value, description }) {
  return (
    <div className="card min-w-0 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface text-brand-strong shadow-card">
          <Icon />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none text-ink">
            {value || 0}
          </p>
          <h3 className="mt-1 break-words font-semibold leading-snug text-ink">
            {label}
          </h3>
          {description && (
            <p className="mt-1 text-xs font-semibold leading-5 text-muted">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WritingActivityInsights({ summary }) {
  const safeSummary = summary || {};
  const destinations = safeSummary.destinations || {};
  const status = safeSummary.status || {};
  const categories = safeSummary.categories || {};
  const categoryEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-2 text-brand-strong">
            <FaPenNib />
          </span>
          <div>
            <h2 className="font-semibold text-ink">
              My Writing Activity
            </h2>
            <p className="text-sm font-semibold text-muted">
              Your writing count by review status and publishing destination.
            </p>
          </div>
        </div>
        <span className="badge badge-neutral text-xs">
          {safeSummary.total || 0} total writings
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WritingInsightTile
          icon={FaPenNib}
          label="Total Writings"
          value={safeSummary.total}
          description="All drafts, submissions, and approved pieces."
        />
        <WritingInsightTile
          icon={FaCheck}
          label="Approved"
          value={safeSummary.approved}
          description="Reviewed and accepted by your school."
        />
        <WritingInsightTile
          icon={FaBookOpen}
          label="Pending Review"
          value={safeSummary.pendingReview}
          description="Submitted writings waiting for review."
        />
        <WritingInsightTile
          icon={FaTimes}
          label="Rejected"
          value={safeSummary.rejected}
          description="Returned by the school reviewer."
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WritingInsightTile
          icon={FaSchool}
          label="School Wall"
          value={destinations.schoolWall}
          description="Visible in your school's writing feed."
        />
        <WritingInsightTile
          icon={FaHome}
          label="Featured Homepage"
          value={destinations.homepage}
          description="Selected for the main public homepage."
        />
        <WritingInsightTile
          icon={FaBookOpen}
          label="School Magazine"
          value={destinations.magazine}
          description="Published in a magazine issue."
        />
        <WritingInsightTile
          icon={FaGlobeAsia}
          label="Global Wall"
          value={destinations.globalWall}
          description="Visible in the public student writing feed."
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="font-semibold text-ink">Review Status</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map((key) => (
              <span
                key={key}
                className="badge badge-neutral text-xs"
              >
                {formatWritingLabel(key)}: {status[key] || 0}
              </span>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="font-semibold text-ink">Writing Types</h3>
          {categoryEntries.length === 0 ? (
            <p className="mt-3 text-xs font-semibold text-muted">
              No writing categories yet.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryEntries.map(([key, count]) => (
                <span
                  key={key}
                  className="badge badge-neutral text-xs"
                >
                  {formatWritingLabel(key)}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function StudentActivityOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dismissedCertificates, setDismissedCertificates] = useState(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CELEBRATION_DISMISS_KEY);
      setDismissedCertificates(new Set(stored ? JSON.parse(stored) : []));
    } catch (_error) {
      setDismissedCertificates(new Set());
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("/api/student/activity-summary", {
          cache: "no-store",
        });
        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload.message || "Failed to load activity");
        }

        if (active) setData(payload.data || null);
      } catch (loadError) {
        if (active) setError(loadError.message || "Failed to load activity");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <LoadingState
        title="Loading activity"
        message="Preparing your achievements."
      />
    );
  }

  if (error) {
    return (
      <AlertBanner
        type="error"
        title="Unable to load activity"
        message={error}
      />
    );
  }

  const metrics = data?.metrics || {};
  const achievements = data?.achievements || [];
  const firstName = String(data?.student?.name || "").trim().split(/\s+/)[0] || "";

  // Celebrate the most recent, recently-issued certificate the student hasn't
  // dismissed yet — turning a published result into a real moment.
  const celebration = !dismissedCertificates
    ? null
    : achievements
        .filter(
          (achievement) =>
            achievement.certificateUrl &&
            isRecentlyIssued(achievement.certificateIssuedAt) &&
            !dismissedCertificates.has(achievement.id)
        )
        .sort(
          (a, b) =>
            new Date(b.certificateIssuedAt).getTime() -
            new Date(a.certificateIssuedAt).getTime()
        )[0] || null;

  const dismissCelebration = (id) => {
    setDismissedCertificates((prev) => {
      const next = new Set(prev || []);
      next.add(id);
      try {
        window.localStorage.setItem(
          CELEBRATION_DISMISS_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch (_error) {
        /* ignore storage errors */
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SchoolIdentityCard student={data?.student} />

      {celebration && (
        <CelebrationBanner
          achievement={celebration}
          firstName={firstName}
          onDismiss={() => dismissCelebration(celebration.id)}
        />
      )}

      {data?.publicProfileAvailable && data?.student?.id && (
        <PublicProfileCard studentId={data.student.id} name={firstName} />
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={FaTrophy} accent="amber" label="Achievements" value={metrics.achievementsCount || 0} />
        <StatTile icon={FaAward} accent="amber" label="Wins" value={metrics.winsCount || 0} />
        <StatTile icon={FaAward} accent="indigo" label="Finalist" value={metrics.finalistCount || 0} />
        <StatTile icon={FaCertificate} accent="purple" label="Certificates" value={metrics.certificatesCount || 0} />
      </section>

      <WritingActivityInsights summary={data?.writingSummary} />

      <CertificatesAndAchievements achievements={achievements} />
    </div>
  );
}
