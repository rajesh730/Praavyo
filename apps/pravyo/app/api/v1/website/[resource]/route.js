import { NextResponse } from "next/server";
import { requireWebsiteApiKey } from "@/lib/websiteApiAuth";
import { WEBSITE_LISTS, websiteOrigin } from "@/lib/websiteApi";
import { receiveInquiry } from "@/lib/inquiryIntake";

export const dynamic = "force-dynamic";

/**
 * The Website API: a school's own website reads its public Praavyo content
 * and sends inquiries back. Authenticated with the school's API key
 * (`Authorization: Bearer prv_school_live_…`), which also decides the school.
 * The key belongs on the website's server, never in browser code.
 *
 * GET  /api/v1/website/<resource>   school | notices | events | writings |
 *                                   magazines | gallery | achievements | admission
 * POST /api/v1/website/inquiries    a general inquiry or an admission application
 *
 * Content lives in lib/websiteApi.js; details are at /<resource>/<id>.
 */

function fail(status, code, message) {
  return NextResponse.json({ success: false, code, message }, { status });
}

export async function GET(request, { params }) {
  try {
    const access = await requireWebsiteApiKey(request);
    if (access.error) return access.error;
    const { resource } = await params;
    const load = WEBSITE_LISTS[resource];
    if (!load) return fail(404, "RESOURCE_NOT_FOUND", "Unknown website resource");

    const data = await load(access.schoolId, { request, origin: websiteOrigin(request) });
    if (!data) return fail(404, "SCHOOL_NOT_FOUND", "School not found");
    return NextResponse.json(
      { success: true, data },
      // Admission must switch off promptly; the rest may be cached briefly.
      { headers: { "Cache-Control": ["admission", "forms"].includes(resource) ? "no-store" : "private, max-age=60" } }
    );
  } catch (error) {
    console.error("GET website API error:", error);
    return fail(500, "INTERNAL_SERVER_ERROR", "Website API request failed");
  }
}

/**
 * POST /api/v1/website/inquiries — from the website's contact or admission
 * form. Body: `{ type: "GENERAL" | "ADMISSION", ... }` (fields in the guide /
 * GET /admission). Stored with source WEBSITE, so the school can filter
 * "Through website" in Inquiries. Send the visitor's IP in `X-Visitor-IP` so
 * the 5-an-hour limit applies per visitor; without it, the whole website
 * shares 60 an hour.
 */
export async function POST(request, { params }) {
  try {
    const { resource } = await params;
    if (resource !== "inquiries") {
      return fail(405, "METHOD_NOT_ALLOWED", "Only /inquiries accepts POST");
    }
    const access = await requireWebsiteApiKey(request);
    if (access.error) return access.error;

    const body = await request.json().catch(() => null);
    const visitorIp = String(request.headers.get("x-visitor-ip") || "").split(",")[0].trim().slice(0, 64);
    const keyId = String(access.apiKey._id);
    const result = await receiveInquiry({
      schoolId: access.schoolId,
      body,
      source: "WEBSITE",
      visitor: visitorIp ? `website:${keyId}:${visitorIp}` : `website:${keyId}`,
      visitorMax: visitorIp ? 5 : 60,
    });

    if (result.status === 201) {
      return NextResponse.json({ success: true, message: result.message, data: result.data || {} }, { status: 201 });
    }
    return fail(result.status, result.code || "ERROR", result.message);
  } catch (error) {
    console.error("POST website API error:", error);
    return fail(500, "INTERNAL_SERVER_ERROR", "The inquiry could not be sent");
  }
}
