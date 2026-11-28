/**
 * School grade levels: the catalogue a school picks its grades from, their
 * order, and which ones count as primary.
 *
 * A school's grades are its own list (Settings → Academic Setup → Grades,
 * `SchoolConfig.grades` once `gradesCustomized`), otherwise the Grade
 * min–max range chosen at signup. Every grade dropdown reads that list, so
 * nothing here is a per-screen hard-coded list.
 *
 * Primary level = Nursery, LKG, UKG and Grades 1–5 (owner, 2026-11-28): they
 * all use CAS and the Grades 1–5 formats. There is no default CAS content for
 * Nursery/LKG/UKG yet; schools write their own curriculum.
 *
 * Pure: no database, no React.
 */

export const PRE_PRIMARY_GRADES = ["Nursery", "LKG", "UKG"];
export const MAX_CATALOG_GRADE = 12;
export const GRADE_CATALOG = [
  ...PRE_PRIMARY_GRADES,
  ...Array.from({ length: MAX_CATALOG_GRADE }, (_, index) => `Grade ${index + 1}`),
];
/** The highest grade that uses CAS and the primary formats. */
export const PRIMARY_MAX_GRADE = 5;

// Spellings seen in school data, keyed by their canonical name.
const PRE_PRIMARY_PATTERNS = [
  ["Nursery", /^(nursery|nur\.?|pre[\s-]?primary|pre[\s-]?school)$/],
  ["LKG", /^(l\.?\s?k\.?\s?g\.?|lower\s*k\.?g\.?|lower\s*kindergarten|junior\s*k\.?g\.?)$/],
  ["UKG", /^(u\.?\s?k\.?\s?g\.?|upper\s*k\.?g\.?|upper\s*kindergarten|senior\s*k\.?g\.?)$/],
];

/** "nursery" → "Nursery", "L.K.G" → "LKG", "upper kg" → "UKG"; otherwise null. */
export function canonicalPrePrimary(grade) {
  const value = String(grade ?? "").trim().toLowerCase();
  if (!value) return null;
  const found = PRE_PRIMARY_PATTERNS.find(([, pattern]) => pattern.test(value));
  return found ? found[0] : null;
}

export function isPrePrimary(grade) {
  return canonicalPrePrimary(grade) !== null;
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** The number in a grade name ("Grade 3", "कक्षा ५", "9"); null when none. */
export function gradeDigits(grade) {
  const latin = String(grade ?? "").replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS.indexOf(digit));
  const match = /\d+/.exec(latin);
  return match ? Number(match[0]) : null;
}

/** Sort position: Nursery -2, LKG -1, UKG 0, Grade N → N; null when unknown. */
export function gradeRank(grade) {
  const prePrimary = canonicalPrePrimary(grade);
  if (prePrimary) return PRE_PRIMARY_GRADES.indexOf(prePrimary) - 2;
  return gradeDigits(grade);
}

/** The catalogue name for a grade ("9", "class 9" → "Grade 9", "lkg" → "LKG"), or null. */
export function catalogGrade(grade) {
  const prePrimary = canonicalPrePrimary(grade);
  if (prePrimary) return prePrimary;
  const number = gradeDigits(grade);
  return number !== null && number >= 1 && number <= MAX_CATALOG_GRADE ? `Grade ${number}` : null;
}

/** Nursery, LKG, UKG and Grades 1–5: CAS and the primary report formats. */
export function isPrimaryLevel(grade) {
  const rank = gradeRank(grade);
  return rank !== null && rank <= PRIMARY_MAX_GRADE;
}

/** De-duplicated (by catalogue name) and in school order; unknown names last. */
export function sortGrades(grades = []) {
  const seen = new Set();
  const unique = [];
  for (const grade of Array.isArray(grades) ? grades : []) {
    const value = String(grade ?? "").trim();
    if (!value) continue;
    const key = catalogGrade(value) || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(catalogGrade(value) || value);
  }
  return unique.sort((a, b) => {
    const left = gradeRank(a);
    const right = gradeRank(b);
    if (left === null && right === null) return a.localeCompare(b);
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
}

/** The signup range ("Grade min".."Grade max", 1–10) a school chose at registration. */
export function registrationGrades(schoolConfig = {}) {
  const source = schoolConfig?.schoolLevel || schoolConfig || {};
  const minGrade = Math.max(1, Number.parseInt(source.minGrade, 10) || 1);
  const maxGrade = Math.min(10, Math.max(minGrade, Number.parseInt(source.maxGrade, 10) || 10));
  return Array.from({ length: maxGrade - minGrade + 1 }, (_, index) => `Grade ${minGrade + index}`);
}

/**
 * The school's current grades: its own list once it has edited it
 * (`config.gradesCustomized`), otherwise the signup range from the school
 * account (`registration` = User.schoolConfig).
 */
export function resolveSchoolGrades(registration, config) {
  if (config?.gradesCustomized && Array.isArray(config.grades) && config.grades.length) {
    return sortGrades(config.grades);
  }
  return registrationGrades(registration);
}

/** The grade after `grade` in the catalogue (UKG → Grade 1), or null after Grade 12. */
export function nextCatalogGrade(grade) {
  const name = catalogGrade(grade);
  const index = name ? GRADE_CATALOG.indexOf(name) : -1;
  return index >= 0 && index < GRADE_CATALOG.length - 1 ? GRADE_CATALOG[index + 1] : null;
}
