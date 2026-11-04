"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * A dropdown you can type into: click to see every option, or type and only
 * the matching ones remain (a word in the label must START with what was
 * typed — "bas" finds "Inter-school Basketball", never "database").
 * Arrow keys move, Enter picks, Esc closes. Picking "" means "all".
 *
 * options: [{ value, label, hint? }]
 */
export default function SearchSelect({
  value,
  onChange,
  options,
  allLabel = "All",
  placeholder = "Type to search…",
  ariaLabel,
  maxShown = 100,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) || null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) =>
      String(option.label)
        .toLowerCase()
        .split(/[\s\-–—·/(),.]+/)
        .some((word) => word.startsWith(q)) || String(option.label).toLowerCase().startsWith(q)
    );
  }, [options, query]);

  // Row 0 is "all" (only when not searching); the rest are matches.
  const rows = query.trim() ? matches.slice(0, maxShown) : [{ value: "", label: allLabel }, ...matches.slice(0, maxShown)];

  const choose = (next) => {
    onChange(next);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && rows[active]) choose(rows[active].value);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="input w-full pr-16"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={open ? query : selected ? selected.label : ""}
        placeholder={open ? placeholder : allLabel}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {value && !open ? (
          <button type="button" aria-label="Clear" onMouseDown={(event) => event.preventDefault()} onClick={() => choose("")}
            className="grid h-7 w-7 place-items-center rounded-control text-muted hover:bg-surface-2 hover:text-ink">
            <X aria-hidden size={14} />
          </button>
        ) : null}
        <ChevronDown aria-hidden size={16} className="pointer-events-none mr-1 text-muted" />
      </span>

      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-pop">
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Nothing matches “{query}”.</li>
          ) : (
            rows.map((option, index) => (
              <li key={option.value || "__all"} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${index === active ? "bg-brand-soft" : ""} ${option.value === value ? "font-semibold text-brand-strong" : "text-ink"}`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.hint ? <span className="shrink-0 text-xs text-muted">{option.hint}</span> : null}
                </button>
              </li>
            ))
          )}
          {matches.length > maxShown && (
            <li className="px-3 py-2 text-xs text-muted">Showing {maxShown} of {matches.length}. Keep typing to narrow it.</li>
          )}
        </ul>
      )}
    </div>
  );
}
