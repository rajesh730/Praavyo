import { GRADE_BANDS } from '@pravyo/core/casGrading';
import { bsAcademicYearLabel } from '@pravyo/core/nepaliDate';
import { pickBilingual } from '../../lib/casBilingual.js';

/**
 * Shared strings and the grading scale for both report formats.
 *
 * The scale is DERIVED from the same GRADE_BANDS the grades are computed with,
 * so the key printed on the sheet can never drift from the arithmetic that
 * produced the letters above it. It used to be a hand-typed copy in two files.
 */
export const GRADE_SCALE = [
  ...GRADE_BANDS.map((band, index) => ({
    range: `${band.min} - ${index === 0 ? 100 : GRADE_BANDS[index - 1].min}`,
    grade: band.grade,
    // The school's sheet prints "Very Good", not the "Very good" the band
    // carries for prose remarks.
    performance: titleCase(band.remarkEn),
    point: band.gradePoint.toFixed(1),
  })),
  {
    // Written "00 - 35" on the school's sheet, so the range column stays a
    // fixed width down the whole key.
    range: `00 - ${GRADE_BANDS[GRADE_BANDS.length - 1].min}`,
    grade: 'NG',
    performance: 'Not Graded',
    point: '-',
  },
];

function titleCase(value) {
  return String(value || '').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const EN = {
  reportTitle: 'Continuous Assessment Report',
  academicYear: 'Academic Year',
  schoolCode: 'School code',
  student: 'Student',
  grade: 'Grade',
  roll: 'Roll No.',
  registration: 'Reg. No.',
  subject: 'Subject',
  assessed: 'Outcomes assessed',
  achievement: 'Achievement',
  coverage: 'Coverage',
  creditHour: 'Credit hour',
  gradePoint: 'Grade point',
  remarks: 'Remarks',
  gpa: 'Grade Point Average (GPA)',
  overall: 'Overall',
  notAssessed: 'Not assessed',
  absent: 'Absent',
  classTeacher: 'Class Teacher',
  principal: 'Principal',
  date: 'Date',
  issueDate: 'Issue Date',
  levelNote:
    'Achievement levels run from 1 to 4 and are not percentage grades. Achievement is calculated from accepted levels on outcomes that were assessed; outcomes not yet assessed are excluded rather than counted as zero, and are reported separately as coverage. An accepted level is the highest a student reached, so a reassessment can only raise it.',
  creditNote: 'One credit hour equals 32 working hours.',
  published: 'Published report. Figures are fixed as at the publication date.',
  draftWarning: 'DRAFT — not published. This is not a final report.',
};

export const NE = {
  reportTitle: 'निरन्तर मूल्याङ्कन प्रतिवेदन',
  academicYear: 'शैक्षिक सत्र',
  schoolCode: 'विद्यालय सङ्केत',
  student: 'विद्यार्थी',
  grade: 'कक्षा',
  roll: 'रोल नं.',
  registration: 'दर्ता नं.',
  subject: 'विषय',
  assessed: 'मूल्याङ्कन भएका',
  achievement: 'उपलब्धि',
  coverage: 'समेटिएको',
  creditHour: 'क्रेडिट घण्टा',
  gradePoint: 'स्तरीकृत अङ्क',
  remarks: 'कैफियत',
  gpa: 'ग्रेड प्वाइन्ट औसत (GPA)',
  overall: 'कुल',
  notAssessed: 'मूल्याङ्कन भएको छैन',
  absent: 'अनुपस्थित',
  classTeacher: 'कक्षा शिक्षक',
  principal: 'प्रधानाध्यापक',
  date: 'मिति',
  issueDate: 'जारी मिति',
  levelNote:
    'उपलब्धि स्तर १ देखि ४ सम्म हुन्छ; यो प्रतिशत श्रेणी होइन। मूल्याङ्कन भएका सिकाइ उपलब्धिका स्वीकृत स्तरका आधारमा उपलब्धि गणना गरिएको छ। मूल्याङ्कन नभएका उपलब्धिलाई शून्य नगणी अलग्गै देखाइएको छ। स्वीकृत स्तर सधैँ विद्यार्थीले प्राप्त गरेको सर्वोच्च स्तर हुन्छ।',
  creditNote: 'एक क्रेडिट घण्टा बराबर ३२ कार्यघण्टा हुन्छ।',
  published: 'प्रकाशित प्रतिवेदन। प्रकाशन मितिको तथ्याङ्क स्थिर छ।',
  draftWarning: 'मस्यौदा — प्रकाशित भएको छैन। यो अन्तिम प्रतिवेदन होइन।',
};

export function stringsFor(lang) {
  return lang === 'ne' ? NE : EN;
}

/** Prefer the Nepali string only when one actually exists for that record. */
export function picker(lang) {
  return (en, ne) => pickBilingual(en, ne, lang);
}

/**
 * The issue date printed on a card: the exam's own, set in Manage Exams, in
 * numeric B.S. (2083/04/10). Nothing else stands in for it.
 */
export function issueDateOf(report) {
  return report?.snapshot?.issueDate || '';
}

/** The running academic year on a card, in B.S. ("2083"). */
export function academicYearOf(snapshot) {
  const year = snapshot?.academicYear || {};
  return bsAcademicYearLabel(year.yearStart) || year.label || '';
}

/** The examination title the school chose for this stored result. */
export function examTitleOf(snapshot) {
  return snapshot?.examTitle || academicYearOf(snapshot);
}

/** The date a card carries: the school's result date, else when it was published. */
export function valueOrDash(value) {
  return value == null || value === '' ? '-' : value;
}

