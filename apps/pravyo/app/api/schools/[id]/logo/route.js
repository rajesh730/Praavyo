import mongoose from "mongoose";
import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";

export const dynamic = "force-dynamic";

const PRAAVYO_ICON = "/pravyo-icon.png?v=2";

/** Only our own media (or an https image) is ever redirected to. */
function safeLogo(value) {
  const url = String(value || "").trim();
  if (/^\/api\/media\/r2\/[a-f0-9]{24}$/i.test(url)) return url;
  return /^https:\/\//i.test(url) ? url : "";
}

/**
 * The picture shown beside a device notification from a school (owner,
 * 2026-11-23): that school's logo, or the Praavyo logo when the school has
 * not uploaded one. Public on purpose — school logos are already public
 * media — and it reveals nothing but the logo itself.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  let target = PRAAVYO_ICON;
  try {
    if (mongoose.Types.ObjectId.isValid(id)) {
      await connectDB();
      const profile = await SchoolShowcaseProfile.findOne({ school: id }).select("logoUrl coverImageUrl").lean();
      target = safeLogo(profile?.logoUrl || profile?.coverImageUrl) || PRAAVYO_ICON;
    }
  } catch (error) {
    console.error("GET /api/schools/[id]/logo error:", error.message);
  }
  const response = NextResponse.redirect(new URL(target, request.url), 302);
  // A new logo shows within the hour; the browser need not ask every time.
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
}
