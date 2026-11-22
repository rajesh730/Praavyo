import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import MagazineIssue from "@/models/MagazineIssue";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";

// Read-only for teachers. The school owns the magazine's creation, title,
// publishing and deletion. Teachers receive only issues that are either open
// for writing (where they curate their class) or already published (read-only).
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load school magazines" }, async ({ session }) => {
  const scope = await getTeacherMagazineScope(session);
  const issues = await MagazineIssue.find({
    school: scope.school,
    $or: [
      { status: "DRAFT", acceptingSubmissions: true },
      { status: "PUBLISHED" },
    ],
  })
    .sort({ weekStart: -1, createdAt: -1 })
    .limit(100)
    .lean();
  return NextResponse.json({ issues: issues.map(serializeMagazineIssue) });
});
