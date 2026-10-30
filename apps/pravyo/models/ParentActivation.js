// Canonical definition: packages/db/models/ParentActivation.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/ParentActivation` imports keep working.
export * from "@pravyo/db/models/ParentActivation";
export { default } from "@pravyo/db/models/ParentActivation";
