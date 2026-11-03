/** Preserve leading zeroes in external IEMIS identifiers and reject control or
 * free-form punctuation before it reaches persistence. */
export function normalizeIemisNumber(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

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
