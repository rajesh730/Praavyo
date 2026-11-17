// Canonical definition: packages/db/iemisFormat.js (format rules) and
// packages/db/iemis.js (lookups). Re-exported so `@/lib/iemis` keeps working
// and the app, CAS and sign-in share one set of IEMIS rules.
export { iemisNumberError, isValidIemisNumber, normalizeIemisNumber } from "@pravyo/db/iemisFormat";
