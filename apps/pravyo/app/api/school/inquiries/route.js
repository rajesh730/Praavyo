import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import SchoolInquiry from "@/models/SchoolInquiry";
import { inquiryListFilter, serializeInquiry } from "@/lib/schoolInquiries";
import { successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET — the school's inquiry inbox. Filters:
 *   status — "active" (default: new + read), "NEW", "READ" or "ARCHIVED";
 *   source — "WEBSITE" (the school's own website), "PRAAVYO" (its public
 *            profile) or empty for both;
 *   type   — "GENERAL", "ADMISSION" or empty for both.
 * `counts` = per status (all sources and types); `sources` and `types` =
 * per source / type within the chosen status. Only the school's own rows.
 */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load inquiries" },
  async ({ request, session }) => {
    const { searchParams } = new URL(request.url);
    const school = session.user.schoolId || session.user.id;
    const status = searchParams.get("status") || "active";
    const filter = inquiryListFilter(school, {
      status,
      source: searchParams.get("source"),
      type: searchParams.get("type"),
    });

    // Aggregations skip Mongoose casting, so the id must be an ObjectId.
    const schoolId = new mongoose.Types.ObjectId(String(school));
    const statusOnly = { ...inquiryListFilter(schoolId, { status }) };

    const [rows, counts, facets] = await Promise.all([
      SchoolInquiry.find(filter).sort({ createdAt: -1 }).limit(300).lean(),
      SchoolInquiry.aggregate([
        { $match: { school: schoolId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      SchoolInquiry.aggregate([
        { $match: statusOnly },
        {
          $group: {
            _id: {
              source: { $ifNull: ["$source", "PRAAVYO"] },
              type: { $ifNull: ["$type", "GENERAL"] },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    const countBy = Object.fromEntries(counts.map((row) => [row._id, row.count]));
    const sources = { WEBSITE: 0, PRAAVYO: 0 };
    const types = { GENERAL: 0, ADMISSION: 0 };
    facets.forEach((row) => {
      sources[row._id.source] = (sources[row._id.source] || 0) + row.count;
      types[row._id.type] = (types[row._id.type] || 0) + row.count;
    });

    return successResponse(200, "Inquiries loaded", {
      inquiries: rows.map(serializeInquiry),
      counts: {
        NEW: countBy.NEW || 0,
        READ: countBy.READ || 0,
        ARCHIVED: countBy.ARCHIVED || 0,
      },
      sources,
      types,
    });
  }
);
