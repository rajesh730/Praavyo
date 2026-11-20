const eventName = 'pravyo:cas-data-changed';
const storageKey = 'pravyo:cas-data-changed';
let schoolId = '';
let source = null;
let reconnectTimer = null;

function dispatchChange(target = globalThis.window) {
  target?.dispatchEvent(new Event(eventName));
}

function closeRealtime() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  source?.close();
  source = null;
}

function connectRealtime() {
  if (typeof window === 'undefined' || !schoolId || source) return;
  source = new EventSource(`/api/realtime/stream?channels=${encodeURIComponent(`cas-assessment:${schoolId}`)}`);
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      if (payload?.channel === `cas-assessment:${schoolId}` && payload?.payload?.type === 'CAS_ASSESSMENT_CHANGED') {
        dispatchChange();
      }
    } catch {
      // A malformed notification never exposes data and can be ignored.
    }
  };
  source.onerror = () => {
    source?.close();
    source = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectRealtime, 3000);
  };
}

/** Configure one authenticated, school-scoped SSE stream for this browser tab. */
export function configureCasRealtime(nextSchoolId) {
  const next = String(nextSchoolId || '');
  if (next === schoolId) return;
  closeRealtime();
  schoolId = next;
  connectRealtime();
}

// Only invalidation metadata crosses tabs; school data stays in authenticated GETs.
export function publishCasChange(path, target = globalThis.window) {
  // School (/api/cas/) and teacher (/api/teacher/exams/) saves alike.
  if (!target || !/^\/api\/(cas|teacher\/exams)\//.test(path)) return;
  dispatchChange(target);
  try {
    target.localStorage.setItem(storageKey, `${Date.now()}:${Math.random()}`);
  } catch {
    // Same-tab updates and focus refresh still work when storage is unavailable.
  }
}

export function subscribeCasChanges(refresh, target = globalThis.window) {
  if (!target) return () => {};
  connectRealtime();
  const onStorage = (event) => {
    if (event.key === storageKey) refresh();
  };
  target.addEventListener(eventName, refresh);
  target.addEventListener('storage', onStorage);
  target.addEventListener('focus', refresh);
  return () => {
    target.removeEventListener(eventName, refresh);
    target.removeEventListener('storage', onStorage);
    target.removeEventListener('focus', refresh);
  };
}
