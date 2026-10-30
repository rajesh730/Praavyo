"use client";

import { useEffect, useRef, useState } from "react";
import { Download as FaDownload, Printer as FaPrint } from "lucide-react";
import {
  answerPdfRequest,
  downloadSheets,
} from "@pravyo/cas/lib/client/pdfDownload";

// The unscaled sheets, so each PDF page is full A4 whatever the screen width.
const sheets = () => document.querySelectorAll(".certificate-viewport-inner");

export default function BulkPrintBar({
  count,
  autoDownload = false,
  fileName = "Certificates",
}) {
  const answeredRef = useRef(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!autoDownload || answeredRef.current) return;
    answeredRef.current = true;
    answerPdfRequest(sheets(), fileName).catch((error) =>
      window.alert(error.message)
    );
  }, [autoDownload, fileName]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadSheets(sheets(), fileName);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="card mb-5 flex flex-col gap-3 p-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-semibold text-ink">Bulk Certificates</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          {count} issued certificate{count === 1 ? "" : "s"} ready for one PDF
          export.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
        >
          <FaPrint />
          Print
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={download}
          className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
        >
          <FaDownload />
          {downloading ? "Preparing PDF..." : "Download PDF"}
        </button>
      </div>
    </div>
  );
}
