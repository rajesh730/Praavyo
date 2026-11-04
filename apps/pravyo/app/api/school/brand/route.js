import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";

export const dynamic = "force-dynamic";

/** GET /api/school/brand — the signed-in school's logo, for the sidebar. */
export async function GET() {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;
    await connectDB();
    const profile = await SchoolShowcaseProfile.findOne({ school: session.user.id })
      .select("coverImageUrl")
      .lean();
    return NextResponse.json({ logoUrl: profile?.coverImageUrl || "" });
  } catch (loadError) {
    console.error("GET /api/school/brand error:", loadError);
    return NextResponse.json({ logoUrl: "" });
  }
}
