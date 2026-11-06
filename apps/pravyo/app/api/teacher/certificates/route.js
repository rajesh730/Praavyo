import { defineRoute } from "@/lib/routeHandler";
import Achievement from "@/models/Achievement";
import "@/models/User";
import "@/models/Training";
import { getActiveCertificateFilter } from "@/lib/certificates";
import { successResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/**
 * GET — the signed-in teacher's own certificates (Praavyo trainings), from
 * every school they were registered through, newest first.
 */
export const GET = defineRoute({ roles: ["TEACHER"], errorMessage: "Failed to load certificates" }, async ({ session }) => {
  const rows = await Achievement.find({ teacher: session.user.id, ...getActiveCertificateFilter() })
    .select("title school training certificateUrl certificateCode certificateIssuedAt awardedAt")
    .populate("school", "schoolName")
    .populate("training", "title duration")
    .sort({ awardedAt: -1 })
    .lean();
  return successResponse(200, "Certificates loaded", {
    certificates: rows.map((row) => ({
      id: String(row._id),
      title: row.training?.title || row.title,
      duration: row.training?.duration || "",
      schoolName: row.school?.schoolName || "",
      trainedOn: row.awardedAt,
      issuedAt: row.certificateIssuedAt,
      code: row.certificateCode || "",
      url: row.certificateUrl || `/certificates/${row._id}`,
    })),
  });
});
