import mongoose from "mongoose";
import connectDB from "@/lib/db";
import User from "@/models/User";
import SchoolInquiry from "@/models/SchoolInquiry";
import { applyRateLimit } from "@/lib/rateLimit";
import { parseInquiry } from "@/lib/schoolInquiries";
import { errorResponse, internalServerError, successResponse, validationError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * POST — a visitor (not signed in) sends an inquiry to a school from its
 * public profile. Public by design, so it is guarded instead by:
 *   - a honeypot field (`website`) that people never see and bots fill in;
 *   - a per-visitor limit (5 an hour) and a per-school limit (60 an hour);
 *   - only approved schools receive inquiries.
 * Nothing about the inquiry is ever returned, so the route cannot be used to
 * read anyone's details back.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(404, "School not found.");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return validationError("Fill in the form and try again.");
    }

    // A bot filled the hidden field: answer as if it worked, store nothing.
    if (String(body.website || "").trim()) {
      return successResponse(201, "Inquiry sent", {});
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const [perVisitor, perSchool] = await Promise.all([
      applyRateLimit({ key: `inquiry:ip:${ip}`, windowMs: 60 * 60 * 1000, max: 5 }),
      applyRateLimit({ key: `inquiry:school:${id}`, windowMs: 60 * 60 * 1000, max: 60 }),
    ]);
    if (!perVisitor.ok || !perSchool.ok) {
      const retryAfter = Math.max(perVisitor.retryAfter || 0, perSchool.retryAfter || 0);
      return errorResponse(
        429,
        `Too many inquiries were sent just now. Please try again in ${Math.ceil(retryAfter / 60) || 1} minutes.`
      );
    }

    const { data, error } = parseInquiry(body);
    if (error) return validationError(error);

    await connectDB();
    const school = await User.exists({
      _id: id,
      role: "SCHOOL_ADMIN",
      status: { $in: ["APPROVED", "SUBSCRIBED"] },
    });
    if (!school) return errorResponse(404, "School not found.");

    await SchoolInquiry.create({ ...data, school: id });

    return successResponse(201, "Inquiry sent", {});
  } catch (error) {
    console.error("POST /api/public/schools/[id]/inquiries error:", error);
    return internalServerError("Your inquiry could not be sent. Please try again.");
  }
}
