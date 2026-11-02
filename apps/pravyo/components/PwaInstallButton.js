'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, X } from 'lucide-react';

const DISMISS_KEY = 'praavyo:install-dismissed-until';
const DISMISS_DAYS = 7;

const noopSubscribe = () => () => {};

/** "standalone|dismissed|ios" flags, read once on the client; "" on the server. */
function readDevice() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  return [standalone, dismissedNow(), /iPad|iPhone|iPod/.test(window.navigator.userAgent)].map(Number).join('');
}

function dismissedNow() {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

/**
 * Browser-controlled PWA installation, offered as a slim strip at the very top
 * of the page. It sits in the normal document flow — above the sticky top bar,
 * scrolling away with the page — so it never covers content or the phone tab
 * bar the way a floating button did.
 *
 * The install event is only available when the browser has accepted the
 * manifest and service worker; never fake a download when installation is not
 * possible. iPhone/iPad have no install event, so the strip explains "Add to
 * Home Screen" instead. "Not now" hides it for a week.
 */
export default function PwaInstallButton() {
  const [installEvent, setInstallEvent] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [closed, setClosed] = useState(false);
  // Device facts never change during a visit; the server snapshot renders nothing.
  const device = useSyncExternalStore(noopSubscribe, readDevice, () => '');
  const [standalone, dismissed, isIos] = [...device].map((flag) => flag === '1');
  const hidden = !device || standalone || dismissed || closed;

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (installEvent) {
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      setInstallEvent(null);
      if (outcome === 'accepted') setClosed(true);
      return;
    }
    setShowIosHint(true);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setClosed(true);
  }

  if (hidden || (!installEvent && !isIos)) return null;
  return (
    <aside className="install-strip cas-print-hide" aria-label="Install the Praavyo app">
      <span className="install-strip-icon" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pravyo-icon.png" alt="" width={24} height={24} />
      </span>
      <p className="install-strip-text">
        <strong>Praavyo app</strong>
        <span>
          {showIosHint ? (
            <>Tap <Share aria-label="Share" className="install-strip-inline-icon" /> then “Add to Home Screen”</>
          ) : (
            'Faster, works offline, instant notices'
          )}
        </span>
      </p>
      {!showIosHint && (
        <button type="button" onClick={install} className="install-strip-cta">
          <Download aria-hidden="true" />
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} className="install-strip-close" aria-label="Not now">
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
