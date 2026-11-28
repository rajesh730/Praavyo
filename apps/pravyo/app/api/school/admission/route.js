import { revalidatePath } from "next/cache";
import { defineRoute } from "@/lib/routeHandler";
import SchoolAdmission from "@/models/SchoolAdmission";
import { getAdmissionSeason, parseAdmissionSettings, serializeAdmission } from "@/lib/schoolAdmission";
import { successResponse, validationError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

function settingsPayload(row, schoolGrades) {
  return {
    settings: {
      isOpen: Boolean(row?.isOpen),
      academicYear: row?.academicYear || "",
      // What the school ticked; empty = every grade.
      grades: (row?.grades || []).filter((grade) => schoolGrades.includes(grade)),
      deadline: row?.deadline || null,
      note: row?.note || "",
      openedAt: row?.openedAt || null,
      closedAt: row?.closedAt || null,
      updatedAt: row?.updatedAt || null,
    },
    schoolGrades,
    // What families see right now.
    season: serializeAdmission(row, schoolGrades),
  };
}

/** GET — Settings → Admission: the school's admission season and its grades. */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load admission settings" },
  async ({ session }) => {
    const { row, schoolGrades } = await getAdmissionSeason(session.user.id);
    return successResponse(200, "Admission settings loaded", settingsPayload(row, schoolGrades));
  }
);

/**
 * PUT { isOpen, academicYear, grades[], deadline, note } — open or close the
 * admission season and set what families see. Opening shows the admission
 * form on the public profile and the connected website; closing hides it and
 * refuses new applications. Applications already received are kept.
 */
export const PUT = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to save admission settings" },
  async ({ request, session }) => {
    const schoolId = session.user.id;
    const body = await request.json().catch(() => null);
    const { row: existing, schoolGrades } = await getAdmissionSeason(schoolId);
    const { data, error } = parseAdmissionSettings(body, schoolGrades);
    if (error) return validationError(error);

    const now = new Date();
    const update = { ...data, updatedBy: session.user.id };
    if (data.isOpen && !existing?.isOpen) update.openedAt = now;
    if (!data.isOpen && existing?.isOpen) update.closedAt = now;

    const row = await SchoolAdmission.findOneAndUpdate(
      { school: schoolId },
      { $set: update, $setOnInsert: { school: schoolId } },
      { new: true, upsert: true }
    ).lean();

    // The public profile is cached for a minute; show the change now.
    try {
      revalidatePath(`/schools/${schoolId}`);
    } catch {
      // Outside a request (tests) there is nothing to revalidate.
    }

    const message = data.isOpen
      ? existing?.isOpen
        ? "Admission settings saved."
        : "Admission season is open. Families can apply now."
      : existing?.isOpen
        ? "Admission season is closed. The form is no longer shown."
        : "Admission settings saved.";
    return successResponse(200, message, settingsPayload(row, schoolGrades));
  }
);
