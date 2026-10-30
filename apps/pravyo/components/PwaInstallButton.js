'use client';

import { useEffect, useState } from 'react';
import { Download as FaDownload } from 'lucide-react';

/**
 * Browser-controlled PWA installation. The install event is only available
 * when the browser has accepted the manifest and service worker; never fake a
 * download when installation is not possible.
 */
export default function PwaInstallButton() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return undefined;
    setIsIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent));
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function install() {
    if (installEvent) {
      installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
      return;
    }
    setShowIosHint(true);
  }

  if (!installEvent && !isIos) return null;
  return (
    <aside className="card cas-print-hide fixed bottom-4 right-4 z-50 max-w-xs p-3 shadow-pop">
      <button type="button" onClick={install} className="btn btn-primary inline-flex items-center gap-2">
        <FaDownload aria-hidden="true" />
        Download app
      </button>
      {showIosHint && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          On iPhone or iPad, open the Share menu in Safari and choose “Add to Home Screen”.
        </p>
      )}
    </aside>
  );
}
