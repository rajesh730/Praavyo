"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Award as FaAward, BadgeCheck as FaCertificate, CircleCheck as FaCheckCircle, Download as FaDownload, Ellipsis as FaEllipsisH, Eye as FaEye, Medal as FaMedal, Search as FaSearch, Trophy as FaTrophy, Undo2 as FaUndo, Users as FaUsers } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AppDate from "@/components/common/AppDate";
import PdfDownloadLink from "@pravyo/cas/components/PdfDownloadLink";
import { downloadPdfFromPage } from "@pravyo/cas/lib/client/pdfDownload";

function formatStatus(value) {
  if (value === "RUNNER_UP") return "1st Runner Up";
  if (value === "THIRD_PLACE") return "2nd Runner Up";
  if (value === "NOT_ATTEMPTED") return "Not Attempted";
  return String(value || "").replaceAll("_", " ");
}

function statusTone(status) {
  if (status === "WINNER") return "border-warning-line bg-warning-soft text-warning";
  if (status === "RUNNER_UP") return "border-line bg-surface-2 text-ink";
  if (status === "THIRD_PLACE") return "border-warning-line bg-warning-soft text-warning";
  if (status === "FINALIST" || status === "SELECTED") {
    return "border-brand-line bg-brand-soft text-brand-strong";
  }
  if (status === "DISQUALIFIED") return "border-danger-line bg-danger-soft text-danger";
  return "border-success-line bg-success-soft text-success";
}

function placementIcon(status, index) {
  if (status === "WINNER") return <FaTrophy />;
  if (status === "RUNNER_UP" || status === "THIRD_PLACE") return <FaMedal />;
  if (status === "FINALIST" || status === "SELECTED") return <FaAward />;
  return index + 1;
}

export default function EventResultsManager({
  title = "Event Results",
  description = "Review final statuses and publish certificates.",
  fixedEventId = "",
  embedded = false,
  readOnly = false,
}) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingCertificate, setEditingCertificate] = useState(null);
  const [certificateName, setCertificateName] = useState("");
  const [expandedTeams, setExpandedTeams] = useState({});
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPublicly, setPublishPublicly] = useState(true);

  const eventId = fixedEventId;

  const loadDetail = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/events/${eventId}/results`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load results.");
      }
      setDetail(data.data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const participants = useMemo(() => detail?.participants || [], [detail?.participants]);
  const issuedResults = useMemo(() => detail?.results || [], [detail?.results]);
  const isTeamEvent =
    String(detail?.event?.participationFormat || "INDIVIDUAL").toUpperCase() ===
    "TEAM";
  const resultsPublished = Boolean(detail?.event?.resultsPublished);
  // Publishing only makes sense after the final round is finished and the
  // competition closed — that's when the workflow reaches RESULTS_DRAFT.
  const resultsDraftReady =
    String(detail?.event?.eventWorkflowStatus || "").toUpperCase() ===
    "RESULTS_DRAFT";
  // Only platform events can expose results publicly (winners page, public
  // event page, student/school profiles) — the API ignores the flag otherwise.
  const isPlatformEvent =
    String(detail?.event?.eventScope || "").toUpperCase() === "PLATFORM";

  const saveResults = useCallback(async ({ publish = false, reopen = false, makePublic = false } = {}) => {
    if (!eventId || participants.length === 0) return;
    try {
      setSaving(true);
      setMessage(
        publish
          ? "Publishing final results and issuing certificates..."
          : reopen
          ? "Reopening results for correction..."
          : "Preparing draft results and certificate previews..."
      );
      setError("");
      const res = await fetch(`/api/events/${eventId}/results`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultsPublished: publish,
          // Honored by the API for platform events only; reopen/draft always
          // pulls results back off the public surfaces.
          publishPublicly: publish && makePublic,
          confirmPublish: publish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to save results.");
      }
      setMessage(
        publish
          ? "Final results published and certificates issued."
          : reopen
          ? "Results reopened. Fix the placements in the Rounds tab, then publish again."
          : "Draft results and certificate previews are ready for review."
      );
      await loadDetail();
    } catch (saveError) {
      setError(saveError.message);
      setMessage("");
    } finally {
      setSaving(false);
    }
  }, [eventId, loadDetail, participants.length]);

  const resultSummary = useMemo(() => {
    const source = participants;
    return {
      winnerCount: source.filter((participant) => participant.finalStatus === "WINNER")
        .length,
      runnerUpCount: source.filter(
        (participant) => participant.finalStatus === "RUNNER_UP"
      ).length,
      thirdPlaceCount: source.filter(
        (participant) => participant.finalStatus === "THIRD_PLACE"
      ).length,
      finalistCount: source.filter(
        (participant) =>
          participant.finalStatus === "FINALIST" ||
          participant.finalStatus === "SELECTED"
      ).length,
      participantCount: source.length,
      certificateCount: issuedResults.filter((result) => result.certificateIssuedAt)
        .length,
    };
  }, [issuedResults, participants]);

  const filteredParticipants = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return participants.filter((participant) => {
      const status = participant.finalStatus || "";
      const statusMatches = statusFilter === "ALL" || status === statusFilter;
      const participantName = isTeamEvent
        ? participant.teamName || "School Team"
        : participant.student?.name || participant.teamName || "Student";
      const schoolName = participant.school?.schoolName || "School";
      const searchMatches =
        !normalizedSearch ||
        `${participantName} ${schoolName}`.toLowerCase().includes(normalizedSearch);
      return statusMatches && searchMatches;
    });
  }, [isTeamEvent, participants, searchTerm, statusFilter]);

  const groupedIssuedResults = useMemo(() => {
    if (!isTeamEvent) return [];
    const teamRows = issuedResults.filter(
      (result) => String(result.recipientType || "STUDENT").toUpperCase() === "TEAM"
    );
    const memberRows = issuedResults.filter(
      (result) => String(result.recipientType || "STUDENT").toUpperCase() !== "TEAM"
    );
    const membersByParent = new Map();
    memberRows.forEach((result) => {
      const parentId = String(
        result.parentAchievement?._id || result.parentAchievement || ""
      );
      if (!parentId) return;
      if (!membersByParent.has(parentId)) membersByParent.set(parentId, []);
      membersByParent.get(parentId).push(result);
    });

    return teamRows.map((team) => ({
      team,
      members: membersByParent.get(String(team._id)) || [],
    }));
  }, [isTeamEvent, issuedResults]);

  const openCertificateEditor = (result) => {
    setEditingCertificate(result);
    setCertificateName(
      result.certificateRecipientName ||
        result.teamName ||
        result.student?.name ||
        "Student"
    );
  };

  const updateCertificateName = async () => {
    if (!editingCertificate) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const targetId = editingCertificate.resultId || editingCertificate._id;
      const res = await fetch(`/api/events/${eventId}/results/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          certificateRecipientName: certificateName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to update certificate name.");
      }
      setEditingCertificate(null);
      setMessage(data.message || "Certificate name updated.");
      await loadDetail();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  };

  const bulkDownloadCertificates = async () => {
    const certificateIds = issuedResults
      .filter((result) => result.certificateIssuedAt)
      .map((result) => {
        const targetId = result.resultId || result._id;
        return targetId ? String(targetId) : "";
      })
      .filter(Boolean);

    if (!certificateIds.length) {
      setError("No certificate PDFs are ready for bulk download yet.");
      return;
    }

    const params = new URLSearchParams({ ids: certificateIds.join(",") });
    setMessage(`Preparing ${certificateIds.length} certificate${certificateIds.length === 1 ? "" : "s"} as one PDF...`);
    try {
      await downloadPdfFromPage(`/certificates/bulk?${params.toString()}`);
      setMessage("Certificate PDF downloaded.");
    } catch (err) {
      setMessage("");
      setError(err.message || "The certificate PDF could not be made.");
    }
  };

  const toggleTeamExpansion = (teamId) => {
    setExpandedTeams((current) => ({
      ...current,
      [teamId]: !current[teamId],
    }));
  };

  const statusFilters = [
    ["ALL", "All Status", participants.length],
    ["WINNER", "Winner", resultSummary.winnerCount],
    ["RUNNER_UP", "1st Runner Up", resultSummary.runnerUpCount],
    ["THIRD_PLACE", "2nd Runner Up", resultSummary.thirdPlaceCount],
    ["FINALIST", "Finalists", resultSummary.finalistCount],
    ["DISQUALIFIED", "Disqualified", participants.filter((p) => p.finalStatus === "DISQUALIFIED").length],
  ];

  const statCards = [
    ["Winner", resultSummary.winnerCount, FaTrophy, "border-warning-line bg-warning-soft text-warning"],
    ["1st Runner Up", resultSummary.runnerUpCount, FaAward, "border-brand-line bg-brand-soft text-brand-strong"],
    ["2nd Runner Up", resultSummary.thirdPlaceCount, FaMedal, "border-warning-line bg-warning-soft text-warning"],
    ["Finalists", resultSummary.finalistCount, FaMedal, "border-brand-line bg-brand-soft text-brand-strong"],
    ["Participants", resultSummary.participantCount, FaUsers, "border-success-line bg-success-soft text-success"],
    ["Certificates Issued", resultSummary.certificateCount, FaCertificate, "border-brand-line bg-brand-soft text-brand-strong"],
  ];

  return (
    <div className="space-y-4">
      <section
        className={
          embedded
            ? "card p-4"
            : "rounded-control border border-brand bg-brand p-4"
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-xl text-brand-strong">
              <FaTrophy />
            </span>
            <div>
              <h2 className={`font-semibold ${embedded ? "text-ink" : "text-white"}`}>
                {title}
              </h2>
              <p className={`mt-1 text-xs font-semibold ${embedded ? "text-muted" : "text-brand"}`}>
                {description}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-2xs font-semibold text-muted">
                <span><AppDate value={detail?.event?.date} fallback="Event date" /></span>
                <span>
                  {resultSummary.certificateCount} / {participants.length}{" "}
                  certificate{participants.length === 1 ? "" : "s"} issued
                </span>
                <span className="inline-flex items-center gap-1 text-success">
                  <FaCheckCircle />
                  {saving
                    ? "Saving"
                    : resultsPublished
                    ? "Published"
                    : "Draft results"}
                </span>
              </div>
            </div>
          </div>
          {!readOnly && resultsPublished && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => setReopenOpen(true)}
                className="btn btn-soft btn-sm inline-flex items-center justify-center gap-2"
              >
                <FaUndo />
                Reopen for Correction
              </button>
            </div>
          )}
          {!readOnly && !resultsPublished && resultsDraftReady && participants.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={saving || loading}
                onClick={() => {
                  setPublishPublicly(
                    isPlatformEvent ? detail?.publishPublicly ?? true : false
                  );
                  setPublishOpen(true);
                }}
                className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2"
              >
                <FaCheckCircle />
                Publish Final Results
              </button>
            </div>
          )}
        </div>
        <p className={`mt-3 text-xs font-semibold ${embedded ? "text-muted" : "text-brand"}`}>
          {readOnly
            ? resultsPublished
              ? "Final results are published. You can view the placements and download your certificate below."
              : "Results have not been published yet. Final placements and certificates will appear here once the organizer publishes them."
            : participants.length === 0
            ? "No participants are enrolled yet. Register students and run the rounds before reviewing results."
            : resultsPublished
            ? "Results are published and certificates issued — students and schools can view them. Made a mistake? Use Reopen for Correction to safely edit placements and republish."
            : "Review the placements and certificate records below."}
        </p>
        {message && <div className="mt-4 text-sm font-semibold text-brand-strong">{message}</div>}
        {error && <div className="mt-4 text-sm font-semibold text-warning">{error}</div>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(([label, value, Icon, tone]) => (
          <div key={label} className={`card px-4 py-3 ${tone}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
                <Icon />
              </span>
              <strong className="text-2xl font-semibold text-ink">{value}</strong>
            </div>
            <div className="mt-2 text-xs font-semibold">{label}</div>
          </div>
        ))}
      </div>

      <section className="card p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-ink">Final Placements</h3>
            <p className="mt-1 text-xs font-semibold text-muted">
              Draft placements are calculated from approved participation and round history.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input"
            >
              {statusFilters.map(([value, label, count]) => (
                <option key={value} value={value}>
                  {label} ({count})
                </option>
              ))}
            </select>
            <label className="relative block">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search participant..."
                className="input w-full pl-9 pr-3 sm:w-64"
              />
            </label>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {statusFilters.slice(1).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`btn btn-secondary btn-sm transition-colors ${
                statusFilter === value
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-line bg-surface text-brand-strong hover:bg-surface"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="card px-4 py-6 text-center text-sm font-semibold text-muted">
              Loading results...
            </div>
          ) : filteredParticipants.length === 0 ? (
            <div className="card px-4 py-6 text-center text-sm font-semibold text-muted">
              No eligible participants found yet.
            </div>
          ) : (
            filteredParticipants.map((participant, index) => {
              const name = isTeamEvent
                ? participant.teamName || "School Team"
                : participant.student?.name || participant.teamName || "Student";
              const status = participant.finalStatus || "PARTICIPANT";
              return (
                <div
                  key={participant.teamKey || participant.studentId}
                  className={`card grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1.2fr_auto] md:items-center ${statusTone(status)}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold">
                      {placementIcon(status, index)}
                    </span>
                    <div>
                      <div className="font-semibold text-ink">{name}</div>
                      <div className="mt-1 text-xs font-semibold text-muted">
                        {participant.school?.schoolName || "School"}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase text-muted">Highest Round</div>
                    <div className="text-xs font-semibold text-ink">
                      {participant.highestRoundReached > 0
                        ? `Round ${participant.highestRoundReached}`
                        : "Registration"}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase text-muted">Certificate Status</div>
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      {participant.certificateIssuedAt ? "Issued" : "Draft"} <FaCheckCircle />
                    </div>
                  </div>
                  <div>
                    <div className="text-2xs font-semibold uppercase text-muted">Certificate Name</div>
                    <div className="text-xs font-semibold text-brand-strong">
                      {participant.certificateRecipientName || name}
                    </div>
                  </div>
                  <span className="badge badge-neutral uppercase">
                    {formatStatus(status)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="card p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-ink">Certificate Management</h3>
            <p className="mt-1 text-xs font-semibold text-muted">
              Draft certificate records can be reviewed before final certificates are issued.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || !issuedResults.length}
            onClick={bulkDownloadCertificates}
            className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-2"
          >
            <FaDownload />
            Bulk Download
          </button>
        </div>

        <div className="card overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-surface text-2xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2.5">{isTeamEvent ? "Team" : "Student"}</th>
                <th className="px-4 py-2.5">School</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Certificate State</th>
                <th className="px-4 py-2.5 text-right">Options</th>
              </tr>
            </thead>
            <tbody>
              {isTeamEvent ? (
                !groupedIssuedResults.length ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-7 text-center text-sm font-semibold text-muted">
                      Prepare draft results to create certificate previews.
                    </td>
                  </tr>
                ) : (
                  groupedIssuedResults.map(({ team, members }) => (
                    <Fragment key={team._id || team.resultId || team.teamName}>
                      <tr className="border-t border-line">
                        <td className="px-4 py-2.5 font-semibold text-ink">
                          {team.teamName || team.certificateRecipientName || "School Team"}
                          <div className="mt-1 text-xs font-semibold text-muted">
                            {members.length} member certificate{members.length === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                          {team.school?.schoolName || "School"}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                          {formatStatus(team.finalStatus || team.placement)}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-success">
                          {team.certificateIssuedAt ? "Issued" : "Preparing"}
                        </td>
                        <td className="px-4 py-2.5">
                          <CertificateActions
                            result={team}
                            onEdit={openCertificateEditor}
                            onToggleMembers={() => toggleTeamExpansion(String(team._id))}
                            memberCount={members.length}
                            expanded={expandedTeams[String(team._id)]}
                            canEdit={!readOnly}
                          />
                        </td>
                      </tr>
                      {expandedTeams[String(team._id)] &&
                        members.map((member) => (
                          <tr key={member._id} className="border-t border-line bg-surface">
                            <td className="px-4 py-2.5 font-semibold text-ink">
                              {member.certificateRecipientName || member.student?.name || "Student"}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                              {team.school?.schoolName || "School"}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                              {formatStatus(member.finalStatus || member.placement)}
                            </td>
                            <td className="px-4 py-2.5 text-sm font-semibold text-success">
                              {member.certificateIssuedAt ? "Issued" : "Preparing"}
                            </td>
                            <td className="px-4 py-2.5">
                              <CertificateActions result={member} onEdit={openCertificateEditor} canEdit={!readOnly} />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  ))
                )
              ) : !issuedResults.length ? (
                <tr>
                  <td colSpan="5" className="px-4 py-7 text-center text-sm font-semibold text-muted">
                    Prepare draft results to create certificate previews.
                  </td>
                </tr>
              ) : (
                issuedResults.map((result) => (
                  <tr key={result._id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-semibold text-ink">
                      {result.certificateRecipientName ||
                        result.teamName ||
                        result.student?.name ||
                        "Student"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                      {result.school?.schoolName || "School"}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-brand-strong">
                      {formatStatus(result.finalStatus || result.placement)}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-success">
                      {result.certificateIssuedAt ? "Issued" : "Preparing"}
                    </td>
                    <td className="px-4 py-2.5">
                      <CertificateActions result={result} onEdit={openCertificateEditor} canEdit={!readOnly} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingCertificate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="w-full max-w-xl rounded-control bg-surface p-4 sm:p-5 shadow-pop">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Edit Certificate Name</h3>
              <button
                type="button"
                onClick={() => setEditingCertificate(null)}
                className="text-sm font-semibold text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
            <label>
              <div className="mb-1 text-sm font-semibold text-muted">
                Name shown on certificate
              </div>
              <input
                value={certificateName}
                onChange={(event) => setCertificateName(event.target.value)}
                className="input w-full"
              />
            </label>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={updateCertificateName}
                disabled={saving}
                className="btn btn-primary"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={publishOpen}
        title="Publish final results?"
        message="Placements become final and certificates are issued to every participant. Students and schools can then view, download, and verify them by certificate code. If you spot a mistake later, use Reopen for Correction."
        confirmLabel="Publish and issue certificates"
        tone="info"
        busy={saving}
        onClose={() => setPublishOpen(false)}
        onConfirm={() => {
          setPublishOpen(false);
          saveResults({
            publish: true,
            makePublic: isPlatformEvent && publishPublicly,
          });
        }}
      >
        {isPlatformEvent && (
          <label className="btn btn-secondary mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={publishPublicly}
              onChange={(event) => setPublishPublicly(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#0a2f66]"
            />
            <span className="text-sm leading-6 text-ink">
              <span className="font-semibold text-ink">
                Also publish results publicly.
              </span>{" "}
              Winners appear on the public winners page, the event page, and
              student and school profiles.
            </span>
          </label>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={reopenOpen}
        title="Reopen results for correction?"
        message="Issued certificates will be temporarily withdrawn and results return to draft. Fix the placements in the Rounds tab, then publish again to re-issue corrected certificates."
        confirmLabel="Reopen for correction"
        tone="danger"
        busy={saving}
        onClose={() => setReopenOpen(false)}
        onConfirm={() => {
          setReopenOpen(false);
          saveResults({ reopen: true });
        }}
      />
    </div>
  );
}

function CertificateActions({
  result,
  onEdit,
  onToggleMembers,
  memberCount = 0,
  expanded = false,
  canEdit = true,
}) {
  const targetId = result.resultId || result._id;

  return (
    <div className="flex justify-end gap-2">
      {typeof onToggleMembers === "function" && (
        <button
          type="button"
          onClick={onToggleMembers}
          className="btn btn-secondary btn-sm"
        >
          {expanded ? "Hide" : `Members (${memberCount})`}
        </button>
      )}
      <a
        href={`/certificates/${targetId}?preview=1`}
        target="_blank"
        rel="noreferrer"
        className="btn-icon btn-ghost flex items-center justify-center"
        title="Preview certificate"
      >
        <FaEye />
      </a>
      {result.certificateIssuedAt && (
        <PdfDownloadLink
          href={`/certificates/${targetId}?download=pdf`}
          className="btn-icon btn-ghost flex items-center justify-center"
          title="Download certificate"
        >
          <FaDownload />
        </PdfDownloadLink>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit(result)}
          className="btn-icon btn-ghost flex items-center justify-center"
          title="Edit certificate name"
        >
          <FaEllipsisH />
        </button>
      )}
    </div>
  );
}
