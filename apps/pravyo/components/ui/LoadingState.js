export default function LoadingState({
  title = "Preparing this screen",
  message = "Getting the latest information ready for you.",
  className = "",
  icon: Icon,
  iconDescription,
  action,
  showAction = true,
}) {
  return (
    <div className={`card flex min-h-[14rem] flex-col items-center justify-center px-6 py-8 text-center ${className}`} role="status" aria-live="polite">
      {Icon ? (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-control bg-brand-soft text-lg text-brand">
          <Icon aria-label={iconDescription || "Loading icon"} />
        </span>
      ) : (
        <div className="progress-bar mb-4 w-32" aria-hidden="true" />
      )}
      <h3 className="text-base">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {showAction && action && <div className="mt-4">{action}</div>}
    </div>
  );
}
