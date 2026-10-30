// The connection itself is shared: packages/db/connect.js.
// This wrapper keeps the one behaviour that belongs to this app alone —
// seeding the default super admin once per server process. CAS must never
// create an account, so that step cannot live in the shared package.
import connect from "@pravyo/db";

export { mongoose } from "@pravyo/db";

export default async function connectDB() {
  const conn = await connect();

  if (!global.__superAdminSeed) {
    global.__superAdminSeed = (async () => {
      try {
        const { default: ensureSuperAdmin } = await import("@/lib/seedSuperAdmin");
        await ensureSuperAdmin();
      } catch (e) {
        console.error("[seed] ensureSuperAdmin error:", e.message);
      }
    })();
  }
  await global.__superAdminSeed;

  return conn;
}
