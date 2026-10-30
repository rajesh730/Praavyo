"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell as FaBell, CalendarDays as FaCalendarAlt, SquarePen as FaEdit, Ellipsis as FaEllipsisH, Eye as FaEye, FileText as FaFileAlt, ListFilter as FaFilter, Globe as FaGlobe, Send as FaPaperPlane, Plus as FaPlus, Save as FaSave, Search as FaSearch, Trash2 as FaTrash } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AppDate from "@/components/common/AppDate";

const NOTICE_TYPES = [
  "GENERAL",
  "REGISTRATION",
  "ROUND_INSTRUCTIONS",
  "SCHEDULE_UPDATE",
  "SHORTLIST",
  "POSTPONEMENT",
  "CANCELLATION",
  "FINAL_RESULT",
];

const EMPTY_FORM = {
  title: "",
  message: "",
  type: "GENERAL",
  status: "PUBLISHED",
};


function label(value) {
  return String(value || "GENERAL").replaceAll("_", " ");
}

function statusClass(status) {
  if (status === "PUBLISHED") return "bg-success-soft text-success";
  if (status === "DRAFT") return "bg-warning-soft text-warning";
  return "bg-surface-2 text-ink";
}

function noticeIconClass(type = "") {
  const normalized = String(type).toUpperCase();
  if (normalized.includes("IMPORTANT")) return "bg-danger-soft text-danger";
  if (normalized.includes("SCHEDULE")) return "bg-warning-soft text-warning";
  if (normalized.includes("RESULT")) return "bg-brand-soft text-brand-strong";
  return "bg-brand-soft text-brand-strong";
}

export default function EventNoticeManager({ eventId, eventTitle = "Event", readOnly = false }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState("");
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [activeView, setActiveView] = useState("ALL");
  const [openMenuId, setOpenMenuId] = useState("");

  const fetchNotices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/events/${eventId}/notices`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load notices.");
      }
      setNotices(Array.isArray(data.notices) ? data.notices : []);
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const metrics = useMemo(
    () => ({
      total: notices.length,
      published: notices.filter((notice) => notice.status === "PUBLISHED").length,
      drafts: notices.filter((notice) => notice.status === "DRAFT").length,
      public: notices.filter(
        (notice) => String(notice.visibility || "PUBLIC").toUpperCase() === "PUBLIC"
      ).length,
    }),
    [notices]
  );

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...NOTICE_TYPES,
          ...notices.map((notice) => notice.type).filter(Boolean),
        ])
      ),
    [notices]
  );

  const filteredNotices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return notices.filter((notice) => {
      const status = String(notice.status || "").toUpperCase();
      const visibility = String(notice.visibility || "PUBLIC").toUpperCase();
      const matchesView =
        activeView === "ALL" ||
        (activeView === "PUBLISHED" && status === "PUBLISHED") ||
        (activeView === "DRAFT" && status === "DRAFT") ||
        (activeView === "SCHEDULED" && status === "SCHEDULED");
      const matchesSearch =
        !needle ||
        String(notice.title || "").toLowerCase().includes(needle) ||
        String(notice.message || "").toLowerCase().includes(needle);
      const matchesType =
        !typeFilter || String(notice.type || "GENERAL").toUpperCase() === typeFilter;
      const matchesStatus = !statusFilter || status === statusFilter;
      const matchesVisibility = !visibilityFilter || visibility === visibilityFilter;

      return (
        matchesView &&
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesVisibility
      );
    });
  }, [activeView, notices, search, statusFilter, typeFilter, visibilityFilter]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingNoticeId("");
  };

  const openCreate = () => {
    resetForm();
    setSelectedNotice(null);
    setShowForm(true);
  };

  const openEdit = (notice) => {
    setEditingNoticeId(notice._id);
    setSelectedNotice(null);
    setForm({
      title: notice.title || "",
      message: notice.message || "",
      type: notice.type || "GENERAL",
      status: notice.status || "DRAFT",
    });
    setShowForm(true);
  };

  const saveNotice = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setStatusMessage("");
      const method = editingNoticeId ? "PATCH" : "POST";
      const url = editingNoticeId
        ? `/api/events/${eventId}/notices/${editingNoticeId}`
        : `/api/events/${eventId}/notices`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to save notice.");
      }
      setStatusMessage(data.message || "Notice saved.");
      setShowForm(false);
      resetForm();
      await fetchNotices();
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNotice = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/events/${eventId}/notices/${deleteTarget._id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete notice.");
      }
      setStatusMessage(data.message || "Notice archived.");
      if (selectedNotice?._id === deleteTarget._id) {
        setSelectedNotice(null);
      }
      setDeleteTarget(null);
      await fetchNotices();
    } catch (error) {
      setStatusMessage(error.message);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-soft text-2xl text-brand-strong">
              <FaBell />
            </span>
            <div>
              <h2 className="font-semibold text-ink">Event Notices</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                {readOnly
                  ? "Notices and updates posted by the organizer for this event."
                  : "Create and manage notices for this event. Notices are shown on the public event page and the matching school dashboard card."}
              </p>
            </div>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={showForm ? () => setShowForm(false) : openCreate}
              className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaPlus />
              {showForm ? "Close" : "Create Notice"}
            </button>
          )}
        </div>

        {statusMessage && (
          <div className="mt-4 rounded-card border border-brand-line bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
            {statusMessage}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total Notices", metrics.total, "All time", FaFileAlt, "purple"],
          ["Published", metrics.published, "Live on event page", FaPaperPlane, "emerald"],
          ["Drafts", metrics.drafts, "Not yet published", FaCalendarAlt, "amber"],
          ["Public", metrics.public, "Visible to public", FaGlobe, "blue"],
        ].map(([title, value, detail, Icon, tone]) => {
          const toneClass =
            tone === "emerald"
              ? "bg-success-soft text-success"
              : tone === "amber"
              ? "bg-warning-soft text-warning"
              : tone === "blue"
              ? "bg-brand-soft text-brand-strong"
              : "bg-brand-soft text-brand-strong";
          return (
            <button
              key={title}
              type="button"
              onClick={() => {
                if (title === "Published") setActiveView("PUBLISHED");
                if (title === "Drafts") setActiveView("DRAFT");
                if (title === "Total Notices") setActiveView("ALL");
              }}
              className="card transition-colors hover:border-brand-line hover:bg-surface-2 p-4 text-left transition-colors hover:border-brand-line hover:bg-surface"
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-control ${toneClass}`}>
                  <Icon />
                </span>
                <span>
                  <span className="block text-xs font-semibold text-muted">
                    {title}
                  </span>
                  <strong className="block text-2xl font-semibold text-ink">
                    {value}
                  </strong>
                  <span className="block text-xs font-semibold text-muted">
                    {detail}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {showForm && (
        <section className="card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-ink">
              {editingNoticeId ? "Edit Event Notice" : `Create Notice for ${eventTitle}`}
            </h3>
          </div>
          <form onSubmit={saveNotice} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-muted">
                Title
              </span>
              <input
                required
                value={form.title}
                onChange={(e) =>
                  setForm((current) => ({ ...current, title: e.target.value }))
                }
                className="input w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-muted">
                Message
              </span>
              <textarea
                required
                value={form.message}
                onChange={(e) =>
                  setForm((current) => ({ ...current, message: e.target.value }))
                }
                className="input w-full"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-sm font-semibold text-muted">
                  Notice Type
                </span>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, type: e.target.value }))
                  }
                  className="input w-full"
                >
                  {NOTICE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {label(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-semibold text-muted">
                  Save As
                </span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, status: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Publish Notice</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="btn btn-secondary inline-flex items-center transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary inline-flex items-center gap-2 transition-colors"
              >
                <FaSave />
                {submitting ? "Saving..." : "Save Notice"}
              </button>
            </div>
          </form>
        </section>
      )}

      {selectedNotice && (
        <section className="card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="font-semibold text-ink">
                {selectedNotice.title}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {label(selectedNotice.type)} - Public event notice -{" "}
                <AppDate value={selectedNotice.publishedAt} mode="dateTime" fallback="Draft" />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNotice(null)}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
          <p className="mt-5 whitespace-pre-wrap text-ink">
            {selectedNotice.message}
          </p>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px_auto]">
          <div className="card flex h-11 items-center gap-3 px-4">
            <FaSearch className="text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notices..."
              className="input min-w-0 flex-1"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="input"
          >
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type} value={String(type).toUpperCase()}>
                {label(type)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="input"
          >
            <option value="">All Status</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
          <select
            value={visibilityFilter}
            onChange={(event) => setVisibilityFilter(event.target.value)}
            className="input"
          >
            <option value="">All Visibility</option>
            <option value="PUBLIC">Public</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setTypeFilter("");
              setStatusFilter("");
              setVisibilityFilter("");
              setActiveView("ALL");
            }}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaFilter />
            Clear
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4">
          <div className="flex flex-wrap">
            {[
              ["ALL", "All"],
              ["PUBLISHED", "Published"],
              ["DRAFT", "Drafts"],
              ["SCHEDULED", "Scheduled"],
            ].map(([id, title]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveView(id)}
                className={`relative min-h-11 px-4 text-xs font-semibold transition-colors ${
                  activeView === id
                    ? "text-brand-strong after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:rounded-full after:bg-brand"
                    : "text-muted hover:text-brand-strong"
                }`}
              >
                {title}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-muted">Sort by: Newest</span>
        </div>

        <div>
          {loading ? (
            <p className="p-6 text-center text-sm font-semibold text-muted">
              Loading notices...
            </p>
          ) : filteredNotices.length === 0 ? (
            <p className="p-6 text-center text-sm font-semibold text-muted">
              No notices match this view yet.
            </p>
          ) : (
            <div className="divide-line">
              {filteredNotices.map((notice) => (
                <article
                  key={notice._id}
                  className="grid gap-4 px-4 py-4 transition-colors hover:bg-surface lg:grid-cols-[1fr_230px]"
                >
                  <div className="flex gap-4">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-xl ${noticeIconClass(
                        notice.type
                      )}`}
                    >
                      <FaBell />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-brand uppercase">
                          {label(notice.type)}
                        </span>
                        <span
                          className={`badge badge-neutral uppercase ${statusClass(
                            notice.status
                          )}`}
                        >
                          {notice.status === "PUBLISHED" ? "Published" : "Draft"}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold text-ink">
                        {notice.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {notice.message}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-muted">
                        <AppDate value={notice.publishedAt || notice.createdAt} mode="dateTime" fallback="Draft" /> - Public
                      </p>
                    </div>
                  </div>
                  <div className="relative flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedNotice(notice)}
                      className="btn btn-secondary btn-sm inline-flex items-center gap-2"
                    >
                      <FaEye />
                      Preview
                    </button>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => openEdit(notice)}
                      className="btn btn-secondary btn-sm inline-flex items-center gap-2"
                    >
                      <FaEdit />
                      Edit
                    </button>
                    )}
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId((current) =>
                          current === notice._id ? "" : notice._id
                        )
                      }
                      className="btn btn-secondary btn-sm inline-flex items-center gap-2"
                    >
                      <FaEllipsisH />
                      More
                    </button>
                    )}
                    {!readOnly && openMenuId === notice._id && (
                      <div className="card absolute right-0 top-10 z-10 w-44 p-2 shadow-pop">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId("");
                            setDeleteTarget(notice);
                          }}
                          className="btn btn-ghost btn-sm flex w-full items-center gap-2 text-left"
                        >
                          <FaTrash />
                          Archive notice
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive this event notice?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" will no longer be shown on the event notice stream.`
            : ""
        }
        confirmLabel="Archive notice"
        tone="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteNotice}
      />
    </div>
  );
}
