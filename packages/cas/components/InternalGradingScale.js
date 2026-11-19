'use client';

import { INTERNAL_GRADE_SCALE, gradeScaleForMarks } from '@pravyo/core/internalExamResult';
import { Card } from './ui/Kit.js';

const SCORE_SCALE_MARKS = 50;

/**
 * Internal Exam grading, read-only. Two views of the same bands: the
 * percentage scale (current) and the scale written as scores out of 50
 * (new). A score is graded by its percentage, so they always agree.
 */
export default function InternalGradingScale({ t }) {
  const scoreScale = gradeScaleForMarks(SCORE_SCALE_MARKS);
  const head = 'py-2 pr-4 text-left text-xs font-semibold text-muted';
  const cell = 'py-2 pr-4 tabular-nums';

  return (
    <>
      <Card
        title={t(`Grading scale for ${SCORE_SCALE_MARKS} marks`, `${SCORE_SCALE_MARKS} पूर्णाङ्कको ग्रेडिङ स्केल`)}
        description={t(
          `New: the score a student needs out of ${SCORE_SCALE_MARKS}, e.g. a 50-mark theory paper or 50 internal marks.`,
          `नयाँ: ${SCORE_SCALE_MARKS} मध्ये विद्यार्थीले पाउनुपर्ने अङ्क, जस्तै ५० पूर्णाङ्कको सैद्धान्तिक वा आन्तरिक।`,
        )}
      >
        <div className="table-wrap">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr>
                <th className={head}>{t(`Score (out of ${SCORE_SCALE_MARKS})`, `अङ्क (${SCORE_SCALE_MARKS} मध्ये)`)}</th>
                <th className={head}>{t('Percentage equivalent', 'प्रतिशत')}</th>
                <th className={head}>{t('Letter grade', 'ग्रेड')}</th>
                <th className={head}>{t('Grade point (GPA)', 'ग्रेड पोइन्ट')}</th>
                <th className={head}>{t('Description', 'विवरण')}</th>
              </tr>
            </thead>
            <tbody>
              {scoreScale.map((row) => (
                <tr key={row.grade} className="border-t border-line">
                  <td className={`${cell} font-semibold text-ink`}>{row.score}</td>
                  <td className={cell}>{row.percent}</td>
                  <td className="py-2 pr-4 font-semibold text-ink">{row.grade === 'NG' ? t('NG (Not Graded)', 'NG (अवर्गीकृत)') : row.grade}</td>
                  <td className={cell}>{row.point}</td>
                  <td className="py-2 text-muted">{t(row.description, row.descriptionNe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title={t('Percentage grading scale', 'प्रतिशत ग्रेडिङ स्केल')}
        description={t(
          'Current scale, used for any full marks. Theory, internal and the final mark are each graded on their percentage. NG carries grade point 0.0 and counts in the GPA.',
          'हालको स्केल, जुनसुकै पूर्णाङ्कमा लागू। सैद्धान्तिक, आन्तरिक र अन्तिम अङ्क प्रत्येकको प्रतिशतअनुसार ग्रेड हुन्छ। NG को ग्रेड पोइन्ट ०.० हुन्छ र GPA मा गनिन्छ।',
        )}
      >
        <div className="table-wrap">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr>
                <th className={head}>{t('Percentage', 'प्रतिशत')}</th>
                <th className={head}>{t('Letter grade', 'ग्रेड')}</th>
                <th className={head}>{t('Grade point (GPA)', 'ग्रेड पोइन्ट')}</th>
                <th className={head}>{t('Description', 'विवरण')}</th>
              </tr>
            </thead>
            <tbody>
              {INTERNAL_GRADE_SCALE.map((row) => (
                <tr key={row.grade} className="border-t border-line">
                  <td className={cell}>{row.range}</td>
                  <td className="py-2 pr-4 font-semibold text-ink">{row.grade}</td>
                  <td className={cell}>{row.point}</td>
                  <td className="py-2 text-muted">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
