// Canonical definition: packages/db/models/AcademicYear.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/AcademicYear` imports keep working.
export * from "@pravyo/db/models/AcademicYear";
export { default } from "@pravyo/db/models/AcademicYear";
