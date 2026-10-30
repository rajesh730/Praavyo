"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { ArrowRight as FaArrowRight, Building2 as FaBuilding, CircleCheck as FaCheckCircle, Flame as FaFire, Layers as FaLayerGroup, MapPin as FaMapMarkerAlt, Newspaper as FaNewspaper, Search as FaSearch, SlidersHorizontal as FaSlidersH, Star as FaStar, RefreshCw as FaSyncAlt, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import { normalizeImageUrl } from "@/lib/imageUrls";
import PublicRegisterLink from "@/components/public/PublicRegisterLink";

function numberLabel(value) {
  const count = Number(value || 0);
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k+`;
  return String(count);
}

function metricValue(school, key) {
  return Number(school.profile?.highlightMetrics?.[key] || 0);
}

function activityValue(school, key) {
  return Number(school.activity?.[key] || 0);
}

function getProvince(school) {
  return school.province || "Province not listed";
}

function getDistrict(school) {
  return school.district || "District not listed";
}

function scoreSchool(school) {
  const spotlightScore = school.spotlight
    ? school.spotlight.priority === "PREMIUM"
      ? 850
      : 650
    : 0;
  const publicPostCount = activityValue(school, "publicPostCount");
  const recentPublicPostCount = activityValue(school, "recentPublicPostCount");
  const lastPublicAt = school.activity?.lastPublicAt
    ? new Date(school.activity.lastPublicAt).getTime()
    : 0;
  const ageDays = lastPublicAt
    ? Math.max(0, (Date.now() - lastPublicAt) / 86400000)
    : 999;
  const freshnessScore = lastPublicAt ? Math.max(0, 90 - ageDays) * 2 : 0;

  return (
    spotlightScore +
    Math.min(publicPostCount, 40) * 18 +
    Math.min(recentPublicPostCount, 12) * 28 +
    freshnessScore +
    metricValue(school, "eventsHosted") * 12 +
    metricValue(school, "eventsParticipated") * 8 +
    metricValue(school, "awardsCount") * 16 +
    Math.min(Number(school.studentCount || 0), 500)
  );
}

function searchScore(school, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const fields = [
    [school.name, 120],
    [school.location, 60],
    [school.district, 45],
    [school.province, 35],
    [school.profile?.tagline, 30],
    [school.profile?.summary, 18],
  ];

  return fields.reduce((score, [value, weight]) => {
    const text = String(value || "").toLowerCase();
    if (!text) return score;
    if (text === normalizedQuery) return score + weight * 2;
    if (text.startsWith(normalizedQuery)) return score + weight * 1.5;
    if (text.includes(normalizedQuery)) return score + weight;
    return score;
  }, 0);
}

function SchoolMark({ school, size = "h-12 w-12" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = normalizeImageUrl(school.profile?.coverImageUrl);
  const initial = (school.name || "S").charAt(0).toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-2 text-lg font-semibold text-brand-strong ${size}`.trim()}
    >
      {image && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="h-full w-full object-contain p-1"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

function SelectField({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`block min-w-0 ${className}`.trim()}>
      <span className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input w-full transition-colors"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SchoolRow({ school }) {
  const metrics = [
    [metricValue(school, "eventsHosted"), "Hosted", FaBuilding],
    [metricValue(school, "eventsParticipated"), "Joined", FaLayerGroup],
    [metricValue(school, "awardsCount"), "Awards", FaTrophy],
    [school.studentCount, "Students", FaUsers],
  ];
  const publicPostCount = activityValue(school, "publicPostCount");
  const recentPublicPostCount = activityValue(school, "recentPublicPostCount");
  const href = school.spotlight?.href || `/schools/${school.id}`;

  return (
    <Link
      href={href}
      className={` group grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b bg-surface px-1 py-5 transition-colors hover:bg-surface md:grid-cols-[64px_minmax(0,1fr)_auto] md:gap-4 md:px-0 md:py-6 ${
        school.spotlight ? "border-brand-line" : "border-line"
      }`}
    >
      <SchoolMark school={school} size="h-11 w-11 md:h-14 md:w-14" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 md:flex">
          {school.spotlight && (
            <span className="badge badge-brand inline-flex items-center gap-1 uppercase">
              <FaStar />
              Featured
            </span>
          )}
          {recentPublicPostCount > 0 && (
            <span className="badge badge-warning inline-flex items-center gap-1 uppercase">
              <FaFire />
              Active
            </span>
          )}
          <span className="badge badge-neutral inline-flex items-center gap-1 uppercase">
            <FaCheckCircle />
            Verified
          </span>
        </div>
        <h3 className="mt-2 break-words text-lg font-semibold leading-snug text-brand-strong group-hover:underline md:text-xl">
          {school.name}
        </h3>
        <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-muted md:text-sm">
          <FaMapMarkerAlt className="mt-1 shrink-0 text-brand" />
          <span className="line-clamp-1 md:line-clamp-none">{school.location || "Location not listed"}</span>
        </p>
        {school.profile?.summary && (
          <p className="mt-2 line-clamp-2 max-w-5xl text-sm leading-6 text-muted">
            {school.profile.summary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs md:text-sm">
          {metrics.map(([value, label, Icon]) => (
            <span
              key={label}
              className="flex items-center gap-1.5 text-muted"
            >
              <Icon className="text-brand" />
              {numberLabel(value)} {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-muted">
            <FaNewspaper className="text-brand" />
            {numberLabel(publicPostCount)} Posts
          </span>
        </div>
      </div>
      <span className="col-span-2 inline-flex min-h-9 items-center justify-center gap-2 self-center rounded-full border border-line-strong px-4 text-xs font-semibold text-brand transition-colors group-hover:bg-brand-soft md:col-span-1 md:min-h-10 md:text-sm">
        View Profile
        <FaArrowRight />
      </span>
    </Link>
  );
}

export default function PublicSchoolsDirectory({ schools = [] }) {
  const [query, setQuery] = useRememberedState("schools-directory:query", "");
  const [province, setProvince] = useState("All Provinces");
  const [district, setDistrict] = useState("All Districts");
  const [visibleCount, setVisibleCount] = useState(24);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const provinces = useMemo(
    () => ["All Provinces", ...new Set(schools.map(getProvince))],
    [schools]
  );

  const districts = useMemo(() => {
    const scopedSchools =
      province === "All Provinces"
        ? schools
        : schools.filter((school) => getProvince(school) === province);
    return ["All Districts", ...new Set(scopedSchools.map(getDistrict))];
  }, [province, schools]);

  const filteredSchools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return schools
      .map((school) => ({
        ...school,
        resultScore:
          scoreSchool(school) + (normalizedQuery ? searchScore(school, normalizedQuery) * 10 : 0),
      }))
      .filter((school) => {
        const searchable = `${school.name} ${school.location} ${school.profile?.tagline || ""} ${school.profile?.summary || ""}`.toLowerCase();
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (province !== "All Provinces" && getProvince(school) !== province) return false;
        if (district !== "All Districts" && getDistrict(school) !== district) return false;
        return true;
      })
      .sort((a, b) => b.resultScore - a.resultScore);
  }, [district, province, query, schools]);

  const visibleSchools = filteredSchools.slice(0, visibleCount);
  const hasMore = visibleCount < filteredSchools.length;

  const clearFilters = () => {
    setQuery("");
    setProvince("All Provinces");
    setDistrict("All Districts");
    setVisibleCount(24);
  };

  return (
    <div className="min-w-0">
      <div className="min-w-0">
        <section className="bg-surface px-1 pb-5 pt-3 md:px-0 md:pb-7 md:pt-5">
          <div className="flex flex-col gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                <span className="h-2.5 w-2.5 rounded-full bg-danger" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                School Search
              </div>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-ink md:text-3xl">
                Find public school profiles.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Results are ranked by featured placement, recent public activity,
                events, achievements, and search relevance.
              </p>
            </div>
          </div>
        </section>

        <section className="sticky top-[64px] z-10 border-b border-line bg-surface px-1 py-3 md:px-0">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className="btn btn-secondary hidden w-full items-center justify-between"
            aria-expanded={filtersOpen}
          >
            <span className="inline-flex items-center gap-2">
              <FaSlidersH />
              Search and filters
            </span>
            <span className="text-xs text-muted">
              {filtersOpen ? "Hide" : "Show"}
            </span>
          </button>
          <div className={`flex flex-col gap-3 lg:flex-row lg:items-end ${filtersOpen ? "is-open" : ""}`}>
            <label className="block min-w-0 lg:flex-1">
              <span className="sr-only">Search schools</span>
              <div className="card flex min-h-14 items-center gap-3 px-5 transition-colors">
                <FaSearch className="shrink-0 text-muted" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleCount(24);
                  }}
                  placeholder="Search school name, place, or profile"
                  className="input w-full"
                />
              </div>
            </label>
            <div className="grid gap-3 lg:contents">
              <SelectField
                label="Province"
                value={province}
                onChange={(value) => {
                  setProvince(value);
                  setDistrict("All Districts");
                  setVisibleCount(24);
                }}
                options={provinces}
                className="lg:w-56"
              />
              <SelectField
                label="District"
                value={district}
                onChange={(value) => {
                  setDistrict(value);
                  setVisibleCount(24);
                }}
                options={districts}
                className="lg:w-56"
              />
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaSyncAlt />
              Clear
            </button>
          </div>
        </section>

        <section id="schools" className="scroll-mt-28">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-1 py-4 md:px-0">
            <div>
              <h2 className="text-base font-semibold text-ink">
                {query.trim() ? "Search Results" : "Top School Results"}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-muted">
                Showing {filteredSchools.length} of {schools.length} public schools
              </p>
            </div>
            <PublicRegisterLink className="" size="md" />
          </div>

          {filteredSchools.length === 0 ? (
            <div className="bg-surface p-6 text-center text-sm font-semibold text-muted">
              No schools match these filters yet.
            </div>
          ) : (
            <div className="bg-surface">
              {visibleSchools.map((school) => (
                <SchoolRow key={school.id} school={school} />
              ))}
              {hasMore && (
                <div className="py-5 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + 24)}
                    className="btn btn-secondary inline-flex items-center justify-center transition-colors"
                  >
                    Load more schools
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
