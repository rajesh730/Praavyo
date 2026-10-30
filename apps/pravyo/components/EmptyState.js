import { Search as FaSearch } from "lucide-react";
import Button from "@/components/ui/Button";

export default function EmptyState({
  title = "Nothing to show yet",
  description,
  message,
  icon: Icon = FaSearch,
  action,
  actionLabel,
  onAction,
}) {
  const helperText =
    description ||
    message ||
    "When the right information is available, it will appear here automatically.";

  return (
    <div className="empty-state flex flex-col items-center justify-center px-5 py-10 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-xl text-subtle ring-1 ring-line">
        <Icon aria-hidden="true" />
      </span>
      <h3 className="text-base">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{helperText}</p>
      {action && <div className="mt-4">{action}</div>}
      {!action && actionLabel && onAction && (
        <Button type="button" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
