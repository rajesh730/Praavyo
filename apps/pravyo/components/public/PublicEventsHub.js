"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { ArrowRight as FaArrowRight, CalendarDays as FaCalendarAlt, Circle as FaCircle, FlaskConical as FaFlask, Volleyball as FaFutbol, MapPin as FaMapMarkerAlt, Music as FaMusic, Paintbrush as FaPaintBrush, PenTool as FaPenNib, School as FaSchool, Search as FaSearch, Drama as FaTheaterMasks, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import {
  EVENT_STATUS_FILTERS,
  formatEventDate,
  getEventPublicStatus,
} from "@/lib/eventUiStatus";
import {
  PUBLIC_EXPLORE_ITEMS,
  PublicSidebarGroup,
} from "@/components/public/PublicExplorePanel";

const VIEW_FILTERS = [
  ["all", "All Events"],
  ...EVENT_STATUS_FILTERS.filter((filter) => filter.id !== "all").map(
    (filter) => [filter.id, filter.label]
  ),
];

function getPreview(value = "", maxLength = 126) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function EventTypeIcon({ eventType = "", className = "" }) {
  const type = String(eventType || "").toUpperCase();
  if (type.includes("SPORTS")) return <FaFutbol className={className} />;
  if (type.includes("FESTIVAL")) return <FaMusic className={className} />;
  if (type.includes("WORKSHOP")) return <FaFlask className={className} />;
  if (type.includes("EXHIBITION")) return <FaPaintBrush className={className} />;
  if (type.includes("SHOWCASE")) return <FaTheaterMasks className={className} />;
  if (type.includes("OTHER")) return <FaPenNib className={className} />;
  return <FaTrophy className={className} />;
}

function EventSidebar() {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-24">
        <PublicSidebarGroup
          title="Public Pages"
          items={PUBLIC_EXPLORE_ITEMS}
          active="events"
        />
      </div>
    </aside>
  );
}

function FeaturedEvent({ event }) {
  if (!event) {
    return (
      <section className="card p-4 sm:p-5">
        <p className="text-2xs font-semibold uppercase text-brand-strong">
          Events
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">
          Public events will appear here.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Once schools publish approved events, students can explore
          details and results here.
        </p>
      </section>
    );
  }

  const status = getEventPublicStatus(event);
  return (
    <section className="card p-4">
      <div className="grid gap-5 lg:grid-cols-[92px_minmax(0,1fr)_auto] lg:items-center">
        <div className="hidden sm:flex h-20 w-20 items-center justify-center rounded-card bg-surface-2 text-3xl text-brand-strong">
          <EventTypeIcon eventType={event.eventType} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-neutral uppercase">
              Featured Event
            </span>
            <span className={`badge badge-neutral uppercase ${status.className}`}>
              {status.label}
            </span>
          </div>
          <h1 className="mt-3 break-words text-2xl font-semibold leading-tight text-ink md:text-3xl">
            {event.title}
          </h1>
          <p className="hidden sm:block mt-2 max-w-3xl text-sm leading-6 text-muted">
            {getPreview(event.description, 150)}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
            <span className="inline-flex items-center gap-2">
              <FaCalendarAlt className="text-brand-strong" />
              {formatEventDate(event.date)}
            </span>
            <span className="inline-flex items-center gap-2">
              <FaMapMarkerAlt className="text-brand-strong" />
              {event.schoolName || "Praavyo"}
            </span>
            <span className="hidden sm:inline-flex items-center gap-2">
              <FaUsers className="text-brand-strong" />
              {event.participantCount}+ participants
            </span>
          </div>
        </div>
        <Link
          href={event.href}
          className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
        >
          View Details
          <FaArrowRight />
        </Link>
      </div>
    </section>
  );
}

function LiveEventsStrip({ events = [], onViewAll }) {
  if (!events.length) return null;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase text-danger">
            <FaCircle className="text-2xs" />
            Active / live
          </h2>
          <p className="mt-1 text-xs font-semibold text-muted">
            {events.length} event{events.length === 1 ? "" : "s"} currently active
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="btn btn-secondary btn-sm inline-flex items-center transition-colors"
        >
          View active events
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {events.slice(0, 3).map((event) => (
          <Link
            key={event.id}
            href={event.href}
            className="card transition-colors hover:border-brand-line hover:bg-surface-2 group p-3 transition-colors hover:border-danger-line hover:bg-surface"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-danger-soft text-danger">
                <EventTypeIcon eventType={event.eventType} />
              </span>
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-ink group-hover:text-danger">
                  {event.title}
                </p>
                <p className="mt-1 line-clamp-1 text-xs font-semibold text-muted">
                  {event.schoolName || "Praavyo"} - {formatEventDate(event.date)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function EventRow({ event }) {
  const hasPublicResults =
    event.eventScope === "PLATFORM" &&
    event.resultsPublished &&
    event.publicResultsEnabled;
  const status = getEventPublicStatus(event);

  return (
    <Link
      href={event.href}
      className="card transition-colors hover:border-brand-line hover:bg-surface-2 group flex gap-3.5 items-start p-4 transition-colors hover:border-brand-line sm:grid sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-4 sm:items-center"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-2 text-xl text-brand-strong sm:h-14 sm:w-14 sm:rounded-control sm:text-2xl">
        <EventTypeIcon eventType={event.eventType} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <span className={`badge badge-neutral uppercase ${status.className}`}>
            {status.label}
          </span>
          <span className="badge badge-neutral uppercase">
            {event.eventType}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold text-ink group-hover:text-brand-strong">
          {event.title}
        </h3>
        <p className="hidden sm:block mt-1 line-clamp-2 text-sm leading-5 text-muted">
          {getPreview(event.description)}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <FaCalendarAlt className="text-brand-strong" />
            {formatEventDate(event.date)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FaSchool className="text-brand-strong" />
            {event.schoolName || "Praavyo"}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <FaUsers className="text-brand-strong" />
            {event.schoolCount} schools / {event.participantCount}+ students
          </span>
        </div>
      </div>
      <div className="self-center text-subtle sm:hidden shrink-0 pl-1">
        <FaArrowRight className="text-xs text-brand-strong group-hover:translate-x-0.5 transition-colors" />
      </div>
      <span className="hidden sm:inline-flex min-h-10 items-center justify-center gap-2 self-center rounded-control border border-line px-4 text-sm font-semibold text-brand-strong transition-colors group-hover:bg-surface-2">
        {hasPublicResults ? "View Results" : "View Details"}
        <FaArrowRight />
      </span>
    </Link>
  );
}

export default function PublicEventsHub({ initialData }) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useRememberedState("events-hub:view", "all");
  const [activeCategory] = useState("ALL");
  const [query, setQuery] = useRememberedState("events-hub:query", "");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/public/events-hub", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to load events");
      setData(payload);
    } catch (_error) {
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimeChannel(
    ["events", "public-feed", "work-indicators"],
    useCallback(() => {
      void load({ silent: true });
    }, [load])
  );

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  const allEvents = useMemo(() => {
    const map = new Map();
    [
      data.featuredEvent,
      ...(data.liveEvents || []),
      ...(data.upcomingEvents || []),
      ...(data.resultsEvents || []),
    ]
      .filter(Boolean)
      .forEach((event) => map.set(event.id, event));
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );
  }, [data.featuredEvent, data.liveEvents, data.resultsEvents, data.upcomingEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allEvents.filter((event) => {
      const status = getEventPublicStatus(event);
      if (activeView !== "all" && status.key !== activeView) return false;
      if (activeCategory !== "ALL" && event.eventType !== activeCategory) return false;
      if (!normalizedQuery) return true;
      return `${event.title} ${event.description} ${event.schoolName}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeCategory, activeView, allEvents, query]);

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
      <EventSidebar />

      <main className="min-w-0 space-y-4">
        <FeaturedEvent event={data.featuredEvent} />

        <LiveEventsStrip
          events={data.liveEvents || []}
          onViewAll={() => setActiveView("live")}
        />

        <section className="card p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <label className="relative block min-w-0">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events or schools..."
                className="input w-full pl-11 pr-4 transition-colors"
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              {VIEW_FILTERS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveView(id)}
                  className={`btn btn-ghost btn-sm shrink-0 transition-colors ${
                    activeView === id
                      ? "bg-brand text-white"
                      : "border border-line bg-surface text-ink hover:bg-surface-2 hover:text-brand-strong"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Public Events
              </h2>
              <p className="text-xs font-semibold text-muted">
                Showing {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
              </p>
            </div>
            {loading && (
              <span className="text-xs font-semibold text-muted">
                Refreshing...
              </span>
            )}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="card p-6 text-center text-sm font-semibold text-muted">
              No public events match this view yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
