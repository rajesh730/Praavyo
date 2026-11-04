"use client";

import { useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { MessageSquareText, Search, Star, X } from "lucide-react";
import AppDate from "@/components/common/AppDate";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";

/**
 * The school's feedback inbox: everything its students and parents sent.
 * One table, filtered by who sent it, status and grade, with a name/title
 * search. Clicking a row opens the full message; the school marks it
 * reviewed or archives it. (The school's own feedback to Praavyo is sent
 * from the menu under the school's name.)
 */

const TYPE_LABEL = {
  GENERAL: "General",
  BUG: "Problem",
  SUGGESTION: "Suggestion",
  EXPERIENCE: "Experience",
};
const STATUS = {
  NEW: { label: "New", tone: "badge-warning" },
  REVIEWED: { label: "Reviewed", tone: "badge-success" },
  ARCHIVED: { label: "Archived", tone: "badge-neutral" },
};

const gradeSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

function fromLine(item) {
  if (item.submitterRole === "PARENT") {
    return `Parent${item.aboutStudentName ? ` of ${item.aboutStudentName}` : ""}${item.grade ? ` · ${item.grade}` : ""}`;
  }
  return `Student${item.grade ? ` · ${item.grade}` : ""}`;
}

/** Word-start match on the sender, the child and the title. */
function matches(item, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  return `${item.submitterName} ${item.aboutStudentName} ${item.title}`
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.startsWith(t));
}

function Stars({ rating }) {
  if (!rating) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-ink">
      <Star aria-hidden size={14} className="fill-current text-warning" /> {rating}
    </span>
  );
}

export default function SchoolFeedbackInbox() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [open, setOpen] = useState(null);

  const [from, setFrom] = useRememberedState("feedback-inbox:from", "");
  const [status, setStatus] = useRememberedState("feedback-inbox:status", "");
  const [grade, setGrade] = useRememberedState("feedback-inbox:grade", "");
  const [query, setQuery] = useRememberedState("feedback-inbox:query", "");

  useEffect(() => {
    let live = true;
    fetch("/api/feedback?scope=inbox", { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.message || "Could not load feedback");
        if (live) setItems(Array.isArray(payload.feedback) ? payload.feedback : []);
      })
      .catch((loadError) => live && setError(loadError.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const grades = useMemo(() => [...new Set(items.map((item) => item.grade).filter(Boolean))].sort(gradeSort), [items]);
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (!from || item.submitterRole === from) &&
          (!status || item.status === status) &&
          (!grade || item.grade === grade) &&
          matches(item, query.trim())
      ),
    [items, from, status, grade, query]
  );
  const newCount = items.filter((item) => item.status === "NEW").length;

  const setItemStatus = async (item, next) => {
    setBusyId(item.id);
    setError("");
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Could not update feedback");
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, status: next } : row)));
      setOpen((current) => (current?.id === item.id ? { ...current, status: next } : current));
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyId("");
    }
  };

  // Opening a new message marks it reviewed.
  const openItem = (item) => {
    setOpen(item);
    if (item.status === "NEW") void setItemStatus(item, "REVIEWED");
  };

  const actions = (item) => (
    <div className="flex flex-wrap justify-end gap-2">
      {item.status !== "REVIEWED" && (
        <button type="button" disabled={busyId === item.id} onClick={(e) => { e.stopPropagation(); setItemStatus(item, "REVIEWED"); }}
          className="btn btn-secondary btn-sm whitespace-nowrap">
          Mark reviewed
        </button>
      )}
      {item.status !== "ARCHIVED" ? (
        <button type="button" disabled={busyId === item.id} onClick={(e) => { e.stopPropagation(); setItemStatus(item, "ARCHIVED"); }}
          className="btn btn-ghost btn-sm whitespace-nowrap">
          Archive
        </button>
      ) : (
        <button type="button" disabled={busyId === item.id} onClick={(e) => { e.stopPropagation(); setItemStatus(item, "NEW"); }}
          className="btn btn-ghost btn-sm whitespace-nowrap">
          Restore
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-ink">Feedback</h1>
        <p className="mt-1 text-sm text-muted">
          What your students and parents tell the school.
          {newCount > 0 ? <span className="ml-1 font-semibold text-warning">{newCount} new.</span> : null}
        </p>
      </div>

      {error && <AlertBanner type="error" title="Feedback" message={error} />}

      {/* filters, one line */}
      <div className="card flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
        <div role="group" aria-label="From" className="grid grid-cols-3 rounded-control border border-line bg-surface-2 p-0.5 lg:mr-auto">
          {[
            { id: "", label: "All" },
            { id: "STUDENT", label: "Students" },
            { id: "PARENT", label: "Parents" },
          ].map((option) => (
            <button key={option.id || "all"} type="button" aria-pressed={from === option.id} onClick={() => setFrom(option.id)}
              className={`min-h-9 rounded-control px-3 py-1 text-sm font-semibold transition-colors ${from === option.id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select className="input sm:w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All status</option>
            <option value="NEW">New</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select className="input sm:w-36" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
            <option value="">All grades</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label className="relative col-span-2 block sm:w-64">
            <span className="sr-only">Search by name or title</span>
            <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-full pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or title" />
          </label>
        </div>
      </div>

      {loading ? (
        <LoadingState title="Loading feedback" message="Collecting what students and parents sent." />
      ) : visible.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <MessageSquareText aria-hidden className="mx-auto text-subtle" size={28} />
          <p className="mt-3 font-semibold text-ink">{items.length ? "No feedback matches these filters" : "No feedback yet"}</p>
          <p className="mt-1 text-sm text-muted">
            {items.length ? "Try another filter." : "Students send it from their Feedback page, parents from the parent app."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">From</th>
                <th scope="col" className="px-4 py-3">Feedback</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Rating</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((item) => (
                <tr key={item.id} onClick={() => openItem(item)}
                  className={`cursor-pointer align-top transition-colors ${item.status === "NEW" ? "bg-warning-soft/50 hover:bg-warning-soft" : "hover:bg-surface-2"}`}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="block font-semibold text-ink">{item.submitterName || "Someone"}</span>
                    <span className="block text-xs text-muted">{fromLine(item)}</span>
                  </td>
                  <td className="max-w-0 px-4 py-3">
                    <span className="block truncate font-semibold text-ink">{item.title}</span>
                    <span className="block truncate text-xs text-muted">{item.message}</span>
                    <span className="block text-2xs text-subtle"><AppDate value={item.createdAt} mode="dateTime" /></span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{TYPE_LABEL[item.type] || "General"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><Stars rating={item.rating} /></td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`badge text-xs ${STATUS[item.status]?.tone || "badge-neutral"}`}>{STATUS[item.status]?.label || item.status}</span>
                  </td>
                  <td className="px-4 py-3">{actions(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-line md:hidden">
            {visible.map((item) => (
              <li key={item.id} className={item.status === "NEW" ? "bg-warning-soft/50" : ""}>
                <button type="button" onClick={() => openItem(item)} className="block w-full px-4 pt-3 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold text-ink">{item.title}</span>
                    <span className={`badge shrink-0 text-xs ${STATUS[item.status]?.tone || "badge-neutral"}`}>{STATUS[item.status]?.label}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">{item.submitterName} · {fromLine(item)}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-ink">{item.message}</span>
                </button>
                <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-2">
                  <span className="text-xs text-muted"><AppDate value={item.createdAt} /> · <Stars rating={item.rating} /></span>
                  {actions(item)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={() => setOpen(null)}>
          <div className="modal-panel !max-w-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="feedback-title" className="text-lg font-bold text-ink">{open.title}</h2>
                <p className="text-sm text-muted">{open.submitterName} · {fromLine(open)}</p>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="btn-icon btn-ghost btn-sm -mr-1 -mt-1" aria-label="Close">
                <X aria-hidden size={18} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className={`badge text-xs ${STATUS[open.status]?.tone || "badge-neutral"}`}>{STATUS[open.status]?.label}</span>
              <span>{TYPE_LABEL[open.type] || "General"}</span>
              <Stars rating={open.rating} />
              <AppDate value={open.createdAt} mode="dateTime" />
            </div>
            <p className="whitespace-pre-wrap rounded-control border border-line bg-surface-2 p-4 text-sm leading-7 text-ink">{open.message}</p>
            <div className="flex justify-end">{actions(open)}</div>
          </div>
        </div>
      )}

    </div>
  );
}
