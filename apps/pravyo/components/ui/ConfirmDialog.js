"use client";

import { useEffect } from "react";
import { TriangleAlert as FaExclamationTriangle, Info as FaInfoCircle, X as FaTimes } from "lucide-react";
import Button from "@/components/ui/Button";

const TONE = {
  danger: {
    icon: "text-danger bg-danger-soft",
    confirmVariant: "danger",
  },
  warning: {
    icon: "text-warning bg-warning-soft",
    confirmVariant: "primary",
  },
  info: {
    icon: "text-brand bg-brand-soft",
    confirmVariant: "primary",
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
  children,
}) {
  const styles = TONE[tone] || TONE.danger;
  const Icon = tone === "info" ? FaInfoCircle : FaExclamationTriangle;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="modal-panel">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${styles.icon}`}>
            <Icon aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="confirm-dialog-title" className="text-base">{title}</h2>
            {message && <p className="mt-1 text-sm text-muted">{message}</p>}
            {children}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="btn-icon btn-ghost btn-sm -mr-1 -mt-1"
            aria-label="Close confirmation"
          >
            <FaTimes />
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={styles.confirmVariant} disabled={busy} loading={busy} onClick={onConfirm}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
