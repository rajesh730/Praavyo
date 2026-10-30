import CleanAssessmentReport from './ClassicReport.js';
import MarksheetReport from './ModernReport.js';

/**
 * The one place a stored format becomes a layout.
 *
 * Both the school's A4 print route and the guardian's portal render through
 * here, so what a school previews is exactly what the parent opens. When these
 * lived as two separate implementations in two separate apps they drifted: the
 * school saw its own grade sheet while the guardian silently got a different
 * layout entirely.
 *
 * `format` is read from the report row, falling back to the snapshot's copy for
 * rows written before the column existed.
 */

export const REPORT_FORMATS = [
  { value: 'CLASSIC', label: 'Format 1 - Classic' },
  { value: 'MODERN', label: 'Format 2 - Modern' },
];

export const DEFAULT_REPORT_FORMAT = 'CLASSIC';

export function reportFormatOf(report) {
  const stored = report?.format || report?.snapshot?.format;
  return REPORT_FORMATS.some((f) => f.value === stored) ? stored : DEFAULT_REPORT_FORMAT;
}

export default function ReportCard({ report, lang = 'en' }) {
  return reportFormatOf(report) === 'CLASSIC'
    ? <MarksheetReport report={report} lang={lang} />
    : <CleanAssessmentReport report={report} lang={lang} />;
}
