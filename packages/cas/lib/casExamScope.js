export function examsThroughSelected(exams, selectedExamId) {
  const index = exams.findIndex((exam) => String(exam._id || exam.id) === String(selectedExamId));
  return index < 0 ? [] : exams.slice(0, index + 1).map((exam) => exam._id || exam.id);
}

export function assessmentExamFilter({ resultMode, examId, includePrevious, examIds = [] }) {
  if (resultMode === 'MERGED') return {};
  if (includePrevious) return { exam: { $in: examIds } };
  return examId ? { exam: examId } : { exam: { $exists: false } };
}

export function resultScopeKey({ resultMode, examId, examTerm, includePrevious, themeAssignmentIds }) {
  if (resultMode === 'MERGED') return 'MERGED';
  if (themeAssignmentIds?.length && examId) return `THEMES:${examId}`;
  if (includePrevious) return `CUMULATIVE:${examId}`;
  return examId || examTerm || 'FINAL';
}
