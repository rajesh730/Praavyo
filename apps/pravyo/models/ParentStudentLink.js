// Canonical definition: packages/db/models/ParentStudentLink.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/ParentStudentLink` imports keep working.
export * from "@pravyo/db/models/ParentStudentLink";
export { default } from "@pravyo/db/models/ParentStudentLink";
