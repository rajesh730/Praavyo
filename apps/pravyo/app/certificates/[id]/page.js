import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import connectDB from "@/lib/db";
import Achievement from "@/models/Achievement";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { isActiveCertificateRecord } from "@/lib/certificates";
import CertificatePrintActions from "@/components/certificates/CertificatePrintActions";
import CertificateSheet, {
  resolveEventOwnership,
} from "@/components/certificates/CertificateSheet";
import CertificateViewport from "@/components/certificates/CertificateViewport";
import "@/models/Event";
import "@/models/PerformanceProgram";
import "@/models/Training";
import ParentStudentLink from "@/models/ParentStudentLink";

export const dynamic = "force-dynamic";

async function getCertificate(id) {
  await connectDB();

  const achievement = await Achievement.findById(id)
    .populate("student", "name grade")
    .populate("captainStudent", "name grade")
    .populate("school", "schoolName")
    .populate({
      path: "event",
      select:
        "title eventType eventOwnershipType date visibility participationFormat eventScope resultsPublished",
    })
    .populate("program", "title date venue certificatesPublishedAt")
    .populate("training", "title duration audience")
    .lean();

  if (!achievement?.school?._id) {
    return achievement;
  }

  const schoolProfile = await SchoolShowcaseProfile.findOne({
    school: achievement.school._id,
  })
    .select("logoUrl coverImageUrl")
    .lean();

  return {
    ...achievement,
    schoolProfile: schoolProfile || null,
  };
}

/* ---------- access control ---------- */

// Program (performance) and training certificates are private: the student
// (or, for a training, the teacher) it was issued to, the student's own
// linked guardians, and the school's staff. Never public.
async function canViewProgramCertificate({ achievement, session }) {
  const role = session?.user?.role;
  const userId = String(session?.user?.id || "");
  const schoolId = String(achievement.school?._id || achievement.school || "");
  const studentId = String(achievement.student?._id || achievement.student || "");
  const teacherId = String(achievement.teacher?._id || achievement.teacher || "");

  if (role === "SUPER_ADMIN") return true;
  if (role === "SCHOOL_ADMIN") return userId === schoolId;
  if (role === "TEACHER") {
    // A teacher keeps their own training certificate after moving school.
    return (teacherId && userId === teacherId) || String(session?.user?.schoolId || "") === schoolId;
  }
  if (role === "STUDENT") return userId === studentId;
  if (role === "PARENT" && studentId) {
    const link = await ParentStudentLink.exists({
      parent: userId,
      student: studentId,
      status: "ACTIVE",
    });
    return Boolean(link);
  }
  return false;
}

function canViewCertificate({ achievement, session }) {
  if (isActiveCertificateRecord(achievement) && achievement?.event?.resultsPublished) {
    return true;
  }

  const ownershipType = resolveEventOwnership(achievement.event);
  if (ownershipType !== "SCHOOL_EVENT") return true;

  const role = session?.user?.role;
  const userId = String(session?.user?.id || "");
  const userSchoolId = String(session?.user?.schoolId || session?.user?.id || "");
  const certificateSchoolId = String(
    achievement.school?._id || achievement.school || ""
  );
  const certificateStudentId = String(
    achievement.student?._id || achievement.student || ""
  );

  if (role === "SUPER_ADMIN") return true;
  if (role === "SCHOOL_ADMIN") return userSchoolId === certificateSchoolId;
  if (role === "TEACHER")
    return String(session?.user?.schoolId || "") === certificateSchoolId;
  if (role === "STUDENT") return userId === certificateStudentId;

  return false;
}

export default async function CertificatePage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const [achievement, session] = await Promise.all([
    getCertificate(resolvedParams.id),
    getServerSession(authOptions),
  ]);
  const isPreviewMode = resolvedSearchParams?.preview === "1";
  const isBulkMode = resolvedSearchParams?.bulk === "1";
  // Opened in the dashboard's certificate viewer: the viewer has its own close
  // button, so the page drops its "Back to platform" link.
  const isEmbedded = resolvedSearchParams?.embed === "1";
  const canPreviewCertificate = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"].includes(
    session?.user?.role
  );
  const isTrainingCertificate = Boolean(achievement?.training);
  // Program and training certificates share the private access rule.
  const isProgramCertificate = Boolean(achievement?.program) || isTrainingCertificate;
  const certificateActive =
    isActiveCertificateRecord(achievement) &&
    Boolean(
      isTrainingCertificate
        ? true // issued only when Praavyo completes the school's training
        : achievement?.program
          ? achievement.program?.certificatesPublishedAt
          : achievement?.event?.resultsPublished
    );

  if (
    !achievement ||
    (!certificateActive && (!isPreviewMode || !canPreviewCertificate))
  ) {
    notFound();
  }

  if (
    isProgramCertificate
      ? !(await canViewProgramCertificate({ achievement, session }))
      : !canViewCertificate({ achievement, session })
  ) {
    notFound();
  }

  // `pdf` from a link, `1` from a hidden-frame download: both save a PDF file.
  const autoDownload = ["pdf", "1"].includes(resolvedSearchParams?.download);

  const isTeamCertificate =
    String(achievement.event?.participationFormat || "INDIVIDUAL").toUpperCase() ===
      "TEAM" || Boolean(achievement.teamName);
  const eventTitle =
    achievement.training?.title || achievement.program?.title || achievement.event?.title || achievement.title || "Event";
  const teamLabel =
    achievement.teamName || achievement.certificateRecipientName || "School Team";

  return (
    <main
      className={`certificate-print-page min-h-screen text-ink print:min-h-0 print:bg-surface print:p-0 ${
        isBulkMode ? "bg-surface p-0" : "bg-surface-2 px-4 py-8"
      }`}
    >
      <div className="mx-auto w-full max-w-[794px] print:max-w-none">
        {/* screen-only action bar */}
        {!isBulkMode && (
        <div className={`mb-6 flex flex-col gap-4 print:hidden sm:flex-row sm:items-center ${isEmbedded ? "sm:justify-end" : "sm:justify-between"}`}>
          {!isEmbedded && (
            // `/` sends a signed-in visitor to their own dashboard (proxy.js).
            <Link
              href="/"
              className="text-sm font-semibold text-ink transition-colors hover:text-ink"
            >
              ← Back to platform
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isPreviewMode && !certificateActive && (
              <span className="badge badge-warning text-xs">
                Preview — not yet issued
              </span>
            )}
            <CertificatePrintActions
              autoDownload={autoDownload}
              fileName={`${
                isTeamCertificate
                  ? teamLabel
                  : achievement.certificateRecipientName ||
                    achievement.student?.name ||
                    "Certificate"
              } - ${eventTitle}`}
            />
          </div>
        </div>
        )}

        {/* certificate sheet */}
        <CertificateViewport>
          <CertificateSheet achievement={achievement} />
        </CertificateViewport>

        {/* screen-only supplementary details (kept out of the printed sheet) */}
        {(achievement.totalScore > 0 || isTeamCertificate || achievement.description) && (
          <div className="mt-6 space-y-4 print:hidden">
            {achievement.description && (
              <div className="card p-5 text-sm text-ink">
                {achievement.description}
              </div>
            )}

            {isTeamCertificate && (
              <div className="rounded-card border border-line bg-brand-soft p-5">
                <p className="text-xs font-semibold uppercase text-brand-strong">
                  Team Certificate Context
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  This certificate represents the official result recorded for the team{" "}
                  <span className="font-semibold text-brand-strong">{teamLabel}</span> in{" "}
                  <span className="font-semibold text-brand-strong">{eventTitle}</span>.
                  {achievement.captainStudent?.name
                    ? ` Captain: ${achievement.captainStudent.name}.`
                    : ""}
                </p>
              </div>
            )}

            {achievement.totalScore > 0 && (
              <div className="rounded-card border border-success-line bg-success-soft p-5">
                <p className="text-xs font-semibold uppercase text-success">Score Summary</p>
                <p className="mt-2 text-2xl font-semibold text-success">
                  {achievement.totalScore} points
                  {achievement.scorePercentage > 0
                    ? ` · ${achievement.scorePercentage}%`
                    : ""}
                </p>
                {achievement.scorecard?.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {achievement.scorecard.map((entry) => (
                      <div
                        key={`${entry.label}-${entry.maxScore}`}
                        className="card p-4"
                      >
                        <p className="font-semibold text-ink">{entry.label}</p>
                        <p className="mt-1 text-sm text-muted">
                          {entry.score} / {entry.maxScore}
                        </p>
                        {entry.comment && (
                          <p className="mt-2 text-xs text-muted">{entry.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
