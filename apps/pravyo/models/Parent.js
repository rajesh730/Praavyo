// Canonical definition: packages/db/models/Parent.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/Parent` imports keep working.
export * from "@pravyo/db/models/Parent";
export { default } from "@pravyo/db/models/Parent";
