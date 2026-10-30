// Canonical definition: packages/db/models/PushSubscription.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/PushSubscription` imports keep working.
export * from "@pravyo/db/models/PushSubscription";
export { default } from "@pravyo/db/models/PushSubscription";
