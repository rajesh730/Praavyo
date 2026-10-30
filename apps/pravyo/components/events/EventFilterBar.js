"use client";

import { ListFilter as FaFilter, Search as FaSearch } from "lucide-react";

function formatOption(value) {
  return String(value || "").replaceAll("_", " ");
}

export default function EventFilterBar({
  tabs,
  activeFilter,
  onFilterChange,
  search,
  onSearchChange,
  typeFilter,
  onTypeChange,
  typeOptions = [],
  gradeFilter,
  onGradeChange,
  gradeOptions = [],
  visibilityFilter,
  onVisibilityChange,
  showFilters,
  onToggleFilters,
  onClear,
  accent = "blue",
  getNotificationCount,
  onSurfaceSeen,
}) {
  const activeText = accent === "purple" ? "text-brand-strong" : "text-brand-strong";
  const activeLine =
    accent === "purple" ? "after:bg-brand" : "after:bg-brand";
  const activeCount =
    accent === "purple"
      ? "bg-brand-soft text-brand-strong"
      : "bg-brand-soft text-brand-strong";
  const focusBorder =
    accent === "purple" ? "" : "";

  return (
    <div className="border-b border-line">
      <div className="flex flex-wrap gap-0 px-4">
        {tabs.map(({ key, label, icon: Icon, count, surface }) => {
          const showDot =
            Boolean(surface) &&
            Number(getNotificationCount?.(surface) || 0) > 0 &&
            activeFilter !== key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onFilterChange(key);
                if (surface) onSurfaceSeen?.(surface);
              }}
              className={`relative inline-flex min-h-14 items-center gap-2 px-5 text-sm font-semibold transition-colors ${
                activeFilter === key
                  ? `${activeText} after:absolute after:bottom-0 after:left-0 after:h-[3px] after:w-full after:rounded-full ${activeLine}`
                  : "text-ink hover:bg-surface"
              }`}
            >
              <span className="relative inline-flex">
                <Icon />
                {showDot && (
                  <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-danger" />
                )}
              </span>
              {label}
              {count > 0 && (
                <span
                  className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold ${
                    activeFilter === key
                      ? activeCount
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className={`grid gap-3 border-t border-line p-4 ${
          onVisibilityChange
            ? "sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_150px_150px_150px_auto_auto]"
            : "sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_auto_auto]"
        }`}
      >
        <div className="relative">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search events..."
            className={`input w-full pl-11 pr-4 transition-colors ${focusBorder}`}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => onTypeChange(event.target.value)}
          className={`input ${focusBorder} ${
            showFilters ? "" : "hidden"
          }`}
        >
          <option value="">All Types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {formatOption(type)}
            </option>
          ))}
        </select>
        <select
          value={gradeFilter}
          onChange={(event) => onGradeChange(event.target.value)}
          className={`input ${focusBorder} ${
            showFilters ? "" : "hidden"
          }`}
        >
          <option value="">All Grades</option>
          {gradeOptions.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
        {onVisibilityChange && (
          <select
            value={visibilityFilter}
            onChange={(event) => onVisibilityChange(event.target.value)}
            className={`input ${focusBorder} ${
              showFilters ? "" : "hidden"
            }`}
          >
            <option value="">All Visibility</option>
            <option value="INVITED">School Visible</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
        )}
        <button
          type="button"
          onClick={onClear}
          className="btn btn-secondary inline-flex items-center justify-center"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={showFilters}
          className="btn btn-secondary inline-flex items-center justify-center gap-2"
        >
          <FaFilter />
          Filters
        </button>
      </div>
    </div>
  );
}
