/** Preserve leading zeroes in external IEMIS identifiers and reject control or
 * free-form punctuation before it reaches persistence. */
export function normalizeIemisNumber(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function isValidIemisNumber(value) {
  return value === "" || (/^[A-Z0-9-]+$/.test(value) && value.length <= 50);
}
