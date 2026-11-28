"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  GraduationCap,
  Inbox,
  Mail,
  MailOpen,
  Phone,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import PublicShareButton from "@/components/public/PublicShareButton";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import DateTile from "@/components/common/DateTile";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatRelativeDateTime } from "@/lib/nepaliDate";
import { reloadWorkIndicators } from "@/lib/client/workIndicatorsStore";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

/**
 * Inquiries — questions and admission applications from people who are not
 * signed in, sent from the school's Praavyo profile or from its own website
 * (Website API). Filter by where they came from (Through website / Through
 * Praavyo) and by kind (General / Admission). Laid out like Received Notices.
 * Opening an inquiry marks it read; replies go out by email or phone.
 */
const TABS = [
  ["active", "Inbox"],
  ["NEW", "New"],
  ["ARCHIVED", "Archived"],
];
const SOURCES = [
  ["", "All sources"],
  ["WEBSITE", "Through website"],
  ["PRAAVYO", "Through Praavyo"],
];
const TYPES = [
  ["", "All"],
  ["GENERAL", "General"],
  ["ADMISSION", "Admission"],
];
const pick = (value, options) => (options.some(([key]) => key === value) ? value : "");

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The listed inquiries as a CSV file (opens in Excel / Google Sheets). */
function downloadCsv(rows) {
  const header = [
    "Date", "Source", "Type", "Status", "Name / guardian", "Phone", "Email", "Subject",
    "Student", "Grade", "Date of birth", "Gender", "Previous school", "Relation", "Address",
    "Academic year", "Message",
  ];
  const lines = rows.map((row) =>
    [
      new Date(row.createdAt).toISOString().slice(0, 16).replace("T", " "),
      row.source === "WEBSITE" ? "Website" : "Praavyo",
      row.type === "ADMISSION" ? "Admission" : "General",
      row.status,
      row.name,
      row.phone,
      row.email,
      row.subject,
      row.admission?.studentName,
      row.admission?.grade,
      row.admission?.dateOfBirth,
      row.admission?.gender,
      row.admission?.previousSchool,
      row.admission?.guardianRelation,
      row.admission?.address,
      row.admission?.academicYear,
      row.message,
    ]
      .map(csvCell)
      .join(",")
  );
  // The BOM makes Excel read Nepali text as UTF-8.
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SchoolInquiryInbox() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { calendar } = useCalendarPreference();
  const nepali = calendar === "BS";
  const [tab, setTab] = useState("active");
  // `?type=ADMISSION` / `?source=WEBSITE` (device alerts, Settings) preselect a filter.
  const [source, setSource] = useState(() => pick(String(searchParams?.get("source") || "").toUpperCase(), SOURCES));
  const [type, setType] = useState(() => pick(String(searchParams?.get("type") || "").toUpperCase(), TYPES));
  const [search, setSearch] = useState("");
  const [state, setState] = useState({
    loading: true,
    error: "",
    inquiries: [],
    counts: { NEW: 0, READ: 0, ARCHIVED: 0 },
    sources: { WEBSITE: 0, PRAAVYO: 0 },
    types: { GENERAL: 0, ADMISSION: 0 },
  });
  const [openId, setOpenId] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async (status, from, kind) => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const query = new URLSearchParams({ status });
      if (from) query.set("source", from);
      if (kind) query.set("type", kind);
      const res = await fetch(`/api/school/inquiries?${query}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Inquiries could not be loaded.");
      setState({
        loading: false,
        error: "",
        inquiries: json.data?.inquiries || [],
        counts: json.data?.counts || { NEW: 0, READ: 0, ARCHIVED: 0 },
        sources: json.data?.sources || { WEBSITE: 0, PRAAVYO: 0 },
        types: json.data?.types || { GENERAL: 0, ADMISSION: 0 },
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(tab, source, type), 0);
    return () => clearTimeout(timer);
  }, [load, tab, source, type]);

  async function setStatus(inquiry, status) {
    setBusyId(inquiry.id);
    try {
      const res = await fetch(`/api/school/inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "The inquiry could not be updated.");
      const updated = json.data.inquiry;
      setState((current) => {
        const counts = { ...current.counts };
        counts[inquiry.status] = Math.max(0, (counts[inquiry.status] || 0) - 1);
        counts[updated.status] = (counts[updated.status] || 0) + 1;
        // Leave the current list when the row no longer belongs on this tab.
        const belongs = tab === "active" ? updated.status !== "ARCHIVED" : updated.status === tab;
        const inquiries = belongs
          ? current.inquiries.map((row) => (row.id === updated.id ? updated : row))
          : current.inquiries.filter((row) => row.id !== updated.id);
        return { ...current, counts, inquiries };
      });
      // The sidebar's "new inquiries" badge follows straight away.
      if (inquiry.status === "NEW" || updated.status === "NEW") reloadWorkIndicators();
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setBusyId("");
    }
  }

  function toggle(inquiry) {
    const opening = openId !== inquiry.id;
    setOpenId(opening ? inquiry.id : "");
    if (opening && inquiry.status === "NEW") setStatus(inquiry, "READ");
  }

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      state.inquiries.filter(
        (row) =>
          !query ||
          `${row.name} ${row.email} ${row.phone} ${row.subject} ${row.message} ${row.admission?.studentName || ""} ${row.admission?.grade || ""}`
            .toLowerCase()
            .includes(query)
      ),
    [state.inquiries, query]
  );
  const publicUrl = session?.user?.id ? `/schools/${session.user.id}#inquiry` : "";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
            <Inbox aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Inquiries</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              Questions and admission applications from your Praavyo public page and your own website. Reply by email or phone.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Signed-in schools stay in the dashboard: share the form's link for families, don't open it. */}
          {publicUrl && (
            <PublicShareButton href={publicUrl} title="inquiry form" label="Copy form link" className="btn btn-ghost" />
          )}
          <button
            type="button"
            onClick={() => downloadCsv(visible)}
            disabled={!visible.length}
            className="btn btn-ghost"
            title="Download the listed inquiries as a spreadsheet"
          >
            <Download aria-hidden /> CSV
          </button>
          <button type="button" onClick={() => load(tab, source, type)} className="btn btn-secondary">
            <RefreshCw aria-hidden /> Refresh
          </button>
        </div>
      </div>

      {/* Where it came from, and what it is */}
      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="tabs overflow-x-auto" role="tablist" aria-label="Inquiry source">
          {SOURCES.map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              role="tab"
              aria-selected={source === value}
              onClick={() => { setSource(value); setOpenId(""); }}
              className="tab whitespace-nowrap"
            >
              {label}
              {value && <span className="ml-1 text-xs text-muted tabular-nums">{state.sources[value] || 0}</span>}
            </button>
          ))}
        </div>
        <div className="tabs overflow-x-auto" role="tablist" aria-label="Inquiry type">
          {TYPES.map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              role="tab"
              aria-selected={type === value}
              onClick={() => { setType(value); setOpenId(""); }}
              className="tab whitespace-nowrap"
            >
              {label}
              {value && <span className="ml-1 text-xs text-muted tabular-nums">{state.types[value] || 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="tabs shrink-0" role="tablist" aria-label="Inquiry status">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => { setTab(value); setOpenId(""); }}
              className="tab"
            >
              {label}
              {value === "NEW" && state.counts.NEW > 0 && <span className="count-badge">{state.counts.NEW}</span>}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, student, phone or message"
            aria-label="Search inquiries"
            className="input w-full pl-9"
          />
        </div>
        {search && (
          <button type="button" onClick={() => setSearch("")} className="btn btn-ghost btn-sm self-start sm:self-auto">
            <X aria-hidden /> Clear
          </button>
        )}
      </div>

      {state.error && <AlertBanner type="error" title="Something went wrong" message={state.error} />}

      {/* List */}
      <section className="card overflow-hidden" aria-label="Inquiries">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">
            {TABS.find(([value]) => value === tab)?.[1]}
            <span className="ml-1.5 font-normal text-muted tabular-nums">{visible.length}</span>
          </h3>
          <span className="text-xs text-muted">Newest first</span>
        </div>

        {state.loading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3].map((index) => (
              <div key={index} className="flex gap-4 p-4">
                <div className="skeleton h-[4.5rem] w-14" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title={
                query
                  ? "No inquiries match"
                  : tab === "ARCHIVED"
                    ? "Nothing archived"
                    : tab === "NEW"
                      ? "No new inquiries"
                      : type === "ADMISSION"
                        ? "No admission applications yet"
                        : "No inquiries yet"
              }
              description={
                query
                  ? "Try another search."
                  : type === "ADMISSION"
                    ? "Open the admission season in Settings → Admission to show the form on your public page and website."
                    : "When someone sends a question from your public page or your website, it appears here."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((inquiry) => {
              const open = openId === inquiry.id;
              const fresh = inquiry.status === "NEW";
              const busy = busyId === inquiry.id;
              return (
                <li key={inquiry.id} className={`relative transition-colors ${fresh ? "bg-brand-soft/40" : ""}`}>
                  {fresh && <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />}
                  <div className="flex gap-3.5 p-4 sm:gap-4">
                    <DateTile value={inquiry.createdAt} tone={inquiry.status === "ARCHIVED" ? "muted" : "brand"} />

                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => toggle(inquiry)} aria-expanded={open} className="block w-full text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {fresh && <span className="badge badge-brand">New</span>}
                          {inquiry.type === "ADMISSION" && <span className="badge badge-success">Admission</span>}
                          <span className="badge badge-neutral">
                            {inquiry.source === "WEBSITE" ? "Through website" : "Through Praavyo"}
                          </span>
                          {inquiry.status === "ARCHIVED" && <span className="badge badge-neutral">Archived</span>}
                        </div>
                        <h4 className={`mt-1 text-base font-semibold text-ink hover:text-brand-strong ${open ? "" : "line-clamp-1"}`}>
                          {inquiry.subject}
                        </h4>
                        {inquiry.message && (
                          <p className={`mt-0.5 whitespace-pre-wrap text-sm text-muted ${open ? "text-body" : "line-clamp-2"}`}>
                            {inquiry.message}
                          </p>
                        )}
                      </button>

                      {open && inquiry.admission && (
                        <AdmissionDetails admission={inquiry.admission} guardian={inquiry.name} />
                      )}

                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        <span className="font-semibold text-ink">{inquiry.name}</span>
                        {inquiry.email && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{inquiry.email}</span>
                          </>
                        )}
                        <span aria-hidden>·</span>
                        <span>{inquiry.phone}</span>
                        <span aria-hidden>·</span>
                        <span lang={nepali ? "ne" : undefined}>{formatRelativeDateTime(inquiry.createdAt, calendar)}</span>
                      </p>

                      {open && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {inquiry.email && (
                            <a
                              href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: ${inquiry.subject}`)}`}
                              className="btn btn-primary btn-sm"
                            >
                              <Mail aria-hidden /> Reply by email
                            </a>
                          )}
                          <a
                            href={`tel:${inquiry.phone.replace(/[^\d+]/g, "")}`}
                            className={`btn btn-sm ${inquiry.email ? "btn-secondary" : "btn-primary"}`}
                          >
                            <Phone aria-hidden /> Call {inquiry.phone}
                          </a>
                          {inquiry.status === "READ" && (
                            <button type="button" disabled={busy} onClick={() => setStatus(inquiry, "NEW")} className="btn btn-ghost btn-sm">
                              <MailOpen aria-hidden /> Mark unread
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-start">
                      {inquiry.status === "ARCHIVED" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(inquiry, "READ")}
                          className="btn-icon btn-ghost btn-sm"
                          title="Move back to the inbox"
                          aria-label={`Move "${inquiry.subject}" back to the inbox`}
                        >
                          <ArchiveRestore aria-hidden />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(inquiry, "ARCHIVED")}
                          className="btn-icon btn-ghost btn-sm text-muted"
                          title="Archive"
                          aria-label={`Archive "${inquiry.subject}"`}
                        >
                          <Archive aria-hidden />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The student's details on an admission application. */
function AdmissionDetails({ admission, guardian }) {
  const rows = [
    ["Student", admission.studentName],
    ["Applying for", admission.grade],
    ["Academic year", admission.academicYear],
    ["Date of birth", admission.dateOfBirth],
    ["Gender", admission.gender],
    ["Previous school", admission.previousSchool],
    ["Parent / guardian", [guardian, admission.guardianRelation && `(${admission.guardianRelation})`].filter(Boolean).join(" ")],
    ["Address", admission.address],
  ].filter(([, value]) => value);
  return (
    <div className="mt-3 rounded-card border border-line bg-surface-2 p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
        <GraduationCap aria-hidden /> Admission application
      </p>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
