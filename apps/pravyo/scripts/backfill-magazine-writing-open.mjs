import dotenv from "dotenv";
import mongoose from "mongoose";
import MagazineIssue from "../models/MagazineIssue.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apply = process.argv.includes("--apply");
const legacyDraftFilter = {
  status: "DRAFT",
  acceptingSubmissions: { $exists: false },
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const affected = await MagazineIssue.countDocuments(legacyDraftFilter);
  console.log(`Legacy draft magazines without writing state: ${affected}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to mark these previously-open drafts as open for writing.");
    return;
  }
  const result = await MagazineIssue.updateMany(legacyDraftFilter, {
    $set: { acceptingSubmissions: true },
  });
  console.log(`Updated ${result.modifiedCount} magazine issue(s).`);
}

main()
  .catch((error) => {
    console.error("Magazine writing-state backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
