/**
 * Header metadata verified against the local `class 3 CAS book.pdf`.
 * Page references below are PDF page numbers, not the printed page numbers.
 * Only already-transcribed themes are included. These working hours are not
 * the subject's credit hours; English prints project/assessment hours apart.
 */
const BOOK_THEMES = {
  NEP: [
    { sequence: 1, titleNe: 'म र मेरो परिवार', titleEn: 'Me and My Family', workingHours: 15, sourcePage: 11 },
    { sequence: 2, titleNe: 'मेरो दैनिक जीवन', titleEn: 'My Daily Life', workingHours: 10, sourcePage: 12 },
  ],
  ENG: [
    { sequence: 1, titleEn: 'Me and My Family', workingHours: 15, assessmentProjectHours: 3, sourcePage: 26 },
    { sequence: 2, titleEn: 'My Daily Life', workingHours: 15, assessmentProjectHours: 2, sourcePage: 28 },
  ],
  MATH: [
    { sequence: 1, titleNe: 'मेरो दैनिक जीवन', titleEn: 'My Daily Life', workingHours: 8, sourcePage: 38 },
    { sequence: 2, titleNe: 'हाम्रो समुदाय', titleEn: 'Our Community', workingHours: 20, sourcePage: 50 },
    { sequence: 3, titleNe: 'मेरो सिर्जना', titleEn: 'My Creation', workingHours: 16, sourcePage: 50 },
  ],
  SURR: [
    { sequence: 1, titleNe: 'म र मेरो परिवार', titleEn: 'Me and My Family', workingHours: 40, sourcePage: 51 },
    { sequence: 2, titleNe: 'मेरो दैनिक जीवन', titleEn: 'My Daily Life', workingHours: 36, sourcePage: 53 },
  ],
};

/** Return source hours only when the sheet matches a known book theme. */
export function bookThemeMetadata({ grade, subjectCode, outcomes = [] }) {
  if (grade !== 'Grade 3' || outcomes.length === 0) return null;
  const candidates = BOOK_THEMES[subjectCode] || [];
  const theme = candidates.find((candidate) => outcomes.every((outcome) => {
    const matchingLabel = (
      candidate.titleNe && outcome.themeNe === candidate.titleNe
    ) || (
      candidate.titleEn && outcome.themeEn === candidate.titleEn
    );
    return matchingLabel && outcome.code?.startsWith(`${subjectCode}-T${candidate.sequence}-`);
  }));
  if (!theme) return null;

  return {
    sequence: theme.sequence,
    workingHours: theme.workingHours,
    assessmentProjectHours: theme.assessmentProjectHours ?? null,
    sourcePage: theme.sourcePage,
  };
}
