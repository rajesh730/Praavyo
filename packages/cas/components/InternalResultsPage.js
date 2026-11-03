'use client';

import { useRef, useState } from 'react';
import { Download, Printer, Send, Undo2 } from 'lucide-react';
import { useCas } from './CasLayout.js';
import { useCasMutation, useCasQuery } from '../lib/client/useCas.js';
import { downloadSheets } from '../lib/client/pdfDownload.js';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import InternalExamReport from './report/InternalExamReport.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';

/**
 * Internal exam results: every student's Modern report card, then publish.
 *
 * Before publishing the cards are a live preview of the marks; publishing
 * freezes them and they appear to parents and students next to the CAS
 * card. Unpublishing takes them down and unlocks mark entry.
 */
export default function InternalResultsPage() {
  const { actor, lang, t } = useCas();
  const filters = useInternalExamFilters();
  const { exam, section, examsQuery } = filters;
  const isSchool = actor?.role === 'SCHOOL_ADMIN';
  const cardsQuery = useCasQuery(
    isSchool && exam ? `/api/cas/internal-exams/cards?${new URLSearchParams({ exam: exam.id, ...(section ? { section } : {}) })}` : null,
  );
  const cards = cardsQuery.data || [];
  const { run, pending, error, success } = useCasMutation();
  const [downloading, setDownloading] = useState(false);
  const sheetsRef = useRef(null);

  const incomplete = cards.filter((card) => (card.snapshot?.subjects || []).some((line) => !line.entered)).length;
  const passed = cards.filter((card) => card.snapshot?.passed).length;

  async function setPublished(publish) {
    const question = publish
      ? t(`Publish ${exam.name} results for ${exam.grade}? Parents and students will see the report cards straight away, and marks lock until you unpublish.`, `${exam.grade} को ${exam.name} नतिजा प्रकाशित गर्ने?`)
      : t(`Unpublish ${exam.name} results for ${exam.grade}? Parents and students will no longer see them, and marks can be changed again.`, `${exam.grade} को ${exam.name} नतिजा अप्रकाशित गर्ने?`);
    if (!window.confirm(question)) return;
    const result = await run('/api/cas/internal-exams/publish', { method: 'POST', body: { exam: exam.id, publish } }, {
      successMessage: publish ? t('Results published', 'नतिजा प्रकाशित भयो') : t('Results unpublished', 'नतिजा अप्रकाशित भयो'),
    });
    if (result.ok) {
      examsQuery.reload();
      cardsQuery.reload();
    }
  }

  async function download() {
    setDownloading(true);
    try {
      await downloadSheets(sheetsRef.current?.querySelectorAll('.cas-a4') || [], `${exam.grade}${section ? ` ${section}` : ''} - ${exam.name}`);
    } catch (reason) {
      window.alert(reason.message);
    } finally {
      setDownloading(false);
    }
  }

  if (!isSchool) {
    return (
      <Card>
        <EmptyState title={t('Results are published by the school', 'नतिजा विद्यालयले प्रकाशित गर्छ')} description={t('Enter your marks on Mark Entry; the school checks and publishes them.', 'Mark Entry मा अङ्क प्रविष्ट गर्नुहोस्।')} />
      </Card>
    );
  }

  return (
    <>
      <div className="cas-print-hide">
        <PageHeader
          eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
          title={t('Results', 'नतिजा')}
          description={t('Check every report card, then publish. Published cards appear to parents and students beside the CAS result.', 'हरेक नतिजा पत्र जाँचेर प्रकाशित गर्नुहोस्।')}
          actions={exam && cards.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => window.print()}><Printer size={16} aria-hidden /> {t('Print', 'प्रिन्ट')}</Button>
              <Button variant="secondary" disabled={downloading} onClick={download}><Download size={16} aria-hidden /> {downloading ? t('Preparing PDF…', 'PDF तयार हुँदैछ…') : t('Download PDF', 'PDF डाउनलोड')}</Button>
              {exam.published
                ? <Button variant="danger" disabled={pending} onClick={() => setPublished(false)}><Undo2 size={16} aria-hidden /> {t('Unpublish', 'अप्रकाशित')}</Button>
                : <Button disabled={pending || incomplete > 0} onClick={() => setPublished(true)}><Send size={16} aria-hidden /> {t('Publish results', 'नतिजा प्रकाशित')}</Button>}
            </>
          )}
        />
        <InternalExamFilterBar filters={filters} t={t} />
        <Alert tone="danger">{error || cardsQuery.error}</Alert>
        <Alert tone="success">{success}</Alert>
        {exam && cards.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {exam.published ? <Badge tone="success">{t('Published', 'प्रकाशित')}</Badge> : <Badge>{t('Preview — not published', 'पूर्वावलोकन — अप्रकाशित')}</Badge>}
            <span className="text-muted">{cards.length} {t('students', 'विद्यार्थी')} · {passed} {t('passed', 'उत्तीर्ण')}</span>
            {!exam.published && incomplete > 0 && (
              <Badge tone="warning">{t(`${incomplete} student${incomplete === 1 ? ' has' : 's have'} missing marks — publishing is blocked until every mark is entered`, `${incomplete} विद्यार्थीको अङ्क बाँकी`)}</Badge>
            )}
            {section && !exam.published && <span className="text-muted">{t('Publishing covers every section of the grade.', 'प्रकाशनले कक्षाका सबै सेक्सन समेट्छ।')}</span>}
          </div>
        )}
      </div>

      {!exam ? (
        examsQuery.loading ? <Card><Spinner /></Card>
          : <Card><EmptyState title={t('No internal exam for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')} /></Card>
      ) : cardsQuery.loading ? <Card><Spinner label={t('Building report cards…', 'नतिजा पत्र बन्दैछ…')} /></Card>
        : !cards.length ? <Card><EmptyState title={t('No students to show', 'विद्यार्थी छैनन्')} /></Card>
          : (
            <div ref={sheetsRef} className={`space-y-6 ${lang === 'ne' ? 'cas-ne' : ''}`}>
              {cards.map((card) => (
                <div key={card._id} className="mx-auto max-w-[210mm]">
                  <InternalExamReport report={card} lang={lang} />
                </div>
              ))}
            </div>
          )}
    </>
  );
}
