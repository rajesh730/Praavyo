import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getActor } from '@pravyo/cas/lib/casAccess';
import { loadReport } from '@pravyo/cas/lib/casReportService';
import ReportCard from '@pravyo/cas/components/report/ReportCard';
import ResultsPrintToolbar from '../results/ResultsPrintToolbar';

export const dynamic = 'force-dynamic';

/**
 * Published report cards, opened from Student Result's history.
 *
 * Each card is read from its stored snapshot by id, never rebuilt from the
 * current exam setup, so a result stays viewable after its exam is deleted,
 * archived or renamed.
 */
export default async function PublishedResultsPage({ searchParams }) {
  const query = await searchParams;
  const lang = query?.lang === 'ne' ? 'ne' : 'en';
  // Optional layout override from Published Results; ReportCard ignores anything unknown.
  const format = typeof query?.format === 'string' ? query.format : undefined;
  const ids = [...new Set(String(query?.ids || '').split(',').filter((id) => /^[a-f\d]{24}$/i.test(id)))].slice(0, 500);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect('/login');

  const actor = await getActor();
  const reports = (await Promise.all(ids.map((id) => loadReport(actor, id).catch(() => null))))
    .filter((report) => report?.status === 'PUBLISHED')
    .sort(byRollNumber);

  const title = reports[0]?.snapshot?.examTitle || 'Published results';
  const fileName = reports.length === 1
    ? `${reports[0].snapshot?.student?.name || 'Student'} - ${title}`
    : `${reports[0]?.grade || 'Student'} ${title}`;

  return (
    <main className={lang === 'ne' ? 'cas-ne' : undefined}>
      <ResultsPrintToolbar
        lang={lang}
        count={reports.length}
        autoPrint={query?.print === '1' && reports.length > 0}
        autoDownload={query?.download === '1'}
        fileName={fileName}
      />
      {reports.length === 0 && (
        <p className="mx-auto max-w-[210mm] px-4 text-sm text-muted">
          These results are no longer published.
        </p>
      )}
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} lang={lang} format={format} />
      ))}
    </main>
  );
}

function byRollNumber(a, b) {
  const ra = Number(a.snapshot?.student?.rollNumber);
  const rb = Number(b.snapshot?.student?.rollNumber);
  if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
  return String(a.snapshot?.student?.name || '').localeCompare(String(b.snapshot?.student?.name || ''));
}
