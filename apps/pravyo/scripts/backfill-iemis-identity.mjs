// Fill the IEMIS copies on records made before 2026-11-17.
//
//   node scripts/backfill-iemis-identity.mjs           preview only (default)
//   node scripts/backfill-iemis-identity.mjs --apply   write the changes
//
// New records fill these fields themselves (model hooks). This script covers
// the older ones:
//   - ParentStudentLink.studentIemisNumber      <- the child's current IEMIS
//   - StudentTransfer.studentIemisNumber        <- the student's IEMIS
//   - StudentTransfer.fromSchoolIemisNumber     <- the source school's IEMIS
//   - StudentTransfer.toSchoolIemisNumber       <- the destination school's IEMIS
//
// It only fills empty fields (links are also corrected when they no longer
// match the child), never deletes anything, and is safe to run again.
// See docs/IEMIS_IDENTITY.md.
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: ".env.local" });
dotenv.config();

const apply = process.argv.includes("--apply");
const uri = String(process.env.MONGODB_URI || "").trim();
if (!uri) throw new Error("MONGODB_URI is required.");

await mongoose.connect(uri);
const db = mongoose.connection.db;

const students = db.collection("students");
const schoolConfigs = db.collection("schoolconfigs");
const links = db.collection("parentstudentlinks");
const transfers = db.collection("studenttransfers");

const studentIemis = new Map(
  (await students.find({}, { projection: { iemisNumber: 1 } }).toArray())
    .map((row) => [String(row._id), row.iemisNumber || ""])
);
const schoolIemis = new Map(
  (await schoolConfigs.find({}, { projection: { school: 1, iemisNumber: 1 } }).toArray())
    .map((row) => [String(row.school), row.iemisNumber || ""])
);

// --- Parent links ----------------------------------------------------------
const linkOps = [];
let linksWithoutStudentIemis = 0;
for (const link of await links.find({}, { projection: { student: 1, studentIemisNumber: 1 } }).toArray()) {
  const wanted = studentIemis.get(String(link.student)) || "";
  if (!wanted) linksWithoutStudentIemis += 1;
  if ((link.studentIemisNumber || "") !== wanted) {
    linkOps.push({ updateOne: { filter: { _id: link._id }, update: { $set: { studentIemisNumber: wanted } } } });
  }
}

// --- Transfers -------------------------------------------------------------
const transferOps = [];
for (const transfer of await transfers.find({}, {
  projection: { student: 1, fromSchool: 1, toSchool: 1, studentIemisNumber: 1, fromSchoolIemisNumber: 1, toSchoolIemisNumber: 1 },
}).toArray()) {
  const set = {};
  if (!transfer.studentIemisNumber && studentIemis.get(String(transfer.student))) {
    set.studentIemisNumber = studentIemis.get(String(transfer.student));
  }
  if (!transfer.fromSchoolIemisNumber && transfer.fromSchool && schoolIemis.get(String(transfer.fromSchool))) {
    set.fromSchoolIemisNumber = schoolIemis.get(String(transfer.fromSchool));
  }
  if (!transfer.toSchoolIemisNumber && transfer.toSchool && schoolIemis.get(String(transfer.toSchool))) {
    set.toSchoolIemisNumber = schoolIemis.get(String(transfer.toSchool));
  }
  if (Object.keys(set).length) transferOps.push({ updateOne: { filter: { _id: transfer._id }, update: { $set: set } } });
}

console.log(`Parent links to update: ${linkOps.length} (links whose child has no IEMIS yet: ${linksWithoutStudentIemis})`);
console.log(`Transfers to update:    ${transferOps.length}`);

if (!apply) {
  console.log("Preview only. Run again with --apply to write.");
} else {
  if (linkOps.length) await links.bulkWrite(linkOps, { ordered: false });
  if (transferOps.length) await transfers.bulkWrite(transferOps, { ordered: false });
  console.log("Done.");
}

await mongoose.disconnect();
