import { defineRoute } from "@/lib/routeHandler";
import { APIError, successResponse } from "@/lib/apiResponse";
import Achievement from "@/models/Achievement";
import "@/models/Student";
import { canManageProgram, loadProgram } from "@/lib/performancePrograms";

/** GET /api/programs/[id]/certificates — issued certificates, for staff. */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN", "TEACHER", "SUPER_ADMIN"] },
  async ({ params, session }) => {
    const program = await loadProgram(params.id);
    if (!canManageProgram(session, program)) throw new APIError("Program not found", 404, "NOT_FOUND");

    const certificates = await Achievement.find({ program: program._id })
      .select("student certificateRecipientName performanceTitle certificateUrl certificateCode")
      .populate("student", "name")
      .sort({ performanceTitle: 1, certificateRecipientName: 1 })
      .lean();

    return successResponse(200, "Certificates loaded", {
      certificates: certificates.map((c) => ({
        _id: String(c._id),
        name: c.certificateRecipientName || c.student?.name || "Student",
        performanceTitle: c.performanceTitle || "",
        certificateUrl: c.certificateUrl,
        certificateCode: c.certificateCode,
      })),
    });
  }
);
