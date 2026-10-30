import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getActor } from '@pravyo/cas/lib/casAccess';
import { loadReport } from '@pravyo/cas/lib/casReportService';
import ReportCard from '@pravyo/cas/components/report/ReportCard';
import PrintToolbar from './PrintToolbar';

export const dynamic = 'force-dynamic';

/**
 * A4 report card. One student per sheet.
 *
 * Everything is read from the stored snapshot, so a reprint months later
 * produces exactly the sheet the guardian was originally given.
 *
 * The layout itself lives in @pravyo/cas so that this page and the guardian's
 * portal render the identical component — see components/report/ReportCard.
 */
export default async function PrintReportPage({ params, searchParams }) {
  const { reportId } = await params;
  const query = await searchParams;
  const lang = query?.lang === 'ne' ? 'ne' : 'en';

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect('/login');

  let report;
  try {
    const actor = await getActor();
    report = await loadReport(actor, reportId);
  } catch {
    notFound();
  }

  return (
    <main className={lang === 'ne' ? 'cas-ne' : undefined}>
      <PrintToolbar reportId={reportId} lang={lang} status={report.status} />
      <ReportCard report={report} lang={lang} />
    </main>
  );
}
