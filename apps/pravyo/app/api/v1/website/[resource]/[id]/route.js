import { NextResponse } from "next/server";
import { requireWebsiteApiKey } from "@/lib/websiteApiAuth";
import { WEBSITE_DETAILS, websiteOrigin } from "@/lib/websiteApi";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/website/<resource>/<id> — one notice, event, writing, magazine
 * issue (with its articles) or gallery album (with its photos), for the
 * school's website detail pages. Same key and rules as the list endpoints.
 */
export async function GET(request, { params }) {
  try {
    const access = await requireWebsiteApiKey(request);
    if (access.error) return access.error;
    const { resource, id } = await params;
    const load = WEBSITE_DETAILS[resource];
    if (!load) {
      return NextResponse.json(
        { success: false, code: "RESOURCE_NOT_FOUND", message: "Unknown website resource" },
        { status: 404 }
      );
    }

    const data = await load(access.schoolId, id, { request, origin: websiteOrigin(request) });
    if (!data) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", message: "Not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (error) {
    console.error("GET website API detail error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_SERVER_ERROR", message: "Website API request failed" },
      { status: 500 }
    );
  }
}
