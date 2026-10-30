/**
 * Skeleton placeholders — brand-tinted shimmer surfaces.
 * Use the `.pravyo-skeleton` class (defined in globals.css) for the animation.
 */

export function Skeleton({ className = "", style }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 border-b border-line bg-surface-2 px-4 py-3">
        {Array.from({ length: cols }).map((_, j) => (
          <Skeleton key={j} className="h-3.5 flex-1 rounded-control" />
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton
                key={j}
                className="h-4 flex-1 rounded-control"
                style={j === 0 ? { maxWidth: "55%" } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

