export const DEFAULT_CAS_EXAM_TERM = 'FIRST';

export const CAS_EXAM_TERMS = [
  {
    value: 'FIRST',
    title: 'First Terminal Examination',
    resultLabel: 'First Terminal Result',
  },
  {
    value: 'SECOND',
    title: 'Second Terminal Examination',
    resultLabel: 'Second Terminal Result',
  },
  {
    value: 'THIRD',
    title: 'Third Terminal Examination',
    resultLabel: 'Third Terminal Result',
  },
  {
    value: 'FINAL',
    title: 'Final Examination',
    resultLabel: 'Final Result',
  },
];

export const CAS_EXAM_TERM_VALUES = CAS_EXAM_TERMS.map((term) => term.value);

export function examTermOf(value) {
  return CAS_EXAM_TERMS.find((term) => term.value === value) || CAS_EXAM_TERMS[0];
}

export function examTermTitle(value) {
  return examTermOf(value).title;
}

export function normalizeExamTitle(term, value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || examTermTitle(term);
}
