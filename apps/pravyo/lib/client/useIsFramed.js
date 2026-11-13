"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True when this page is shown inside a frame — e.g. a public page opened in
 * a signed-in dashboard's viewer (components/dashboard/DashboardLinkProvider).
 * False during server rendering.
 */
export default function useIsFramed() {
  return useSyncExternalStore(
    subscribe,
    () => window.self !== window.top,
    () => false
  );
}
