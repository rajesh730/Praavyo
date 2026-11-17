/**
 * IEMIS number format rules. Pure functions with no database access, so they
 * are safe in browser code. The lookups that use these live in ./iemis.js;
 * the identity rules are explained in apps/pravyo/docs/IEMIS_IDENTITY.md.
 */

/** Clean an IEMIS number for storage or lookup: no spaces, upper case, and
 * leading zeroes preserved (it is an identifier, never a number). */
export function normalizeIemisNumber(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

/** Letters, digits and hyphens, up to 50 characters. "" counts as valid here;
 * use `iemisNumberError` where the number is compulsory. */
export function isValidIemisNumber(value) {
  return value === "" || (/^[A-Z0-9-]+$/.test(value) && value.length <= 50);
}

/**
 * IEMIS is compulsory: every school registers with the IEMIS number the
 * government issued it, and every student has their own. Returns the error
 * message for a missing or malformed number, or "" when it is acceptable.
 */
export function iemisNumberError(value, label = "IEMIS number") {
  if (!value) return `${label} is required`;
  if (!isValidIemisNumber(value)) return `${label} may contain letters, numbers, and hyphens only (up to 50 characters)`;
  return "";
}
