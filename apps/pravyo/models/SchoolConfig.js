// Canonical definition: packages/db/models/SchoolConfig.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/SchoolConfig` imports keep working.
export * from "@pravyo/db/models/SchoolConfig";
export { default } from "@pravyo/db/models/SchoolConfig";
