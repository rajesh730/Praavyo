import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import SchoolInquiry from "@/models/SchoolInquiry";
import { serializeInquiry } from "@/lib/schoolInquiries";
import { successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET — the school's inquiry inbox. `status`: "active" (default: new + read),
 * "NEW", "READ" or "ARCHIVED". Only the signed-in school's own inquiries.
 */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load inquiries" },
  async ({ request, session }) => {
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "active").toUpperCase();
    const school = session.user.schoolId || session.user.id;

    const filter = { school };
    if (["NEW", "READ", "ARCHIVED"].includes(status)) filter.status = status;
    else filter.status = { $in: ["NEW", "READ"] };

    const [rows, counts] = await Promise.all([
      SchoolInquiry.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      SchoolInquiry.aggregate([
        // Aggregations skip Mongoose casting, so the id must be an ObjectId.
        { $match: { school: new mongoose.Types.ObjectId(String(school)) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const countBy = Object.fromEntries(counts.map((row) => [row._id, row.count]));

    return successResponse(200, "Inquiries loaded", {
      inquiries: rows.map(serializeInquiry),
      counts: {
        NEW: countBy.NEW || 0,
        READ: countBy.READ || 0,
        ARCHIVED: countBy.ARCHIVED || 0,
      },
    });
  }
);
