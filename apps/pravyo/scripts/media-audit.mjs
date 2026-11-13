// READ-ONLY media health check: `npm run media:audit`.
// Compares MediaAsset records and the logo / cover / report-card links with
// what is actually in R2. It never writes to MongoDB or R2.
//
// Flags:
//   WIPED?  a live link points at an asset marked DELETED while its file is
//           still in R2 (a wrongful wipe, like the 2026-11 incident)
//   BROKEN  a school's live link points at an asset that is not READY, or
//           whose file is missing from R2
import dotenv from "dotenv";
import mongoose from "mongoose";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config({ path: ".env.local" });
dotenv.config();

const env = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the media audit.`);
  return value;
};

const s3 = new S3Client({
  region: "auto",
  endpoint: env("R2_ENDPOINT"),
  credentials: {
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  },
});
const BUCKETS = { PUBLIC: env("R2_PUBLIC_BUCKET"), PRIVATE: env("R2_PRIVATE_BUCKET") };

async function inR2(asset) {
  try {
    await s3.send(
      new HeadObjectCommand({ Bucket: BUCKETS[asset.visibility] || BUCKETS.PRIVATE, Key: asset.storageKey })
    );
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

const idFromUrl = (url) => String(url || "").match(/^\/api\/media\/r2\/([a-f0-9]{24})$/i)?.[1] || null;

async function main() {
  await mongoose.connect(env("MONGODB_URI"), { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const assets = await db.collection("mediaassets").find({}).toArray();
  const byId = new Map(assets.map((a) => [String(a._id), a]));
  const exists = new Map();
  for (const asset of assets) exists.set(String(asset._id), await inR2(asset));

  const schoolNames = new Map(
    (
      await db
        .collection("users")
        .find({ role: "SCHOOL_ADMIN" }, { projection: { schoolName: 1, name: 1 } })
        .toArray()
    ).map((u) => [String(u._id), u.schoolName || u.name || ""])
  );
  const school = (id) => `${schoolNames.get(String(id)) || "?"} (${id})`;

  const problems = [];

  const links = [];
  for (const p of await db.collection("schoolshowcaseprofiles").find({}).toArray()) {
    links.push([p.school, "logo (logoUrl)", p.logoUrl || p.coverImageUrl]);
    links.push([p.school, "cover (bannerImageUrl)", p.bannerImageUrl]);
  }
  for (const c of await db.collection("schoolconfigs").find({}).toArray()) {
    links.push([c.school, "report card image", c.reportCardImageUrl]);
  }
  const linkedAssetIds = new Set(links.map(([, , url]) => idFromUrl(url)).filter(Boolean));
  for (const asset of assets) {
    if (
      asset.status === "DELETED" &&
      exists.get(String(asset._id)) &&
      linkedAssetIds.has(String(asset._id))
    ) {
      problems.push(
        `WIPED?  ${asset.purpose} ${asset._id} of ${school(asset.school)} marked DELETED at ` +
          `${asset.deletedAt?.toISOString?.() || "?"} but the live link still points to it`
      );
    }
  }
  for (const [schoolId, label, url] of links) {
    const id = idFromUrl(url);
    if (!id) continue;
    const asset = byId.get(id);
    if (!asset) problems.push(`BROKEN  ${label} of ${school(schoolId)} -> ${id}: no such asset`);
    else if (asset.status !== "READY") problems.push(`BROKEN  ${label} of ${school(schoolId)} -> ${id}: asset is ${asset.status}`);
    else if (!exists.get(id)) problems.push(`BROKEN  ${label} of ${school(schoolId)} -> ${id}: file missing from R2`);
  }

  console.log(`Checked ${assets.length} media assets and ${links.filter((l) => idFromUrl(l[2])).length} live links.`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const line of problems) console.log("  " + line);
    process.exitCode = 1;
  } else {
    console.log("No problems found.");
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Media audit failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
