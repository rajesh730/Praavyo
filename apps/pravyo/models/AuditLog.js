// Canonical definition: packages/db/models/AuditLog.js
// Re-exported so this app and CAS register the SAME Mongoose model on the
// shared connection, and so existing `@/models/AuditLog` imports keep working.
export * from "@pravyo/db/models/AuditLog";
export { default } from "@pravyo/db/models/AuditLog";
