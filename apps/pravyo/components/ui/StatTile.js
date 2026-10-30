// Canonical compact stat tile shared across roles (dashboards, portfolios).
// Plain presentational component — safe in both server and client components.
const ACCENTS = {
  indigo: "bg-brand-soft text-brand",
  amber: "bg-accent-soft text-accent",
  emerald: "bg-success-soft text-success",
  purple: "bg-brand-soft text-brand-strong",
  slate: "bg-surface-2 text-muted",
};

export default function StatTile({ icon: Icon, label, value, accent = "indigo" }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 p-3.5 sm:p-4">
      {Icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-lg ${ACCENTS[accent] || ACCENTS.indigo}`}>
          <Icon aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-tight tabular-nums text-ink sm:text-2xl">{value}</p>
        <p className="truncate text-xs font-medium text-muted">{label}</p>
      </div>
    </div>
  );
}
