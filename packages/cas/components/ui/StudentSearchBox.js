'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const MAX_SUGGESTIONS = 50;

/**
 * One box to find results: type to search, or pick a student.
 *
 *   - Click it (or the arrow) to see the grade's students, roll order.
 *   - Type: the list narrows to matching names / roll numbers as you type.
 *   - Choose a student (click, or ↑ ↓ and Enter): `onSelectStudent(id)`.
 *   - Enter without choosing: `onSearch(text)`, a free search (name, roll or
 *     result title), offered as the first line of the list too.
 *   - × clears both.
 *
 * `students`: [{ id, name, rollNumber }]. `studentId` / `search`: the current
 * filter, owned by the page. `meta(student)`, optional: extra detail at the
 * end of a suggestion (Mark Entry shows its green/yellow/red progress there).
 * `searchHint`: what a free search looks through.
 */
export default function StudentSearchBox({
  students = [], studentId = '', search = '', onSelectStudent, onSearch, loading = false, t = (en) => en,
  placeholder, meta, searchHint,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const selected = students.find((student) => student.id === studentId) || null;
  const [draft, setDraft] = useState(null); // text being typed; null = show the current filter
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const shown = draft ?? (selected ? labelOf(selected) : search);
  const query = (draft ?? '').trim().toLowerCase();
  const matches = useMemo(() => {
    const list = query
      ? students.filter((student) => student.name.toLowerCase().includes(query) || String(student.rollNumber || '').toLowerCase().startsWith(query))
      : students;
    return list.slice(0, MAX_SUGGESTIONS);
  }, [students, query]);
  // Line 0 is "Search for …" when something is typed; students follow.
  const offset = query ? 1 : 0;
  const total = matches.length + offset;

  function choose(index) {
    if (query && index === 0) {
      onSearch(draft.trim());
      onSelectStudent('');
    } else {
      const student = matches[index - offset];
      if (!student) return;
      onSelectStudent(student.id);
      onSearch('');
    }
    setDraft(null);
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onSelectStudent('');
    onSearch('');
    setDraft(null);
    setActive(-1);
    inputRef.current?.focus();
    setOpen(true);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(total - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0) choose(active);
      else if (draft !== null) {
        onSearch(draft.trim());
        onSelectStudent('');
        setDraft(null);
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setDraft(null);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={shown}
        placeholder={placeholder || t('Type a name or roll, or pick a student', 'नाम वा रोल लेख्नुहोस्, वा विद्यार्थी छान्नुहोस्')}
        className="w-full pl-9 pr-16"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setDraft(null); setActive(-1); }}
        onChange={(event) => { setDraft(event.target.value); setOpen(true); setActive(event.target.value.trim() ? 0 : -1); }}
        onKeyDown={onKeyDown}
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {(shown || studentId) && (
          <button type="button" className="rounded p-1 text-subtle hover:text-ink" aria-label={t('Clear', 'हटाउनुहोस्')} onMouseDown={(event) => event.preventDefault()} onClick={clear}>
            <X size={15} />
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-subtle hover:text-ink"
          aria-label={t('Show students', 'विद्यार्थी देखाउनुहोस्')}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { setOpen((value) => !value); inputRef.current?.focus(); }}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-control border border-line bg-surface py-1 text-sm shadow-lg">
          {query && (
            <Option id={`${listId}-0`} active={active === 0} onPick={() => choose(0)} onHover={() => setActive(0)}>
              <Search size={14} aria-hidden className="shrink-0 text-brand" />
              <span>{t('Search for', 'खोज्नुहोस्')} “<strong>{draft.trim()}</strong>”</span>
              <span className="ml-auto text-xs text-subtle">{searchHint || t('name, roll or result title', 'नाम, रोल वा नतिजा शीर्षक')}</span>
            </Option>
          )}
          {loading && !students.length ? (
            <li className="px-3 py-2 text-muted">{t('Loading students…', 'विद्यार्थी लोड हुँदैछ…')}</li>
          ) : matches.length ? matches.map((student, index) => (
            <Option
              key={student.id}
              id={`${listId}-${index + offset}`}
              active={active === index + offset}
              selected={student.id === studentId}
              onPick={() => choose(index + offset)}
              onHover={() => setActive(index + offset)}
            >
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">{student.rollNumber || '—'}</span>
              <span className="truncate"><Highlight text={student.name} query={query} /></span>
              {meta && <span className="ml-auto shrink-0">{meta(student)}</span>}
            </Option>
          )) : (
            <li className="px-3 py-2 text-muted">{students.length ? t('No student matches — press Enter to search anyway.', 'कुनै विद्यार्थी मिलेन — खोज्न Enter थिच्नुहोस्।') : t('No students in this grade.', 'यस कक्षामा विद्यार्थी छैनन्।')}</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Option({ id, active, selected = false, onPick, onHover, children }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${active ? 'bg-brand-soft' : ''} ${selected ? 'font-semibold text-brand' : 'text-ink'}`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      {children}
    </li>
  );
}

/** The matching part of a name, in bold. */
function Highlight({ text, query }) {
  if (!query) return text;
  const at = text.toLowerCase().indexOf(query);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong className="text-brand">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

function labelOf(student) {
  return `${student.rollNumber ? `${student.rollNumber}. ` : ''}${student.name}`;
}
