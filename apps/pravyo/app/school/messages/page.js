"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Search, Inbox, Send, Check, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import SchoolConversation from "@/components/school/SchoolConversation";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import { schoolMessagesChannel } from "@/lib/messagingChannels";
import { formatRelativeShort } from "@/lib/parentFormat";

/**
 * Parent messages — one screen for the whole channel.
 *
 * Top: WHO the school is dealing with — Whole school, Whole grade (pick the
 * grade) or Choose parents (tick them, optionally within one grade) — with
 * the matching send button beside it, so the audience and the action are
 * read together. Below: search and All / Unread / Not messaged.
 *
 * Left: the people. Every row is a parent + child, whether or not they have
 * written yet, so the same list answers "who is waiting?" and "who do I want
 * to reach?".
 *
 * Right: the open conversation, a composer for a parent with no thread yet,
 * or the group composer. On phones only one side shows at a time.
 *
 * Group sends still arrive as one private thread per parent, so replies
 * never go to a group. Live over SSE — a parent's message appears on its own.
 */

const SCOPES = [
  { id: "ALL", label: "Whole school" },
  { id: "GRADE", label: "Whole grade" },
  { id: "CHOOSE", label: "Choose parents" },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function SchoolMessagesPage() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ messageable: 0, truncated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters are remembered until the page is refreshed.
  const [scope, setScope] = useRememberedState("messages:scope", "ALL");
  const [grade, setGrade] = useRememberedState("messages:grade", "");
  const [grades, setGrades] = useState([]);
  const [search, setSearch] = useRememberedState("messages:search", "");
  const [show, setShow] = useRememberedState("messages:show", "ALL");

  // Ticked rows (by guardian link id) for a group message.
  const [picked, setPicked] = useState(() => new Set());
  // undefined = nothing chosen yet (a notification's ?conversation= may pick
  // one); null = the user closed the conversation.
  const [chosenKey, setActiveKey] = useState(undefined);
  const [broadcast, setBroadcast] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const url = new URL("/api/school/messages/people", window.location.origin);
      // "Whole grade" needs a grade; "Choose parents" may narrow to one.
      const useGrade = scope !== "ALL" && grade;
      url.searchParams.set("scope", scope === "GRADE" || useGrade ? "GRADE" : "ALL");
      if (useGrade) url.searchParams.set("grade", grade);
      if (search.trim()) url.searchParams.set("search", search.trim());

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not load messages");

      setRows(json.data.rows || []);
      setMeta({
        messageable: json.data.messageable || 0,
        truncated: Boolean(json.data.truncated),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [scope, grade, search]);

  useEffect(() => {
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
  }, [load]);

  // The school's grades, for the filter.
  useEffect(() => {
    let active = true;
    fetch("/api/school/grade-structure", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => active && data && setGrades(data.grades || []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // The two panes take exactly the screen height left below the filters, so
  // the reply box is always on screen without scrolling the page. Measured
  // from the top of the document (not the viewport) so it does not change
  // while the page scrolls; set as a CSS variable, no re-render.
  const panesRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      const el = panesRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(460, Math.round(window.innerHeight - top - 16));
      el.style.setProperty("--pane-h", `${height}px`);
    };
    const frame = window.requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, [scope, grade, picked.size, status, error]);

  const schoolId =
    session?.user?.role === "SCHOOL_ADMIN" ? session.user.id : session?.user?.schoolId;
  const channel = schoolId ? schoolMessagesChannel(schoolId) : "";

  // A parent's message lands here on its own.
  useRealtimeChannel(channel, load, { enabled: Boolean(schoolId) });

  const counts = useMemo(() => ({
    ALL: rows.length,
    UNREAD: rows.filter((row) => row.unreadCount > 0).length,
    NEW: rows.filter((row) => !row.conversationId).length,
  }), [rows]);

  const visible = useMemo(() => {
    if (show === "UNREAD") return rows.filter((row) => row.unreadCount > 0);
    if (show === "NEW") return rows.filter((row) => !row.conversationId);
    // Waiting-for-a-reply conversations always sit at the top.
    return [...rows].sort((a, b) => (b.unreadCount > 0) - (a.unreadCount > 0));
  }, [rows, show]);

  // Notifications deep-link to a conversation; it opens once rows load,
  // until the user picks or closes one themselves.
  const deepLinked = requestedConversationId
    ? rows.find((row) => String(row.conversationId || "") === requestedConversationId)?.key || null
    : null;
  const activeKey = chosenKey === undefined ? deepLinked : chosenKey;
  // Derived, not stored: once a first message creates the thread, the row
  // reloads with a conversationId and the panel becomes the live chat.
  const activeRow = rows.find((row) => row.key === activeKey) || null;

  const chooseScope = (next) => {
    setScope(next);
    setPicked(new Set());
    setBroadcast(null);
    setActiveKey(null);
    if (next === "ALL") setGrade("");
  };

  const changeGrade = (value) => {
    setGrade(value);
    setPicked(new Set());
    setBroadcast(null);
    setActiveKey(null);
  };

  const togglePicked = (linkId) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  };

  if (status === "loading") {
    return (
      <DashboardLayout>
        <LoadingState title="Loading" message="Opening your messages." />
      </DashboardLayout>
    );
  }

  if (!["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"].includes(session?.user?.role)) {
    return (
      <DashboardLayout>
        <AlertBanner type="error" title="School access required" message="Only school staff can read parent messages." />
      </DashboardLayout>
    );
  }

  const gradeName = grades.find((g) => (g.originalValue || g._id) === grade)?.name || grade;
  const choosing = scope === "CHOOSE";
  const pickable = choosing ? visible.filter((row) => row.linkId) : [];
  const allPicked = pickable.length > 0 && pickable.every((row) => picked.has(row.linkId));

  const openGroup = (target, title) => {
    setBroadcast({ target, title });
    setActiveKey(null);
  };

  // The send button always names exactly who it reaches.
  // One button, "Write message". The line under it says exactly who will
  // receive it, so the school knows the audience before writing a word.
  const reach = meta.messageable;
  const send =
    scope === "ALL"
      ? {
          disabled: reach === 0,
          note: reach ? `Goes to all ${plural(reach, "parent")} of the school` : "No parents to message yet",
          warn: false,
          open: () => openGroup({ scope: "ALL" }, "Message to the whole school"),
        }
      : scope === "GRADE"
        ? {
            disabled: !grade || reach === 0,
            note: !grade
              ? "Choose a grade first"
              : reach ? `Goes to all ${plural(reach, "parent")} of ${gradeName}` : `No parents in ${gradeName} yet`,
            warn: !grade,
            open: () => openGroup({ grade }, `Message to all parents of ${gradeName}`),
          }
        : {
            disabled: picked.size === 0,
            note: picked.size ? `Goes to ${plural(picked.size, "selected parent")}` : "Tick parents in the list below",
            warn: picked.size === 0,
            open: () => openGroup({ linkIds: Array.from(picked) }, `Message to ${plural(picked.size, "selected parent")}`),
          };

  const paneOpen = Boolean(broadcast || activeRow);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-semibold text-ink">Parent messages</h1>
          {counts.UNREAD > 0 ? (
            <button type="button" onClick={() => setShow("UNREAD")}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-strong">
              <span aria-hidden className="h-2 w-2 rounded-full bg-white" />
              {plural(counts.UNREAD, "conversation")} waiting for a reply
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted">Everything has been answered</p>
          )}
        </div>

        <div className="card divide-y divide-line">
          {/* Row 1 — who, and the send button for exactly that audience */}
          <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:w-24">Message to</span>
            <div role="group" aria-label="Message to" className="grid grid-cols-3 rounded-control border border-line bg-surface-2 p-0.5 sm:inline-grid sm:w-auto">
              {SCOPES.map((option) => (
                <button key={option.id} type="button" aria-pressed={scope === option.id} onClick={() => chooseScope(option.id)}
                  className={`min-h-10 rounded-control px-2 py-1.5 text-xs font-semibold leading-tight transition-colors sm:px-3 sm:text-sm ${scope === option.id ? "bg-brand text-white shadow-card" : "text-muted hover:text-ink"}`}>
                  {option.label}
                </button>
              ))}
            </div>
            {scope !== "ALL" && (
              <select value={grade} onChange={(e) => changeGrade(e.target.value)} className="input lg:w-48" aria-label={scope === "GRADE" ? "Grade" : "Filter by grade"}>
                <option value="">{scope === "GRADE" ? "Choose a grade…" : "All grades"}</option>
                {grades.map((g) => (
                  <option key={g._id} value={g.originalValue || g._id}>{g.name}</option>
                ))}
              </select>
            )}
            <div className="flex flex-col items-stretch gap-1 lg:ml-auto lg:items-end">
              <button type="button" disabled={send.disabled} onClick={send.open} className="btn btn-primary inline-flex items-center justify-center gap-2">
                <Send aria-hidden size={15} /> Write message
              </button>
              <span className={`text-xs ${send.warn ? "text-warning" : "text-muted"}`}>{send.note}</span>
            </div>
          </div>

          {/* Row 2 — find someone, and which rows to show */}
          <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted lg:w-24">Find</span>
            <label className="relative flex-1">
              <span className="sr-only">Search parent or student</span>
              <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Type the start of a parent's or student's name" className="input w-full pl-9" />
            </label>
            <div role="group" aria-label="Show" className="grid grid-cols-3 rounded-control border border-line bg-surface-2 p-0.5">
              {[
                { id: "ALL", label: "All" },
                { id: "UNREAD", label: "Unread" },
                { id: "NEW", label: "Not messaged" },
              ].map((option) => (
                <button key={option.id} type="button" aria-pressed={show === option.id} onClick={() => setShow(option.id)}
                  className={`min-h-10 rounded-control px-2 py-1.5 text-xs font-semibold leading-tight transition-colors sm:px-3 sm:text-sm ${show === option.id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
                  {option.label}
                  <span className={`ml-1.5 text-xs ${option.id === "UNREAD" && counts.UNREAD ? "text-brand" : "text-muted"}`}>{counts[option.id]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <AlertBanner type="error" title="Could not load" message={error} /> : null}

        <div ref={panesRef} className="grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]">
          {/* ---- people ---- */}
          <section className={`card flex flex-col overflow-hidden lg:h-[var(--pane-h,640px)] ${paneOpen ? "hidden lg:flex" : ""} ${choosing && picked.size > 0 ? "mb-20 lg:mb-0" : ""}`}>
            {choosing && picked.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-brand-line bg-brand-soft px-3 py-2">
                <span className="text-sm font-semibold text-brand-strong">{plural(picked.size, "parent")} selected</span>
                <button type="button" onClick={() => setPicked(new Set())} className="btn btn-ghost btn-sm ml-auto">Clear</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {scope === "ALL" ? "Whole school" : grade ? gradeName : scope === "GRADE" ? "No grade chosen" : "All grades"} · {plural(visible.length, "parent")}
                </span>
                {choosing && pickable.length > 1 && (
                  <button type="button" onClick={() => setPicked(new Set(pickable.map((row) => row.linkId)))}
                    className="text-xs font-semibold text-brand hover:underline" disabled={allPicked}>
                    Select all
                  </button>
                )}
              </div>
            )}

            {loading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((index) => <div key={index} className="h-16 animate-pulse rounded-card bg-surface-2" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Inbox aria-hidden className="mx-auto text-subtle" size={28} />
                <p className="mt-3 font-semibold text-ink">
                  {scope === "GRADE" && !grade
                    ? "Choose a grade above"
                    : show === "UNREAD" ? "Nothing unread" : show === "NEW" ? "Everyone has a conversation" : "No parents found"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {scope === "GRADE" && !grade
                    ? "Pick the grade whose parents you want to message."
                    : search.trim() ? "Try another name, or clear the search." : "Parents appear here once guardians are linked to students."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {visible.map((row) => (
                  <PersonRow
                    key={row.key}
                    row={row}
                    selectable={choosing}
                    query={search.trim()}
                    active={activeKey === row.key}
                    picked={Boolean(row.linkId && picked.has(row.linkId))}
                    onPick={() => togglePicked(row.linkId)}
                    onOpen={() => {
                      setActiveKey(row.key);
                      setBroadcast(null);
                    }}
                  />
                ))}
              </ul>
            )}

            {meta.truncated ? (
              <p className="border-t border-line px-4 py-2 text-xs text-warning">
                Showing the first 150. Pick a grade or search to narrow this.
              </p>
            ) : null}
          </section>

          {/* ---- conversation / composer ---- */}
          <section className={`card flex-col overflow-hidden lg:static lg:z-auto lg:h-[var(--pane-h,640px)] ${paneOpen ? "fixed inset-0 z-[60] flex h-[100dvh] rounded-none border-0 lg:rounded-card lg:border" : "hidden lg:flex"}`}>
            {broadcast ? (
              <Composer
                key={broadcast.title}
                title={broadcast.title}
                subtitle="Each parent receives it as their own private conversation, so replies never go to a group."
                target={broadcast.target}
                onCancel={() => setBroadcast(null)}
                onSent={() => {
                  setBroadcast(null);
                  setPicked(new Set());
                  load();
                }}
              />
            ) : activeRow?.conversationId ? (
              <SchoolConversation
                key={activeRow.conversationId}
                conversationId={activeRow.conversationId}
                channel={channel}
                onReplied={load}
                onClose={() => setActiveKey(null)}
              />
            ) : activeRow ? (
              <Composer
                key={activeRow.key}
                title={activeRow.guardianName}
                subtitle={`${activeRow.relationship} of ${activeRow.studentName}${activeRow.grade ? ` · ${activeRow.grade}` : ""}. This starts your conversation.`}
                target={{ linkId: activeRow.linkId }}
                warning={activeRow.connected ? "" : "This parent has not signed in to Praavyo yet. The message waits until they use their Parent Access Card."}
                onCancel={() => setActiveKey(null)}
                onSent={load}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand"><Inbox aria-hidden size={26} /></span>
                <p className="mt-4 font-semibold text-ink">Choose a parent to read and reply</p>
                <p className="mt-1 max-w-xs text-sm text-muted">
                  To send one message to many, pick Whole school, Whole grade or Choose parents above, then Write message.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {choosing && picked.size > 0 && !paneOpen ? (
        <div className="fixed inset-x-0 z-40 border-t border-brand-line bg-surface px-4 py-3 shadow-pop lg:hidden"
          style={{ bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{plural(picked.size, "parent")} selected</span>
            <button type="button" onClick={() => setPicked(new Set())} className="btn btn-ghost btn-sm">Clear</button>
            <button type="button" onClick={send.open} className="btn btn-primary btn-sm inline-flex items-center gap-1">
              <Send aria-hidden size={14} /> Write message
            </button>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}

/**
 * A name with the searched part marked — the same rule as the server: it
 * matches at the start of the name or of a later word, never mid-word.
 */
function Match({ text, query }) {
  const value = String(text || "");
  const q = String(query || "").trim();
  if (!q) return value;
  const lower = value.toLowerCase();
  const needle = q.toLowerCase();
  let at = -1;
  for (let i = 0; i <= lower.length - needle.length; i += 1) {
    if ((i === 0 || /\s/.test(lower[i - 1])) && lower.startsWith(needle, i)) {
      at = i;
      break;
    }
  }
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark className="rounded-sm bg-warning-soft px-0.5 font-bold text-ink">{value.slice(at, at + q.length)}</mark>
      {value.slice(at + q.length)}
    </>
  );
}

/** One parent + child. The tick on the left adds them to a group message. */
function PersonRow({ row, selectable, query, active, picked, onPick, onOpen }) {
  const unread = row.unreadCount > 0;
  // Unread rows: a blue bar on the left, a tinted background, bold text and
  // a "New" badge — readable at a glance, and not by colour alone.
  const tone = active
    ? "bg-brand-soft"
    : unread
      ? "bg-brand-soft/60"
      : "";
  return (
    <li className={`relative flex items-stretch ${tone}`}>
      {unread ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" /> : null}
      {selectable && row.linkId ? (
        <button type="button" onClick={onPick} aria-pressed={picked} aria-label={`Select ${row.guardianName}`}
          className="flex shrink-0 items-center pl-3 pr-1">
          <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-control border ${picked ? "border-brand bg-brand text-white" : "border-line-strong bg-surface"}`}>
            {picked ? <Check size={12} /> : null}
          </span>
        </button>
      ) : selectable ? <span className="w-9 shrink-0" /> : null}

      <button type="button" onClick={onOpen}
        aria-label={unread ? `${row.guardianName}, ${row.unreadCount} unread` : undefined}
        className={`flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 text-left transition-colors hover:bg-surface-2 ${selectable ? "pl-2" : "pl-4"}`}>
        <span aria-hidden className="relative shrink-0">
          <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${unread ? "bg-brand text-white ring-2 ring-brand-line ring-offset-2 ring-offset-surface" : "bg-surface-2 text-muted"}`}>
            {initials(row.guardianName)}
          </span>
          {unread ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-danger" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate ${unread ? "text-base font-bold text-ink" : "text-sm font-semibold text-ink"}`}><Match text={row.guardianName} query={query} /></span>
            {row.lastMessageAt ? (
              <span className={`shrink-0 text-2xs ${unread ? "font-bold text-brand" : "text-muted"}`}>{formatRelativeShort(row.lastMessageAt)}</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted">
            {row.relationship} of <span className="font-medium text-ink"><Match text={row.studentName} query={query} /></span>{row.grade ? ` · ${row.grade}` : ""}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-semibold text-ink" : "text-muted"}`}>
              {row.conversationId ? (
                <>
                  {row.lastMessageSenderType === "STAFF" ? "You: " : ""}
                  {row.subject ? <strong>{row.subject}{row.preview ? " — " : ""}</strong> : null}
                  {row.preview}
                </>
              ) : (
                <span className="italic text-subtle">{row.connected ? "No messages yet" : "Not signed in yet"}</span>
              )}
            </span>
            {unread ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">
                New <span className="rounded-full bg-white/25 px-1">{row.unreadCount}</span>
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Write and send — to one parent, or to a whole group.
 *
 * Deliberately not a Notice: notices carry read receipts, acknowledgement and
 * consent. Using them for "the bus is late" teaches parents to skim the channel
 * that also carries school closures.
 */
function Composer({ title, subtitle, target, warning = "", onSent, onCancel }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/school/guardians/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, ...target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not send");
      setResult(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success"><Check aria-hidden size={28} /></span>
        <p className="mt-4 text-lg font-semibold text-ink">Sent to {plural(result.sent, "parent")}</p>
        {result.notConnected > 0 ? (
          <p className="mt-3 max-w-sm rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">
            {result.notConnected} of them have not signed in to Praavyo yet. They will see it once they use their Parent Access Card.
          </p>
        ) : null}
        <button type="button" onClick={onSent} className="btn btn-primary mt-5">Done</button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close" className="btn-icon btn-ghost btn-sm -mr-1">
          <X aria-hidden size={20} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {warning ? <p className="rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">{warning}</p> : null}

        <label className="block">
          <span className="text-sm font-semibold text-ink">Subject <span className="font-normal text-muted">(optional)</span></span>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Sports day on Friday"
            maxLength={200} className="input mt-1.5 w-full" />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-ink">Message</span>
          <textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Write in simple words — most parents read this on a phone."
            className="input mt-1.5 w-full leading-relaxed" />
        </label>

        <p className="text-xs text-muted">
          Need a read receipt, an acknowledgement or a parent&apos;s permission? Publish a <strong className="text-ink">Notice</strong> instead.
        </p>

        {error ? <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 lg:pb-3">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button type="button" onClick={send} disabled={sending || !message.trim()} className="btn btn-primary inline-flex flex-1 items-center justify-center gap-2 sm:flex-none">
          <Send aria-hidden size={14} /> {sending ? "Sending…" : "Send message"}
        </button>
      </footer>
    </div>
  );
}
