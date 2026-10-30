/**
 * Page title block shared by every module: optional icon and eyebrow, the
 * title, a one-line description, extra meta, and the page's primary actions.
 */
export default function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  meta,
  className = "",
}) {
  return (
    <section className={`mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-control border border-brand-line bg-brand-soft text-lg text-brand sm:flex">
            <Icon aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-xl sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
          {meta && <div className="mt-3">{meta}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </section>
  );
}
