"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { Search as FaSearch, ListFilter as FaFilter, Download as FaDownload, ChevronDown as FaChevronDown, ChevronRight as FaChevronRight, QrCode as FaQrcode, Send as FaPaperPlane, UserPlus as FaAddGuardian } from "lucide-react";
import Link from "next/link";
import AlertBanner from "@/components/ui/AlertBanner";
import PaginationControls from "@/components/PaginationControls";
import { COVERAGE_LABELS } from "@/lib/guardianRoster";
import GuardianManager from "./GuardianManager";
import BulkCardsDialog from "./BulkCardsDialog";
import ParentCardDialog from "./ParentCardDialog";
import Glyph from "@/components/ui/Glyph";

/**
 * The school-wide guardian roster.
 *
 * Replaces a search-one-student-at-a-time master/detail with the view a school
 * admin actually needs: every student, their guardian coverage, and the ability
 * to filter down to the gaps.
 *
 * Deliberately matches components/dashboard/StudentManager: metric cards →
 * filter bar → table → pagination → CSV. Two screens that answer adjacent
 * questions about the same people should not look like different products.
 *
 * Row expansion keeps the detailed per-student panel available without a
 * navigation step, so nothing is hidden behind a second page.
 */

const COVERAGE_FILTERS = [
  { value: "ALL", label: "All students" },
  { value: "UNLINKED_DATA", label: "Could not connect automatically" },
  { value: "NO_GUARDIAN", label: "No guardian at all" },
  { value: "NOT_ACTIVATED", label: "Card not used yet" },
  { value: "ACTIVATED", label: "Connected" },
  { value: "REVOKED", label: "Access removed" },
];

export default function GuardianRoster() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  // How many guardians the automatic backfill linked on this load, and whether
  // a large school still has more to work through.
  const [autoLinked, setAutoLinked] = useState(0);
  const [idsAssigned, setIdsAssigned] = useState(0);
  const [backfillRunning, setBackfillRunning] = useState(false);

  // Filters and the page are remembered until the page is refreshed.
  const [search, setSearch] = useRememberedState("guardians:search", "");
  const [grade, setGrade] = useRememberedState("guardians:grade", "");
  const [coverage, setCoverage] = useRememberedState("guardians:coverage", "ALL");
  const [page, setPage] = useRememberedState("guardians:page", 1);
  const lastFiltersRef = useRef(`${search}|${grade}|${coverage}`);

  const [grades, setGrades] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [printingCards, setPrintingCards] = useState(false);
  // Set when the row's "add guardian" button is used, so the panel opens with
  // its form already showing rather than making the user find it again.
  const [addGuardianFor, setAddGuardianFor] = useState(null);

  // Row selection drives the bulk actions. Held as a Set of studentIds and
  // cleared whenever the filters change, so a hidden selection can never be
  // acted on by mistake.
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelected = (studentId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  // Grade list for the filter, from the school's own configured structure.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/school/grade-structure", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setGrades(data.grades || []);
      } catch {
        // A missing grade list only removes a filter; the roster still works.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/school/guardians/roster", window.location.origin);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "25");
      url.searchParams.set("coverage", coverage);
      if (search.trim()) url.searchParams.set("search", search.trim());
      if (grade) url.searchParams.set("grade", grade);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not load the roster");

      setRows(json.data.rows);
      setSummary(json.data.summary);
      setPagination(json.data.pagination);
      setTruncated(Boolean(json.data.truncated));
      setAutoLinked(json.data.autoLinked || 0);
      setIdsAssigned(json.data.idsAssigned || 0);
      setBackfillRunning(Boolean(json.data.backfillInProgress));
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, coverage, search, grade]);

  // Debounced so typing a name does not fire a query per keystroke against a
  // cluster with ~69ms RTT.
  useEffect(() => {
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
  }, [load]);

  // Any filter change returns to page 1 — staying on page 4 of a now-shorter
  // list shows an empty table and reads as a bug. The selection is dropped at
  // the same time: acting on rows the user can no longer see is a trap.
  // Only a real change resets, so a remembered page survives returning here.
  useEffect(() => {
    const key = `${search}|${grade}|${coverage}`;
    if (key === lastFiltersRef.current) return;
    lastFiltersRef.current = key;
    setPage(1);
    setSelected(new Set());
  }, [search, grade, coverage, setPage]);

  // A large school is linked in batches, so keep pulling until it finishes.
  // The school never has to press anything or know it is happening.
  useEffect(() => {
    if (!backfillRunning) return undefined;
    const handle = setTimeout(load, 1500);
    return () => clearTimeout(handle);
  }, [backfillRunning, load]);

  const exportCsv = () => {
    const header = [
      "Student",
      "Grade",
      "Roll",
      "IEMIS",
      "Coverage",
      "Guardians",
      "Guardian names",
      "Parent IDs",
      "Contact",
    ];
    const lines = rows.map((row) => [
      row.studentName,
      row.grade,
      row.rollNumber,
      row.iemisNumber,
      COVERAGE_LABELS[row.coverage]?.label || row.coverage,
      row.guardianCount,
      row.guardians.map((g) => g.name).join(" / "),
      row.guardians.map((g) => g.parentIdentifier || "—").join(" / "),
      row.guardians
        .map((g) => g.email || g.phone || "none")
        .join(" / "),
    ]);

    const csv = [header, ...lines]
      .map((cells) =>
        cells
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `guardians-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-semibold text-ink">
            Parents &amp; Guardians
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every student and who can see them. Connect guardians, print access
            cards, and find the families nobody has reached yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaDownload />
            Export CSV
          </button>
          {/* One door to messaging. "Message parents" opens the inbox — every
              conversation in one place, with New message inside it — rather
              than a compose box that hides the replies. */}
          <Link
            href="/school/messages"
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaPaperPlane />
            Message parents
          </Link>
          <button
            type="button"
            onClick={() => setPrintingCards(true)}
            className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaQrcode />
            Print access cards
          </button>
        </div>
      </div>

      {/* Linking is automatic, so this reports what happened rather than
          asking the school to do anything. */}
      {autoLinked > 0 ? (
        <AlertBanner
          type="success"
          title={`${autoLinked} guardian${autoLinked === 1 ? "" : "s"} connected automatically`}
          message="Parent details from student registration were turned into guardian accounts. Print their access cards when you are ready to hand them out."
        />
      ) : null}

      {idsAssigned > 0 && autoLinked === 0 ? (
        <AlertBanner
          type="success"
          title={`${idsAssigned} Parent ID${idsAssigned === 1 ? "" : "s"} assigned`}
          message="Existing guardians now have a Praavyo Parent ID. You can read it to them over the phone — they still need a PIN from an access card to sign in."
        />
      ) : null}

      {backfillRunning ? (
        <AlertBanner
          type="info"
          title="Still connecting guardians…"
          message="Working through your student records in batches. This page will keep updating."
        />
      ) : null}

      {/* Only students whose registration held nothing usable remain here, so
          the wording is about missing data, not a task the school forgot. */}
      {summary?.unlinkedData > 0 && !backfillRunning ? (
        <AlertBanner
          type="warning"
          title={`${summary.unlinkedData} students could not be connected automatically`}
          message="Their registration record has a parent name that could not be used, or the guardian's details clash with an existing account. Open a row to add the guardian by hand."
          action={
            <button
              type="button"
              onClick={() => setCoverage("UNLINKED_DATA")}
              className="btn btn-ghost btn-sm transition-colors"
            >
              Show them
            </button>
          }
        />
      ) : null}

      {error ? <AlertBanner type="error" title="Could not load" message={error} /> : null}

      {truncated ? (
        <AlertBanner
          type="info"
          title="Showing the first 1,500 matching students"
          message="Narrow the search or pick a grade to see the rest."
        />
      ) : null}

      {/* Filters */}
      <div className="card p-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_240px_auto]">
          <div className="relative">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, IEMIS, roll, or guardian name..."
              className="input w-full pl-11 pr-4 transition-colors"
            />
          </div>

          <select
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            className="input transition-colors"
          >
            <option value="">All Grades</option>
            {grades.map((g) => (
              <option key={g._id} value={g.originalValue || g._id}>
                {g.name}
              </option>
            ))}
          </select>

          <select
            value={coverage}
            onChange={(event) => setCoverage(event.target.value)}
            className="input transition-colors"
          >
            {COVERAGE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setGrade("");
              setCoverage("ALL");
            }}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaFilter />
            Clear Filters
          </button>
        </div>
      </div>

      {/* Selection bar — appears only when rows are ticked. */}
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-4 py-3">
          <span className="text-sm font-semibold text-brand-strong">
            {selected.size} student{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPrintingCards(true)}
              className="btn btn-primary btn-sm inline-flex items-center gap-2"
            >
              <FaQrcode />
              Print cards
            </button>
            <Link
              href="/school/messages"
              className="btn btn-secondary btn-sm inline-flex items-center gap-2"
            >
              <FaPaperPlane />
              Message
            </Link>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn btn-ghost btn-sm"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm text-ink">
            <thead className="border-b border-line bg-surface text-2xs uppercase text-muted">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={
                      rows.length > 0 &&
                      rows.every((row) => selected.has(row.studentId))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(rows.map((row) => row.studentId))
                          : new Set()
                      )
                    }
                    className="h-4 w-4 rounded-control border-line-strong"
                  />
                </th>
                <th className="w-10 px-3 py-2.5" />
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Grade</th>
                <th className="px-4 py-2.5">Guardians</th>
                <th className="px-4 py-2.5">Parent ID</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2, 3, 4].map((index) => (
                  <tr key={index} className="border-b border-line">
                    <td colSpan={8} className="px-4 py-2.5">
                      <div className="h-6 animate-pulse rounded-control bg-surface-2" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <p className="text-base font-semibold text-ink">
                      No students match these filters
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Try clearing the search or choosing a different grade.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <RosterRow
                    key={row.studentId}
                    row={row}
                    expanded={expanded === row.studentId}
                    selected={selected.has(row.studentId)}
                    onSelect={() => toggleSelected(row.studentId)}
                    onToggle={() =>
                      setExpanded(expanded === row.studentId ? null : row.studentId)
                    }
                    onAddGuardian={() => {
                      setExpanded(row.studentId);
                      setAddGuardianFor(row.studentId);
                    }}
                    openAddForm={addGuardianFor === row.studentId}
                    onAddFormOpened={() => setAddGuardianFor(null)}
                    onChanged={load}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 ? (
          <div className="border-t border-line px-4 py-3">
            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              start={pagination.start}
              end={pagination.end}
              onPageChange={(next) => setPage(next)}
            />
          </div>
        ) : null}
      </div>

      {printingCards ? (
        <BulkCardsDialog
          grades={grades}
          selectedStudentIds={Array.from(selected)}
          onClose={() => {
            setPrintingCards(false);
            // Access states change once cards are issued.
            load();
          }}
        />
      ) : null}

    </div>
  );
}

function RosterRow({
  row,
  expanded,
  selected,
  onSelect,
  onToggle,
  onAddGuardian,
  openAddForm,
  onAddFormOpened,
  onChanged,
}) {
  const coverage = COVERAGE_LABELS[row.coverage] || COVERAGE_LABELS.NO_GUARDIAN;
  const primary = row.guardians.find((g) => g.isPrimaryGuardian) || row.guardians[0];
  const [issuing, setIssuing] = useState(false);
  const [card, setCard] = useState(null);

  /**
   * Issue a card for this one guardian and SHOW it.
   *
   * Deliberately not a jump straight to the print view: most guardians are sent
   * their details by WhatsApp, and forcing a print dialog for that is friction
   * with no purpose. The dialog offers copy, share and print equally.
   */
  const showCard = async (linkId) => {
    setIssuing(true);
    try {
      const res = await fetch("/api/school/guardians/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Viewing/reprinting is idempotent. A lost-card replacement belongs in
        // the expanded access panel, where REISSUE is explicit and confirmed.
        body: JSON.stringify({ linkId, purpose: "INITIAL" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setCard(json.data);
    } catch {
      // The expanded panel surfaces the detailed error; the row stays quiet.
      onChanged();
    } finally {
      setIssuing(false);
    }
  };

  return (
    <>
      <tr
        className={`border-b border-line transition-colors hover:bg-surface ${
          expanded ? "bg-surface" : selected ? "bg-brand-soft" : ""
        }`}
      >
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select ${row.studentName}`}
            className="h-4 w-4 rounded-control border-line-strong"
          />
        </td>

        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide details" : "Show details"}
            className="btn-icon btn-ghost flex items-center justify-center transition-colors"
          >
            {expanded ? <FaChevronDown /> : <FaChevronRight />}
          </button>
        </td>

        <td className="px-4 py-2.5">
          <button type="button" onClick={onToggle} className="text-left">
            <span className="block font-semibold text-ink">{row.studentName}</span>
            {row.iemisNumber || row.rollNumber ? (
              <span className="block text-xs text-muted">
                {[row.iemisNumber && `IEMIS ${row.iemisNumber}`, row.rollNumber && `Roll ${row.rollNumber}`].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </button>
        </td>

        <td className="px-4 py-2.5 font-semibold">{row.grade || "—"}</td>

        <td className="px-4 py-2.5">
          {row.guardians.length === 0 ? (
            // Never a bare dash: say what is missing and what can be done.
            row.registrationParent ? (
              <span className="text-warning">
                {row.registrationParent.name}
                <span className="block text-xs font-semibold">
                  on the student record — needs checking
                </span>
              </span>
            ) : (
              <span className="text-muted">Nobody connected</span>
            )
          ) : (
            // Every guardian, not just the primary — a school needs to see at a
            // glance that both parents are connected without expanding the row.
            <ul className="space-y-1">
              {row.guardians.map((guardian) => (
                <li key={guardian.linkId} className="leading-tight">
                  <span
                    className={
                      guardian.linkStatus === "ACTIVE"
                        ? "font-semibold text-ink"
                        : "font-semibold text-subtle line-through"
                    }
                  >
                    {guardian.name}
                    {guardian.isHousehold ? " (family)" : ""}
                  </span>
                  <span className="ml-1.5 text-xs text-muted">
                    {relationshipLabel(guardian.relationshipType)}
                    {guardian.isPrimaryGuardian ? " · primary" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </td>

        <td className="px-4 py-2.5">
          {primary?.parentIdentifier ? (
            <code className="rounded-control bg-surface-2 px-2 py-1 font-mono text-xs">
              {primary.parentIdentifier}
            </code>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>

        <td className="px-4 py-2.5 text-xs">
          {primary ? (
            <>
              {primary.email ? (
                <span className="block">{primary.email}</span>
              ) : null}
              {primary.phone ? (
                <span className="block">{primary.phone}</span>
              ) : null}
              {!primary.email && !primary.phone ? (
                // Not an error state — a card-based guardian needs neither.
                <span className="text-muted">Card access only</span>
              ) : null}
            </>
          ) : row.registrationParent ? (
            <span className="text-warning">
              {row.registrationParent.phone ||
                row.registrationParent.email ||
                "No contact"}
            </span>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>

        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span
              title={coverage.hint}
              className={`badge badge-neutral inline-flex items-center gap-1.5 whitespace-nowrap ${coverage.tone}`}
            >
              <Glyph emoji={coverage.emoji} className="mr-1 inline align-[-2px]" /> {coverage.label}
            </span>

            {/* Add another guardian without hunting for it inside the panel.
                A student commonly has two. */}
            <button
              type="button"
              onClick={onAddGuardian}
              title="Add another guardian for this student"
              className="btn-icon btn-ghost flex shrink-0 items-center justify-center transition-colors"
            >
              <FaAddGuardian className="h-3 w-3" />
            </button>

            {/* Straight to a printed card for the common case, without needing
                to expand the row first. */}
            {primary && row.coverage !== "REVOKED" ? (
              <button
                type="button"
                onClick={() => showCard(primary.linkId)}
                disabled={issuing}
                title="Show access card (QR and Parent ID)"
                className="btn-icon btn-ghost flex shrink-0 items-center justify-center transition-colors"
              >
                <FaQrcode className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </td>
      </tr>

      {card ? (
        <tr>
          <td colSpan={8} className="p-0">
            <ParentCardDialog
              parentIdentifier={card.parentIdentifier}
              linkId={card.linkId || primary?.linkId}
              rotated={Boolean(card.rotated)}
              schoolName={card.schoolName || "Your school"}
              studentName={row.studentName}
              guardianName={primary?.name || "Guardian"}
              onClose={() => {
                setCard(null);
                onChanged();
              }}
            />
          </td>
        </tr>
      ) : null}

      {expanded ? (
        <tr className="border-b border-line bg-surface">
          <td colSpan={8} className="px-4 py-2.5">
            <GuardianManager
              student={{
                id: row.studentId,
                name: row.studentName,
                grade: row.grade,
              }}
              registrationParent={row.registrationParent}
              openAddForm={openAddForm}
              onAddFormOpened={onAddFormOpened}
              onChanged={onChanged}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function relationshipLabel(value) {
  if (!value) return "Guardian";
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
