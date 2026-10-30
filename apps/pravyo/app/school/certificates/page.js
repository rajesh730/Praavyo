"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { BadgeCheck as FaCertificate, Search as FaSearch } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import AppDate from "@/components/common/AppDate";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";

function recipientName(certificate) {
  return (
    certificate.certificateRecipientName ||
    certificate.teamName ||
    certificate.student?.name ||
    certificate.captainStudent?.name ||
    "School recipient"
  );
}

function readablePlacement(value) {
  return String(value || "PARTICIPANT")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SchoolCertificatesPage() {
  const { data: session, status } = useSession();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/school/certificates", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Certificates could not load.");
      setCertificates(payload.certificates || []);
    } catch (loadError) {
      setError(loadError.message || "Certificates could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "SCHOOL_ADMIN") {
      void loadCertificates();
    } else if (status !== "loading") {
      setLoading(false);
    }
  }, [loadCertificates, session?.user?.role, status]);

  const visibleCertificates = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return certificates;
    return certificates.filter((certificate) =>
      [
        recipientName(certificate),
        certificate.event?.title,
        certificate.title,
        certificate.certificateCode,
        certificate.placement,
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [certificates, query]);

  return (
    <DashboardLayout>
      <PageHeader
        icon={FaCertificate}
        eyebrow="Recognition"
        title="Certificates"
        description="Find and open certificates issued to your students and school teams."
      />

      {!loading && session?.user?.role !== "SCHOOL_ADMIN" ? (
        <div className="mt-5">
          <AlertBanner
            type="error"
            title="School administrator access required"
            message="Only a school administrator can view the school's certificate register."
          />
        </div>
      ) : loading ? (
        <div className="mt-5">
          <LoadingState title="Loading certificates" message="Preparing the certificate register." />
        </div>
      ) : error ? (
        <div className="mt-5">
          <EmptyState title="Certificates unavailable" description={error} actionLabel="Try again" onAction={loadCertificates} />
        </div>
      ) : certificates.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No certificates yet" description="Issued event certificates will appear here automatically." />
        </div>
      ) : (
        <section className="mt-5 space-y-4">
          <label className="card transition-colors hover:border-brand-line hover:bg-surface-2 flex max-w-xl items-center gap-3 px-4 py-3">
            <FaSearch className="shrink-0 text-muted" aria-hidden="true" />
            <span className="sr-only">Search certificates</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipient, event, placement, or code"
              className="input w-full"
            />
          </label>

          {visibleCertificates.length === 0 ? (
            <EmptyState title="No matching certificates" description="Try a recipient name, event, placement, or certificate code." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleCertificates.map((certificate) => (
                <article key={certificate._id} className="card p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-warning-soft text-warning">
                      <FaCertificate aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-ink">{recipientName(certificate)}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-muted">
                        {certificate.event?.title || certificate.title || "Certificate"}
                      </p>
                    </div>
                    <span className="badge badge-brand text-xs">
                      {readablePlacement(certificate.placement)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                    <p className="text-xs font-semibold text-muted">
                      Issued <AppDate value={certificate.certificateIssuedAt || certificate.awardedAt} />
                      {certificate.certificateCode ? ` · ${certificate.certificateCode}` : ""}
                    </p>
                    <Link href={`/certificates/${certificate._id}`} className="btn btn-primary transition-colors">
                      Open certificate
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </DashboardLayout>
  );
}
