// Canonical definition: packages/db/models/Student.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/Student` imports keep working.
export * from "@pravyo/db/models/Student";
export { default } from "@pravyo/db/models/Student";
