import Link from "next/link";
import connectDB from "@/lib/db";
import Achievement from "@/models/Achievement";
import { getActiveCertificateFilter } from "@/lib/certificates";
import { formatPlacementLabel } from "@/lib/results";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import AppDate from "@/components/common/AppDate";
import { ArrowRight as FaArrowRight, CircleCheck as FaCheckCircle, Shield as FaShieldAlt, CircleX as FaTimesCircle } from "lucide-react";
import "@/models/Event";
import "@/models/Student";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verify a Certificate",
  description:
    "Confirm the authenticity of a Praavyo certificate using its certificate code.",
};

async function verifyCode(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { state: "EMPTY" };

  await connectDB();

  const achievement = await Achievement.findOne({
    certificateCode: code,
    ...getActiveCertificateFilter(),
  })
    .select(
      "certificateCode certificateUrl certificateIssuedAt placement title recipientType teamName certificateRecipientName"
    )
    .populate("student", "name grade")
    .populate("school", "schoolName")
    .populate("event", "title date resultsPublished")
    .lean();

  if (!achievement || !achievement.event?.resultsPublished) {
    return { state: "INVALID", code };
  }

  const recipient =
    achievement.certificateRecipientName ||
    achievement.teamName ||
    achievement.student?.name ||
    "Recipient";

  return {
    state: "VALID",
    code,
    certificate: {
      recipient,
      placement: formatPlacementLabel(achievement.placement),
      isTeam: String(achievement.recipientType || "STUDENT").toUpperCase() === "TEAM",
      event: achievement.event?.title || achievement.title || "Event",
      school: achievement.school?.schoolName || "School",
      issuedAt: achievement.certificateIssuedAt,
      certificateUrl: achievement.certificateUrl || "",
    },
  };
}

function Field({ label, value }) {
  return (
    <div className="card p-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{value || "—"}</p>
    </div>
  );
}

export default async function VerifyCertificatePage({ searchParams }) {
  const resolved = await searchParams;
  const code = resolved?.code || "";
  const result = await verifyCode(code);

  return (
    <main className="min-h-screen bg-surface-2 pb-24 text-ink">
      <PublicSiteNav active="home" />

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-brand-soft text-2xl text-brand">
            <FaShieldAlt />
          </span>
          <h1 className="mt-4 text-3xl font-semibold text-ink">
            Verify a Certificate
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Enter the certificate code (for example{" "}
            <span className="font-semibold text-ink">EGT-2026-BE3C57</span>) printed
            on the certificate to confirm it was issued and verified by Praavyo.
          </p>
        </div>

        {/* GET form — no client JS required */}
        <form action="/verify" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            name="code"
            defaultValue={code}
            placeholder="Enter certificate code"
            autoComplete="off"
            className="input flex-1 uppercase tracking-wide"
          />
          <button
            type="submit"
            className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
          >
            Verify
          </button>
        </form>

        {result.state === "VALID" && (
          <section className="card mt-4 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-success-line bg-success-soft px-5 py-4">
              <FaCheckCircle className="text-xl text-success" />
              <div>
                <p className="text-sm font-semibold text-success">
                  Verified certificate
                </p>
                <p className="text-xs font-semibold text-success">
                  Code {result.code} is authentic and was issued by Praavyo.
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <Field
                label={result.certificate.isTeam ? "Team" : "Recipient"}
                value={result.certificate.recipient}
              />
              <Field label="Position" value={result.certificate.placement} />
              <Field label="Event" value={result.certificate.event} />
              <Field label="School" value={result.certificate.school} />
              <Field label="Issued On" value={<AppDate value={result.certificate.issuedAt} />} />
              <Field label="Certificate Code" value={result.code} />
            </div>
            {result.certificate.certificateUrl && (
              <div className="border-t border-line px-5 py-4">
                <Link
                  href={result.certificate.certificateUrl}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                >
                  View the certificate
                  <FaArrowRight />
                </Link>
              </div>
            )}
          </section>
        )}

        {result.state === "INVALID" && (
          <section className="mt-4 flex items-start gap-3 rounded-card border border-danger-line bg-danger-soft p-4">
            <FaTimesCircle className="mt-0.5 text-xl text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">
                No verified certificate found
              </p>
              <p className="mt-1 text-sm leading-6 text-danger">
                We couldn&apos;t find an issued certificate for code{" "}
                <span className="font-semibold">{result.code}</span>. Check the code and
                try again — it may be mistyped, or the results may not be published
                yet.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
