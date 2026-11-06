import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import SchoolInquiry from "@/models/SchoolInquiry";
import { serializeInquiry } from "@/lib/schoolInquiries";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * PATCH { status: "READ" | "NEW" | "ARCHIVED" } — mark an inquiry read or
 * unread, archive it, or bring it back (READ). The school's own only.
 */
export const PATCH = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to update the inquiry" },
  async ({ request, params, session }) => {
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return errorResponse(404, "Inquiry not found.");
    }
    const body = await request.json().catch(() => ({}));
    const status = String(body?.status || "").toUpperCase();
    if (!["NEW", "READ", "ARCHIVED"].includes(status)) {
      return validationError("Choose read, unread or archive.");
    }

    const update = { status };
    if (status === "READ") update.readAt = new Date();
    if (status === "NEW") update.readAt = null;

    const inquiry = await SchoolInquiry.findOneAndUpdate(
      { _id: params.id, school: session.user.schoolId || session.user.id },
      { $set: update },
      { new: true }
    ).lean();
    if (!inquiry) return errorResponse(404, "Inquiry not found.");

    return successResponse(200, "Inquiry updated", { inquiry: serializeInquiry(inquiry) });
  }
);
