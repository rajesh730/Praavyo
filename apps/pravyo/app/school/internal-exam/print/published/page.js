import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getActor } from '@pravyo/cas/lib/casAccess';
import { publishedInternalCards } from '@pravyo/cas/lib/internalPublishedResults';
import InternalExamReport from '@pravyo/cas/components/report/InternalExamReport';
import A4Viewport from '@pravyo/cas/components/report/A4Viewport';
import ResultsPrintToolbar from '../../../cas/print/results/ResultsPrintToolbar';

export const dynamic = 'force-dynamic';

/**
 * Published internal-exam report cards, opened from Internal Exam →
 * Published Results (Print, Download PDF). Read by id from the frozen rows
 * with live school and student details, never rebuilt from the marks, so a
 * card unpublished since simply drops off.
 */
export default async function InternalPublishedPrintPage({ searchParams }) {
  const query = await searchParams;
  const lang = query?.lang === 'ne' ? 'ne' : 'en';
  const ids = [...new Set(String(query?.ids || '').split(',').filter((id) => /^[a-f\d]{24}$/i.test(id)))].slice(0, 500);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect('/login');

  const actor = await getActor();
  const cards = ids.length ? await publishedInternalCards(actor, { ids }).catch(() => []) : [];

  const title = cards[0]?.snapshot?.examTitle || 'Published results';
  const fileName = cards.length === 1
    ? `${cards[0].branding?.studentName || cards[0].snapshot?.student?.name || 'Student'} - ${title}`
    : `${cards[0]?.grade || 'Student'} ${title}`;

  return (
    <main className={lang === 'ne' ? 'cas-ne' : undefined}>
      <ResultsPrintToolbar
        lang={lang}
        count={cards.length}
        autoPrint={query?.print === '1' && cards.length > 0}
        autoDownload={query?.download === '1'}
        fileName={fileName}
        backHref="/school/internal-exam/published-results"
        backLabel="Published Results"
      />
      {cards.length === 0 && (
        <p className="mx-auto max-w-[210mm] px-4 text-sm text-muted">
          These results are no longer published.
        </p>
      )}
      {cards.map((card) => (
        <A4Viewport key={card.id}><InternalExamReport report={card} lang={lang} /></A4Viewport>
      ))}
    </main>
  );
}
