import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

const STYLE_MAP = {
  info: "border-brand-line bg-brand-soft [&_.alert-icon]:text-brand",
  success: "border-success-line bg-success-soft [&_.alert-icon]:text-success",
  warning: "border-warning-line bg-warning-soft [&_.alert-icon]:text-warning",
  error: "border-danger-line bg-danger-soft [&_.alert-icon]:text-danger",
};

const ICON_MAP = {
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
};

export default function AlertBanner({ type = "info", title, message, action, className = "" }) {
  const styles = STYLE_MAP[type] || STYLE_MAP.info;
  const Icon = ICON_MAP[type] || ICON_MAP.info;

  return (
    <div
      className={`flex flex-col gap-3 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-start ${styles} ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="alert-icon mt-0.5 shrink-0">{Icon}</span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold text-ink">{title}</p>}
          {message && <p className={title ? "mt-0.5 text-body" : "text-body"}>{message}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-7 sm:pl-0">{action}</div>}
    </div>
  );
}
