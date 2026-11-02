'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Share, X } from 'lucide-react';

/**
 * "Install the app", offered as one small button inside each shell's top bar
 * rather than a full-width strip over every page.
 *
 * The browser fires `beforeinstallprompt` once per page load, often before any
 * top bar has rendered, so the event is caught here at module level (see
 * `InstallPromptCapture`, mounted in the root layout) and shared with every
 * button through a tiny store.
 *
 * Never fakes a download: Android/desktop Chrome show the button only once the
 * browser has accepted the manifest and service worker. iPhone/iPad have no
 * install event, so the button explains "Add to Home Screen" instead.
 */

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "prompt" (browser can install), "ios" (show the hint) or "" (hide). */
function readMode() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (installed || standalone) return '';
  if (deferredPrompt) return 'prompt';
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) ? 'ios' : '';
}

/** Mount once, early, so the install event is never missed. Renders nothing. */
export function InstallPromptCapture() {
  return null;
}

export default function InstallAppButton({ className = '' }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => '');
  const [showHint, setShowHint] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!showHint) return undefined;
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setShowHint(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showHint]);

  if (!mode) return null;

  async function install() {
    if (mode === 'ios') {
      setShowHint((open) => !open);
      return;
    }
    const prompt = deferredPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    // A prompt can only be used once, whatever the person chose.
    deferredPrompt = null;
    emit();
  }

  return (
    <span ref={wrapRef} className={`install-app cas-print-hide ${className}`}>
      <button type="button" onClick={install} className="install-app-btn" aria-expanded={mode === 'ios' ? showHint : undefined}>
        <Download aria-hidden="true" />
        <span>Install app</span>
      </button>
      {showHint && (
        <span className="install-app-hint" role="status">
          Tap <Share aria-label="Share" className="install-app-inline-icon" /> then “Add to Home Screen”.
          <button type="button" onClick={() => setShowHint(false)} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </span>
      )}
    </span>
  );
}
