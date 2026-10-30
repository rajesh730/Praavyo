// Canonical definition: packages/db/models/Teacher.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/Teacher` imports keep working.
export * from "@pravyo/db/models/Teacher";
export { default } from "@pravyo/db/models/Teacher";
