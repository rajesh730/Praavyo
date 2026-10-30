'use client';

import { useState } from 'react';
import { downloadPdfFromPage } from '../lib/client/pdfDownload.js';

/**
 * A download link that saves the PDF of a print page (`href`) straight to a
 * file, without opening a tab or the print dialog. The href stays real so the
 * page can still be opened with a middle click.
 */
export default function PdfDownloadLink({ href, className = '', children, ...rest }) {
  const [busy, setBusy] = useState(false);

  async function download(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await downloadPdfFromPage(href);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <a
      {...rest}
      href={href}
      onClick={download}
      aria-busy={busy || undefined}
      className={`${className} ${busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      {children}
    </a>
  );
}
