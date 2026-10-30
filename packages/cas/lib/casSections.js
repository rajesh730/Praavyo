/**
 * The configured section list is the source of truth.  A roster is only a
 * list of students in those sections; it must never decide which sections a
 * school has configured.
 */
export function sectionsForGrade(gradeSections = [], grade) {
  const wanted = String(grade || '').trim();
  const entry = (Array.isArray(gradeSections) ? gradeSections : [])
    .find((item) => String(item?.grade || '').trim() === wanted);
  return [...new Set((entry?.sections || [])
    .map((section) => String(section || '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

