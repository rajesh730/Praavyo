"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck as FaCertificate, Download as FaDownload, ExternalLink as FaExternalLinkAlt } from "lucide-react";
import { formatPlacement as formatLabel } from "@/lib/displayFormat";
import AppDate from "@/components/common/AppDate";
import PdfDownloadLink from "@pravyo/cas/components/PdfDownloadLink";

export default function StudentEventCertificatesPanel({ eventId }) {
  const [certificates, setCertificates] = useState([]);
  const [resultState, setResultState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCertificates = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/events/${eventId}/certificates/student`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load certificates.");
      }
      setCertificates(Array.isArray(data.certificates) ? data.certificates : []);
      setResultState(data.resultState || "");
    } catch (loadError) {
      setError(loadError.message || "Failed to load certificates.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (eventId) void loadCertificates();
  }, [eventId, loadCertificates]);

  if (loading) {
    return (
      <div className="card mt-4 p-4 text-sm font-semibold text-muted">
        Loading your result and certificate...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-card border border-danger-line bg-danger-soft p-4 text-sm font-semibold text-danger">
        {error}
      </div>
    );
  }

  return (
    <div className="card mt-4 p-4">
      <h5 className="flex items-center gap-2 text-base font-semibold text-ink">
        <FaCertificate className="text-warning" />
        Your Result & Certificate
      </h5>

      {certificates.length === 0 ? (
        <p className="mt-2 text-sm font-semibold text-muted">
          {resultState || "No certificate is assigned to your account yet."}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {certificates.map((certificate) => (
            <article
              key={certificate._id}
              className="card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-warning text-xs">
                  {formatLabel(certificate.placement)}
                </span>
                {certificate.certificateCode && (
                  <span className="badge badge-neutral text-xs">
                    {certificate.certificateCode}
                  </span>
                )}
              </div>
              <h6 className="mt-3 text-sm font-semibold text-ink">
                {certificate.certificateRecipientName || "Student Certificate"}
              </h6>
              <p className="mt-1 text-xs font-semibold text-muted">
                {certificate.teamName ? (
                  <>
                    {certificate.teamName} -{" "}
                    <AppDate value={certificate.certificateIssuedAt} />
                  </>
                ) : (
                  <AppDate value={certificate.certificateIssuedAt} />
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={certificate.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary inline-flex items-center justify-center gap-2"
                >
                  <FaExternalLinkAlt />
                  Open Certificate
                </Link>
                <PdfDownloadLink
                  href={`${certificate.certificateUrl}?download=pdf`}
                  className="btn btn-secondary inline-flex items-center justify-center gap-2"
                >
                  <FaDownload />
                  Download
                </PdfDownloadLink>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
