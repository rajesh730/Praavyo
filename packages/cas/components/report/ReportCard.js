import ClassicReport from './ClassicReport.js';

/**
 * The one place a CAS report becomes a layout.
 *
 * Both the school's A4 print route and the guardian's portal render through
 * here, so what a school previews is exactly what the parent opens. When these
 * lived as two separate implementations in two separate apps they drifted: the
 * school saw its own grade sheet while the guardian silently got a different
 * layout entirely.
 *
 * Since 2026-11-03 every CAS result is drawn as the Classic continuous-
 * assessment sheet (ClassicReport.js), whatever `format` a card was stored
 * with. The Modern card belongs to internal exams (InternalExamReport.js).
 * The marksheet layout in ModernReport.js is no longer used by CAS.
 */

export const REPORT_FORMATS = [
  { value: 'CLASSIC', label: 'Classic' },
];

export const DEFAULT_REPORT_FORMAT = 'CLASSIC';

export function reportFormatOf() {
  return DEFAULT_REPORT_FORMAT;
}

// `format` is accepted and ignored so existing callers keep working.
export default function ReportCard({ report, lang = 'en', format }) {
  return <ClassicReport report={report} lang={lang} />;
}
