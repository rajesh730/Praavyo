"use client";

import AppDate from "@/components/common/AppDate";
import { getWritingCategoryLabel } from "@/lib/writingCategories";

/**
 * The one table every Student Publishing tab uses — School Wall, Show To
 * Home and the writing inside a magazine — styled like the magazine list so
 * the three read the same:
 *
 *   Writing (posted date) · Student · Grade · Type · <status> · actions
 *
 * Clicking a row opens the writing to read. Status cells may hold a switch
 * (Free Writing: School wall / Global wall); the action buttons on the right
 * say exactly what they do. On phones the rows stack.
 */
export default function PublishingTable({
  rows,
  statusHeader,
  renderStatus,
  // optional second status column (Free Writing: School wall + Global wall)
  status2Header = "",
  renderStatus2 = null,
  renderActions = () => null,
  onOpen,
  isNew = () => false,
}) {
  const stop = (event) => event.stopPropagation();

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-4 py-3">Writing</th>
            <th scope="col" className="px-4 py-3">Student</th>
            <th scope="col" className="px-4 py-3">Grade</th>
            <th scope="col" className="px-4 py-3">Type</th>
            <th scope="col" className="px-4 py-3">{statusHeader}</th>
            {renderStatus2 && <th scope="col" className="px-4 py-3">{status2Header}</th>}
            <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const fresh = isNew(row);
            return (
              <tr
                key={row.id}
                onClick={() => onOpen(row)}
                className={`cursor-pointer transition-colors ${fresh ? "bg-warning-soft/60 hover:bg-warning-soft" : "hover:bg-surface-2"}`}
              >
                <td className="max-w-0 px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-ink">{row.title}</span>
                    {fresh && <span className="badge badge-warning shrink-0 text-2xs">New</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Posted <AppDate value={row.submittedAt || row.updatedAt} mode="dateTime" />
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{row.authorStudent?.name || "Student"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{row.authorStudent?.grade || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{getWritingCategoryLabel(row.category)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted" onClick={stop}>{renderStatus(row)}</td>
                {renderStatus2 && <td className="whitespace-nowrap px-4 py-3 text-muted" onClick={stop}>{renderStatus2(row)}</td>}
                <td className="px-4 py-3" onClick={stop}>
                  <div className="flex flex-wrap justify-end gap-2">{renderActions(row)}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => {
          const fresh = isNew(row);
          return (
            <li key={row.id} className={fresh ? "bg-warning-soft/60" : ""}>
              <button type="button" onClick={() => onOpen(row)} className="block w-full px-4 pt-3 text-left">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-semibold text-ink">{row.title}</span>
                  {fresh && <span className="badge badge-warning shrink-0 text-2xs">New</span>}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {row.authorStudent?.name || "Student"}
                  {row.authorStudent?.grade ? ` · ${row.authorStudent.grade}` : ""} · {getWritingCategoryLabel(row.category)}
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-2 text-xs text-muted">
                <span className="inline-flex items-center gap-2">{statusHeader} {renderStatus(row)}</span>
                {renderStatus2 && <span className="inline-flex items-center gap-2">{status2Header} {renderStatus2(row)}</span>}
                {renderActions(row)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * An on/off switch with its state written next to it ("Shown" /
 * "Not shown"), for a status cell.
 */
export function PlacementSwitch({
  on,
  busy = false,
  disabled = false,
  label,
  onToggle,
  onText = "Shown",
  offText = "Not shown",
  title = "",
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={busy || disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center gap-2 whitespace-nowrap text-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
      <span className={on ? "font-semibold text-success" : "text-muted"}>{on ? onText : offText}</span>
    </button>
  );
}
