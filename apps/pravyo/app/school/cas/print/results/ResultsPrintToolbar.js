'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Download as FaDownload, Printer as FaPrint } from 'lucide-react';
import { answerPdfRequest, downloadSheets } from '@pravyo/cas/lib/client/pdfDownload';

const sheets = () => document.querySelectorAll('main .cas-a4');

/**
 * Screen-only controls for the many-card print page.
 *
 * `?print=1` opens the print dialog on load; `?download=1` saves the cards as
 * a PDF file instead (Student Result and Published Results ask for that from
 * a hidden frame).
 */
export default function ResultsPrintToolbar({ lang, count, autoPrint, autoDownload, fileName }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const answered = useRef(false);

  useEffect(() => {
    // The browser names a printed PDF after the page title.
    document.title = fileName;
    if (!autoPrint) return undefined;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, fileName]);

  useEffect(() => {
    if (!autoDownload || answered.current) return;
    answered.current = true;
    answerPdfRequest(sheets(), fileName).catch((error) => window.alert(error.message));
  }, [autoDownload, fileName]);

  async function download() {
    setDownloading(true);
    try {
      await downloadSheets(sheets(), fileName);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDownloading(false);
    }
  }

  const other = new URLSearchParams(searchParams.toString());
  other.set('lang', lang === 'ne' ? 'en' : 'ne');
  other.delete('print');
  other.delete('download');
  other.delete('pdfToken');

  return (
    <div className="cas-print-hide mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div className="flex items-center gap-3 text-sm">
        <Link href="/school/cas/student-result" className="font-semibold text-brand">
          ← Student Result
        </Link>
        <span className="text-muted">
          {count} report card{count === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`${pathname}?${other}`}
          className="btn btn-secondary inline-flex items-center font-semibold"
        >
          {lang === 'ne' ? 'English' : 'नेपाली'}
        </Link>
        <button
          type="button"
          disabled={!count}
          onClick={() => window.print()}
          className="btn btn-secondary inline-flex items-center gap-2 font-semibold"
        >
          <FaPrint className="text-xs" /> Print
        </button>
        <button
          type="button"
          disabled={!count || downloading}
          onClick={download}
          className="btn btn-primary inline-flex items-center gap-2 font-semibold"
        >
          <FaDownload className="text-xs" /> {downloading ? 'Preparing PDF...' : 'Download PDF'}
        </button>
      </div>
    </div>
  );
}
