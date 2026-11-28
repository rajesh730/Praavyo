import {
  GRADE_CATALOG,
  PRE_PRIMARY_GRADES,
  canonicalPrePrimary,
  isPrimaryLevel,
  registrationGrades,
  resolveSchoolGrades,
  sortGrades,
} from "@pravyo/core/gradeLevels";

// The school's grades come from resolveSchoolGrades (its own list, or the
// signup range); see packages/core/gradeLevels.js.
export { GRADE_CATALOG, PRE_PRIMARY_GRADES, isPrimaryLevel, resolveSchoolGrades, sortGrades };

export function normalizeSchoolLevelConfig(config = {}) {
  const source = config.schoolLevel || config;
  const minGrade = Math.max(1, Number.parseInt(source.minGrade, 10) || 1);
  const maxGrade = Math.min(
    10,
    Math.max(minGrade, Number.parseInt(source.maxGrade, 10) || 10)
  );

  return {
    schoolLevel: {
      minGrade,
      maxGrade,
    },
  };
}

/**
 * The Grade min–max range chosen at signup. Only a fallback: a school's
 * current grades are `resolveSchoolGrades(user.schoolConfig, schoolConfig)`.
 */
export function buildGradeLabels(config = {}) {
  return registrationGrades(config);
}

export function normalizeGradeValue(grade) {
  const value = String(grade || "").trim();
  if (!value) return "";

  // Nursery / LKG / UKG keep their names, in one spelling.
  const prePrimary = canonicalPrePrimary(value);
  if (prePrimary) return prePrimary;

  const match = value.match(/\d+/);
  if (!match) return value;

  const gradeNumber = Number.parseInt(match[0], 10);
  if (!Number.isFinite(gradeNumber)) return value;

  return `Grade ${gradeNumber}`;
}

export function gradeListContains(eligibleGrades = [], grade) {
  if (!Array.isArray(eligibleGrades) || eligibleGrades.length === 0) {
    return true;
  }

  const normalizedGrade = normalizeGradeValue(grade);
  return eligibleGrades.some(
    (eligibleGrade) => normalizeGradeValue(eligibleGrade) === normalizedGrade
  );
}

// Stored spellings of each pre-primary level, for exact-match queries.
const PRE_PRIMARY_SPELLINGS = {
  Nursery: ["Nursery", "nursery", "NURSERY"],
  LKG: ["LKG", "lkg", "Lkg", "L.K.G", "L.K.G."],
  UKG: ["UKG", "ukg", "Ukg", "U.K.G", "U.K.G."],
};

export function getEquivalentGradeValues(grade) {
  const value = String(grade || "").trim();
  const prePrimary = canonicalPrePrimary(value);
  if (prePrimary) {
    return Array.from(new Set([value, ...PRE_PRIMARY_SPELLINGS[prePrimary]].filter(Boolean)));
  }
  const normalized = normalizeGradeValue(value);
  const match = normalized.match(/\d+/);
  const numeric = match ? String(Number.parseInt(match[0], 10)) : "";

  return Array.from(new Set([value, normalized, numeric].filter(Boolean)));
}
