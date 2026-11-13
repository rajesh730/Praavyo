import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import connectDB from "@/lib/db";
import Achievement from "@/models/Achievement";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { getActiveCertificateFilter } from "@/lib/certificates";
import BulkPrintBar from "@/components/certificates/BulkPrintBar";
import CertificateSheet from "@/components/certificates/CertificateSheet";
import CertificateViewport from "@/components/certificates/CertificateViewport";
import "@/models/Event";
import "@/models/PerformanceProgram";
import "@/models/Training";

export const dynamic = "force-dynamic";

const MAX_BULK_CERTIFICATES = 80;

function parseIds(value = "") {
  return String(value)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_BULK_CERTIFICATES);
}

function canViewCertificate(achievement, session) {
  const role = session?.user?.role;
  if (role === "SUPER_ADMIN") return true;

  const schoolId = String(achievement.school?._id || achievement.school || "");
  const userSchoolId = String(session?.user?.schoolId || session?.user?.id || "");
  const studentId = String(achievement.student?._id || achievement.student || "");
  const userId = String(session?.user?.id || "");

  if (role === "SCHOOL_ADMIN") return userSchoolId === schoolId;
  if (role === "TEACHER") return String(session?.user?.schoolId || "") === schoolId;
  if (role === "STUDENT") return userId === studentId;

  return false;
}

export default async function BulkCertificatePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const ids = parseIds(resolvedSearchParams?.ids);
  // `pdf` from a link, `1` from a hidden-frame download: both save a PDF file.
  const autoDownload = ["pdf", "1"].includes(resolvedSearchParams?.download);
  const session = await getServerSession(authOptions);

  if (!session || ids.length === 0) {
    notFound();
  }

  await connectDB();

  const certificates = await Achievement.find({
    _id: { $in: ids },
    ...getActiveCertificateFilter(),
  })
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

  const visibleCertificates = certificates.filter((certificate) =>
    canViewCertificate(certificate, session)
  );

  // One batched lookup for every school logo instead of one query per sheet.
  const schoolIds = [
    ...new Set(
      visibleCertificates
        .map((certificate) => certificate.school?._id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const schoolProfiles = schoolIds.length
    ? await SchoolShowcaseProfile.find({ school: { $in: schoolIds } })
        .select("school logoUrl coverImageUrl")
        .lean()
    : [];
  const profileBySchool = new Map(
    schoolProfiles.map((profile) => [String(profile.school), profile])
  );

  const certificateById = new Map(
    visibleCertificates.map((certificate) => [
      String(certificate._id),
      {
        ...certificate,
        schoolProfile:
          profileBySchool.get(String(certificate.school?._id || "")) || null,
      },
    ])
  );
  const orderedCertificates = ids
    .map((id) => certificateById.get(id))
    .filter(Boolean);

  if (orderedCertificates.length === 0) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-surface-2 px-4 py-6 text-ink print:min-h-0 print:bg-surface print:p-0">
      <div className="mx-auto w-full max-w-[794px] print:max-w-none">
        <BulkPrintBar
          count={orderedCertificates.length}
          autoDownload={autoDownload}
          fileName={`${
            orderedCertificates[0].event?.title || "Event"
          } certificates`}
        />

        <div className="space-y-4 print:space-y-0">
          {orderedCertificates.map((certificate) => (
            <div key={String(certificate._id)} className="certificate-print-page">
              <CertificateViewport>
                <CertificateSheet achievement={certificate} />
              </CertificateViewport>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
