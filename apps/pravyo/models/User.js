// Canonical definition: packages/db/models/User.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/User` imports keep working.
export * from "@pravyo/db/models/User";
export { default } from "@pravyo/db/models/User";
