'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { publishCasChange, subscribeCasChanges } from './casSync.js';

// Per-tab cache only: it makes ordinary in-app revisits instant without
// persisting school data to disk or carrying it into a later login session.
const queryCache = new Map();
const QUERY_CACHE_MS = 45_000;

function cachedQuery(path) {
  const entry = queryCache.get(path);
  return entry && entry.expiresAt > Date.now() ? entry.data : null;
}

export function invalidateCasQueryCache(path) {
  if (path) queryCache.delete(path);
  else queryCache.clear();
}

/**
 * Minimal fetch helpers for the CAS API.
 *
 * Every route returns `{ data }` or `{ error }`, so the unwrapping and error
 * shape live here once rather than in every screen.
 */

export async function casFetch(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON response is still a failure we need to report usefully.
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (!payload || !Object.hasOwn(payload, 'data')) {
    throw new Error('The server returned an invalid response. Please try again.');
  }
  return payload?.data;
}

/**
 * GET a path and keep it in state. Pass `null` to skip the request.
 *
 * `path` is the only dependency because every parameter a caller varies is
 * already encoded in the query string — so the URL changing IS the signal to
 * refetch, and there is no second list to keep in sync with it.
 */
export function useCasQuery(path) {
  const [result, setResult] = useState(null);
  // Bumped by reload() to re-run the effect without changing the path.
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    invalidateCasQueryCache(path);
    setNonce((n) => n + 1);
  }, [path]);
  useEffect(() => path?.startsWith('/api/cas/') ? subscribeCasChanges(reload) : undefined, [path, reload]);
  const setData = useCallback((data) => {
    setResult((previous) => ({
      path, nonce, error: '',
      data: typeof data === 'function' ? data(previous?.path === path ? previous.data : null) : data,
    }));
  }, [path, nonce]);

  useEffect(() => {
    const id = ++requestId.current;
    if (!path) return undefined;
    const controller = new AbortController();
    const cached = cachedQuery(path);
    if (cached) {
      setResult({ path, nonce, data: cached, error: '' });
      return () => controller.abort();
    }

    casFetch(path, { signal: controller.signal })
      .then((result) => {
        // Ignore a response a newer request has already superseded.
        if (!controller.signal.aborted && id === requestId.current) {
          queryCache.set(path, { data: result, expiresAt: Date.now() + QUERY_CACHE_MS });
          setResult({ path, nonce, data: result, error: '' });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError' || id !== requestId.current) return;
        setResult({ path, nonce, data: null, error: err.message });
      });

    return () => controller.abort();
  }, [path, nonce]);

  // Hide old data during the render that changes the URL, before effects run.
  // A previous child's sheet must never appear beneath a new child's name.
  const current = path && result?.path === path && result.nonce === nonce;
  return {
    data: current ? result.data : null,
    error: current ? result.error : '',
    loading: Boolean(path && !current),
    reload,
    setData,
  };
}

/** POST/PATCH/PUT/DELETE with pending + error state for a form button. */
export function useCasMutation() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const run = useCallback(async (path, options, { successMessage } = {}) => {
    if (inFlight.current) return { ok: false, pending: true };
    inFlight.current = true;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      const result = await casFetch(path, options);
      // A saved assessment or published result must be visible immediately;
      // clear the in-memory read cache before screens request new data.
      invalidateCasQueryCache();
      publishCasChange(path);
      if (successMessage) setSuccess(successMessage);
      return { ok: true, data: result };
    } catch (err) {
      setError(err.message);
      return { ok: false, error: err.message, status: err.status };
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, success, setError, setSuccess };
}
