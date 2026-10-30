"use client";

import { Printer as FaPrint } from "lucide-react";

/**
 * Trigger the browser's own print dialog (§5).
 *
 * Deliberately `window.print()` and CSS `@media print` rather than a PDF
 * service: the spec asks not to require a paid dependency, and browser print
 * already produces a clean, correctly-sized sheet that works offline on
 * whatever printer the school office actually has.
 *
 * `no-print` hides this control on the printed page.
 */
export default function PrintButton({ label = "Print" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-primary no-print flex items-center gap-2"
    >
      <FaPrint aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  );
}
