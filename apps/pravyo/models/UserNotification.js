// Canonical definition: packages/db/models/UserNotification.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/UserNotification` imports keep working.
export * from "@pravyo/db/models/UserNotification";
export { default } from "@pravyo/db/models/UserNotification";
