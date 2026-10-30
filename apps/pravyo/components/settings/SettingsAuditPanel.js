"use client";

import AppDate from "@/components/common/AppDate";

function summarizeChanges(before, after) {
  if (!before || !after) return "Updated settings";

  const changes = [];

  const walk = (left, right, prefix = "") => {
    const keys = new Set([
      ...Object.keys(left || {}),
      ...Object.keys(right || {}),
    ]);

    keys.forEach((key) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      const beforeValue = left?.[key];
      const afterValue = right?.[key];

      if (
        beforeValue &&
        afterValue &&
        typeof beforeValue === "object" &&
        typeof afterValue === "object" &&
        !Array.isArray(beforeValue) &&
        !Array.isArray(afterValue)
      ) {
        walk(beforeValue, afterValue, nextPrefix);
        return;
      }

      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changes.push(nextPrefix);
      }
    });
  };

  walk(before, after);
  return changes.length > 0 ? changes.slice(0, 4) : ["Updated settings"];
}

export default function SettingsAuditPanel({
  title,
  description,
  entries = [],
  loading = false,
}) {
  return (
    <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-subtle">{description}</p>

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading recent activity...</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No settings changes have been recorded yet.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {entries.map((entry) => {
            const changes = summarizeChanges(entry.before, entry.after);
            return (
              <div
                key={entry._id}
                className="rounded-card border border-line-strong bg-surface p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {entry.performedBy?.name || "System"}{" "}
                      <span className="font-normal text-subtle">
                        ({entry.role || "Unknown role"})
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {entry.performedBy?.email || "No email available"}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    <AppDate value={entry.createdAt} mode="dateTime" fallback="Unknown time" />
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {changes.map((change) => (
                    <span
                      key={change}
                      className="badge badge-neutral text-xs"
                    >
                      {change}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
