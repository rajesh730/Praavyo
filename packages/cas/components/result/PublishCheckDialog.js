'use client';

import { useState } from 'react';
import { Send as FaPaperPlane, TriangleAlert as FaWarning } from 'lucide-react';
import { Alert, Button, Spinner } from '../ui/Kit.js';

/** How the exam's missing-work rule (Manage Exams) completes a result. */
export function missingWorkText(t, rule) {
  if (rule?.missingWork === 'DEFAULT_LEVEL') {
    const level = Number(rule.missingWorkLevel) || 0;
    return level === 0
      ? t('Every missing mark is given 0 (no marks).', 'हरेक छुटेको अङ्कलाई ० (अङ्क छैन) दिइन्छ।')
      : t(`Every missing mark is given level ${level}.`, `हरेक छुटेको अङ्कलाई स्तर ${level} दिइन्छ।`);
  }
  return t(
    'A subject with no marks is printed as "Not attended exam" and left out of the GPA. A subject with some marks is calculated from the marks entered.',
    'अङ्क नभएको विषय "परीक्षामा अनुपस्थित" भनी छापिन्छ र GPA मा गनिँदैन। केही अङ्क भएको विषय प्रविष्ट अङ्कबाट गणना हुन्छ।',
  );
}

/** Short label for the rule, e.g. on an exam row in Manage Exams. */
export function missingWorkLabel(t, rule) {
  if (rule?.missingWork === 'DEFAULT_LEVEL') {
    const level = Number(rule.missingWorkLevel) || 0;
    return level === 0 ? t('Missing marks: 0', 'छुटेको अङ्क: ०') : t(`Missing marks: level ${level}`, `छुटेको अङ्क: स्तर ${level}`);
  }
  return t('Missing marks: Not attended', 'छुटेको अङ्क: अनुपस्थित');
}

/**
 * The single publishing step for a CAS result, shared by Student Result and
 * Manage Exams. A result always goes out for the WHOLE grade. Every student
 * must have marks in every subject; if any are missing they are listed here,
 * and the school either goes back to enter them or chooses "Publish anyway",
 * which completes the results with the exam's missing-work rule.
 *
 * `check` is the server's plan (publishGradeResults with checkOnly), fetched
 * fresh when the dialog opens. `onPublish(publishAnyway)` does the publishing.
 */
export default function PublishCheckDialog({ t, title, grade, check, loadError, extraBlocker, onCancel, onPublish }) {
  const [confirmed, setConfirmed] = useState(false);
  const missing = check?.missing || [];
  const incomplete = missing.length > 0;
  const blocker = extraBlocker || (check && (
    !check.total ? t(`No students are enrolled in ${grade}.`, `${grade} मा विद्यार्थी छैनन्।`)
      : !check.toPublish ? t('Every student in this grade is already published.', 'यस कक्षाका सबै विद्यार्थीको नतिजा प्रकाशित भइसकेको छ।')
        : !check.issueDate ? t('Set the issue date for this exam in Manage Exams (Edit) first.', 'पहिले परीक्षा व्यवस्थापनमा जारी मिति राख्नुहोस्।')
          : ''));

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-check-title">
      <div className="modal-panel max-w-2xl">
        <h2 id="publish-check-title" className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          {t(
            'The result is published for the whole grade at once — every section, every student. Each card goes to the student and every linked parent straight away, and the marks lock until the exam is unpublished in Manage Exams.',
            'नतिजा पूरै कक्षाका लागि एकैपटक प्रकाशित हुन्छ — सबै सेक्सन, सबै विद्यार्थी। हरेक नतिजा पत्र तुरुन्तै विद्यार्थी र अभिभावकलाई पठाइन्छ र परीक्षा व्यवस्थापनबाट अप्रकाशित नगरेसम्म अङ्क लक हुन्छन्।',
          )}
        </p>

        {loadError ? <div className="mt-4"><Alert tone="danger">{loadError}</Alert></div>
          : !check ? <div className="mt-4"><Spinner label={t('Checking every student’s marks…', 'सबै विद्यार्थीको अङ्क जाँच हुँदैछ…')} /></div>
            : (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-4">
                  {[
                    [t('Students in grade', 'कक्षाका विद्यार्थी'), check.total],
                    [t('To publish now', 'अहिले प्रकाशित हुने'), check.toPublish],
                    [t('Already published', 'प्रकाशित भइसकेका'), check.alreadyPublished],
                    [t('Issue date', 'जारी मिति'), check.issueDate || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-surface px-3 py-2">
                      <dt className="text-2xs font-semibold uppercase text-muted">{label}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>

                {blocker && <div className="mt-3"><Alert tone="info">{blocker}</Alert></div>}

                {!blocker && incomplete && (
                  <section className="mt-4 rounded-control border border-warning-line bg-warning-soft p-3">
                    <p className="flex items-start gap-2 font-semibold text-ink">
                      <FaWarning aria-hidden className="mt-0.5 shrink-0 text-warning" size={16} />
                      {t(
                        `Marks are missing: ${missing.length} subject${missing.length === 1 ? '' : 's'} for ${check.missingStudents} student${check.missingStudents === 1 ? '' : 's'}.`,
                        `अङ्क छुटेको छ: ${check.missingStudents} विद्यार्थीका ${missing.length} विषय।`,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {t('Every student needs marks in every subject before the result is published.', 'नतिजा प्रकाशित गर्नुअघि हरेक विद्यार्थीको हरेक विषयमा अङ्क चाहिन्छ।')}
                    </p>
                    <div className="mt-3 max-h-60 overflow-auto rounded-control border border-line bg-surface">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-surface-2 text-2xs uppercase text-muted">
                          <tr>
                            <th className="px-3 py-2">{t('Student', 'विद्यार्थी')}</th>
                            <th className="px-3 py-2">{t('Subject', 'विषय')}</th>
                            <th className="px-3 py-2">{t('Marks entered', 'प्रविष्ट अङ्क')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {missing.map((row) => (
                            <tr key={`${row.student}-${row.subjectEn}`}>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-ink">{row.name}</span>
                                <span className="block text-xs text-muted">
                                  {t('Roll', 'रोल')} {row.rollNumber || '—'}{row.section ? ` · ${t('Section', 'सेक्सन')} ${row.section}` : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-ink">{t(row.subjectEn, row.subjectNe) || row.subjectEn}</td>
                              <td className="px-3 py-2 text-muted">
                                {row.assessed
                                  ? t(`${row.assessed} of ${row.outcomes} outcomes`, `${row.outcomes} मध्ये ${row.assessed}`)
                                  : <span className="font-semibold text-danger">{t('No marks', 'अङ्क छैन')}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-sm text-ink">
                      <span className="font-semibold">{t('If you publish anyway: ', 'जे भए पनि प्रकाशित गरे: ')}</span>
                      {missingWorkText(t, check.missingWork)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{t('This rule is set per exam in Manage Exams (Edit).', 'यो नियम परीक्षा व्यवस्थापनमा (सम्पादन) तोकिन्छ।')}</p>
                  </section>
                )}

                {!blocker && (
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                    <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    {incomplete
                      ? t('I understand the missing marks will be completed by this rule.', 'छुटेका अङ्क यो नियमले पूरा हुन्छन् भन्ने बुझेँ।')
                      : t('I have checked these results and they are correct.', 'मैले यी नतिजा जाँचेँ र सही छन्।')}
                  </label>
                )}
              </>
            )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {incomplete && !blocker ? t('Go back and enter marks', 'फर्केर अङ्क प्रविष्ट गर्नुहोस्') : t('Cancel', 'रद्द गर्नुहोस्')}
          </Button>
          {check && !blocker && (
            <Button variant={incomplete ? 'danger' : 'primary'} disabled={!confirmed} onClick={() => onPublish(incomplete)}>
              <FaPaperPlane aria-hidden className="text-xs" />
              {incomplete
                ? t(`Publish anyway (${check.toPublish})`, `जे भए पनि प्रकाशित (${check.toPublish})`)
                : t(`Publish ${check.toPublish} result${check.toPublish === 1 ? '' : 's'}`, `${check.toPublish} नतिजा प्रकाशित गर्नुहोस्`)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
