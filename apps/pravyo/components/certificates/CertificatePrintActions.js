"use client";

import { useEffect, useRef, useState } from "react";
import { Download as FaDownload, Printer as FaPrint } from "lucide-react";
import {
  answerPdfRequest,
  downloadSheets,
} from "@pravyo/cas/lib/client/pdfDownload";

// The unscaled sheet, so the PDF is full A4 whatever the screen width.
const sheets = () => document.querySelectorAll(".certificate-viewport-inner");

export default function CertificatePrintActions({
  autoDownload = false,
  fileName = "Certificate",
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
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="btn btn-secondary inline-flex items-center gap-2 transition-colors"
      >
        <FaPrint />
        Print
      </button>
      <button
        type="button"
        disabled={downloading}
        onClick={download}
        className="btn btn-primary inline-flex items-center gap-2 transition-colors"
      >
        <FaDownload />
        {downloading ? "Preparing PDF..." : "Download PDF"}
      </button>
    </>
  );
}
