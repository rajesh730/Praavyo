"use client";

import { useCallback, useState } from "react";

/**
 * Filter memory that lasts until the page is refreshed.
 *
 * `useRememberedState("student-result:grade", "")` behaves like `useState`,
 * but the value survives moving to another screen and coming back. The store
 * is a plain module-level Map, so:
 *
 *   - navigating inside Pravyo keeps it (the JS bundle stays loaded);
 *   - a refresh, a new tab, or signing out (`clearRememberedState`) resets it;
 *   - nothing is written to the server, localStorage or the URL.
 *
 * Each screen uses its own key prefix, so screens never share filters.
 */
const store = new Map();
let owner = null;

/** Forget every remembered value, e.g. when a different person signs in. */
export function clearRememberedState() {
  store.clear();
}

/** Called with the signed-in user's id; a different user starts clean. */
export function setRememberedStateOwner(userId) {
  const next = userId || null;
  if (next !== owner) {
    store.clear();
    owner = next;
  }
}

export function useRememberedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (store.has(key)) return store.get(key);
    return typeof initialValue === "function" ? initialValue() : initialValue;
  });

  const setRemembered = useCallback(
    (next) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? next(previous) : next;
        store.set(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  return [value, setRemembered];
}
