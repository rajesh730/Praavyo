import { useEffect } from "react";
import { X as FaTimes } from "lucide-react";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  panelClassName = "",
  bodyClassName = "",
  headerClassName = "",
  titleClassName = "",
}) {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className={`modal-sheet flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-card bg-surface shadow-pop max-sm:max-h-[92dvh] max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] ${panelClassName}`}>
        <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5 ${headerClassName}`}>
          <h2 className={`min-w-0 truncate text-base ${titleClassName}`}>{title}</h2>
          <button type="button" onClick={onClose} className="btn-icon btn-ghost btn-sm -mr-1.5" aria-label="Close dialog">
            <FaTimes />
          </button>
        </div>
        <div className={`overflow-y-auto p-5 ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
}
