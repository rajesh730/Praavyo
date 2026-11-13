"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X as FaTimes } from "lucide-react";
import { downloadPdfFromPage } from "@pravyo/cas/lib/client/pdfDownload";
import { useNotification } from "@/components/NotificationSystem";
import useIsFramed from "@/lib/client/useIsFramed";
import { isDashboardPath, isSignedInAreaPath, resolveDashboardLink } from "@/lib/dashboardLinks";

/**
 * Keeps signed-in people inside their dashboard (see lib/dashboardLinks.js).
 *
 * Mounted once at the app root. On every signed-in screen (admin, school, CAS,
 * internal exam, teacher, student, parent) it:
 *   - catches clicks on links to the public site — including saved
 *     notification links and `target="_blank"` buttons — and opens them in a
 *     viewer on top of the dashboard instead;
 *   - exposes `useDashboardLink()` for code that navigates programmatically
 *     (notification bells), so those follow the same rules.
 */

const DashboardLinkContext = createContext(null);

function DashboardViewer({ title, href, onClose, onLeaveToDashboard }) {
  const frameRef = useRef(null);
  const closeRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleLoad = () => {
    setLoading(false);
    try {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow) return;
      // A link inside the viewer that lands on a dashboard page (e.g. `/`,
      // which redirects a signed-in user) belongs in the real window, not in
      // a dashboard nested inside the viewer.
      const { pathname, search, hash } = frameWindow.location;
      if (isDashboardPath(pathname)) {
        onLeaveToDashboard(`${pathname}${search}${hash}`);
        return;
      }
      // Focus moves into the frame on click; Escape must still close it.
      frameWindow.document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") onClose();
      });
    } catch {
      // Cross-origin content cannot be inspected; the close button still works.
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-sheet flex h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-card bg-surface shadow-pop max-sm:h-[92dvh] max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 truncate text-base">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-icon btn-ghost btn-sm -mr-1.5"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-surface-2">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" role="status">
              <div className="progress-bar w-40" aria-hidden="true" />
              <span className="sr-only">Loading…</span>
            </div>
          )}
          <iframe
            ref={frameRef}
            title={title}
            src={href}
            onLoad={handleLoad}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

export function DashboardLinkProvider({ children }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  // The notification context object changes on every toast; a ref keeps the
  // click listener from being re-attached each time.
  const notify = useNotification();
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  // { href, title, pathname } — remembered with the screen it was opened on,
  // so moving to another screen closes it.
  const [opened, setOpened] = useState(null);
  const viewer = opened && opened.pathname === pathname ? opened : null;
  // Inside the viewer itself the rule is off — the outer window owns it.
  const framed = useIsFramed();

  const role = session?.user?.role || null;
  const active = Boolean(role) && !framed && isSignedInAreaPath(pathname || "");

  const resolve = useCallback(
    (href) =>
      resolveDashboardLink(href, {
        role,
        origin: window.location.origin,
        currentPath: window.location.pathname,
      }),
    [role]
  );

  const run = useCallback(
    (result) => {
      if (result.action === "navigate") {
        router.push(result.href);
      } else if (result.action === "viewer") {
        setOpened({ href: result.href, title: result.title, pathname });
      } else if (result.action === "download") {
        notifyRef.current.info("Preparing the PDF…", 2500);
        downloadPdfFromPage(result.href).catch((error) => notifyRef.current.error(error.message));
      }
    },
    [router, pathname]
  );

  const open = useCallback(
    (href) => {
      if (!href) return;
      const result = active ? resolve(href) : null;
      if (result) run(result);
      else router.push(href);
    },
    [active, resolve, run, router]
  );

  useEffect(() => {
    if (!active) return undefined;

    function handleClick(event) {
      if (event.defaultPrevented) return;
      // Left click (with or without Ctrl/Cmd/Shift) and middle click: a new
      // tab of the public page is still outside the dashboard.
      if (event.type === "click" && event.button !== 0) return;
      if (event.type === "auxclick" && event.button !== 1) return;

      const link = event.target?.closest?.("a[href]");
      if (!link || link.hasAttribute("download")) return;

      const result = resolve(link.href);
      if (!result) return;

      if (result.action === "navigate") {
        // Ordinary dashboard links keep their own behaviour; only links the
        // rules re-point (public event page → dashboard event) are taken over.
        const own = new URL(link.href);
        if (`${own.pathname}${own.search}${own.hash}` === result.href) return;
      }

      event.preventDefault();
      run(result);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("auxclick", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("auxclick", handleClick, true);
    };
  }, [active, resolve, run]);

  const closeViewer = useCallback(() => setOpened(null), []);
  const leaveToDashboard = useCallback(
    (href) => {
      setOpened(null);
      router.push(href);
    },
    [router]
  );

  const value = useMemo(() => ({ open }), [open]);

  return (
    <DashboardLinkContext.Provider value={value}>
      {children}
      {active && viewer && (
        <DashboardViewer
          key={viewer.href}
          title={viewer.title}
          href={viewer.href}
          onClose={closeViewer}
          onLeaveToDashboard={leaveToDashboard}
        />
      )}
    </DashboardLinkContext.Provider>
  );
}

/**
 * `open(href)` for code that navigates without a link (notification bells,
 * buttons): applies the same stay-in-the-dashboard rules as a click.
 */
export function useDashboardLink() {
  const context = useContext(DashboardLinkContext);
  const router = useRouter();
  return useCallback(
    (href) => {
      if (context) context.open(href);
      else if (href) router.push(href);
    },
    [context, router]
  );
}
