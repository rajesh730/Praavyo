import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getActor } from '@pravyo/cas/lib/casAccess';
import { loadGradeReportCards } from '@pravyo/cas/lib/casReportService';
import ReportCard from '@pravyo/cas/components/report/ReportCard';
import ResultsPrintToolbar from './ResultsPrintToolbar';

export const dynamic = 'force-dynamic';

/**
 * Many A4 report cards at once — Student Result's "Print all" and "Download".
 *
 * One card per page, drawn by the same ReportCard the parent sees: a published
 * student's stored snapshot, a live preview for anyone not yet published.
 * `?print=1` opens the print dialog on load; `?download=1` saves a PDF file.
 */
export default async function PrintResultsPage({ searchParams }) {
  const query = await searchParams;
  const lang = query?.lang === 'ne' ? 'ne' : 'en';
  const students = String(query?.students || '').split(',').filter(Boolean);
  const themeAssignmentIds = String(query?.themeAssignmentIds || '').split(',').filter(Boolean);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect('/login');

  let data;
  let error = '';
  try {
    const actor = await getActor();
    data = await loadGradeReportCards(actor, {
      academicYear: String(query?.academicYear || ''),
      grade: String(query?.grade || ''),
      section: query?.section ? String(query.section) : undefined,
      format: query?.format ? String(query.format) : undefined,
      examTerm: query?.examTerm ? String(query.examTerm) : undefined,
      examId: query?.examId ? String(query.examId) : undefined,
      resultMode: query?.resultMode ? String(query.resultMode) : undefined,
      includePrevious: query?.includePrevious === 'true',
      examTitle: query?.examTitle ? String(query.examTitle) : undefined,
      ...(students.length ? { students } : {}),
      ...(themeAssignmentIds.length ? { themeAssignmentIds } : {}),
    });
  } catch (err) {
    error = err?.message || 'These report cards are unavailable.';
  }

  const cards = (data?.students || []).filter((student) => student.report);
  const fileName = cards.length === 1
    ? `${cards[0].name} - ${data.grade} result`
    : `${data?.grade || 'Student'} results`;

  return (
    <main className={lang === 'ne' ? 'cas-ne' : undefined}>
      <ResultsPrintToolbar
        lang={lang}
        count={cards.length}
        autoPrint={query?.print === '1' && cards.length > 0}
        autoDownload={query?.download === '1'}
        fileName={fileName}
      />
      {error && <p role="alert" className="mx-auto max-w-[210mm] px-4 text-sm text-danger">{error}</p>}
      {!error && cards.length === 0 && (
        <p className="mx-auto max-w-[210mm] px-4 text-sm text-muted">
          No report cards to print: nothing has been assessed for these students yet.
        </p>
      )}
      {/* Student Result's chosen format applies to published cards as well;
          ReportCard ignores an unknown value. */}
      {cards.map((student) => (
        <ReportCard key={student.id} report={student.report} lang={lang} format={query?.format} />
      ))}
    </main>
  );
}
