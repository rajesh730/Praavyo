import User from "@/models/User";
import SchoolInquiry from "@/models/SchoolInquiry";
import { applyRateLimit } from "@/lib/rateLimit";
import { getAdmissionSeason } from "@/lib/schoolAdmission";
import { parseAdmissionApplication, parseInquiry, submissionType } from "@/lib/schoolInquiries";
import { pushSchoolInquiry } from "@/lib/devicePush";
import { runAfterResponse } from "@/lib/afterResponse";

const HOUR = 60 * 60 * 1000;

/**
 * The one way an inquiry or admission application gets into a school's inbox,
 * whichever door it came through:
 *   source PRAAVYO — the public profile form (/api/public/schools/[id]/inquiries);
 *   source WEBSITE — the school's own website (POST /api/v1/website/inquiries).
 *
 * Guards: a honeypot field (`website`) people never see and bots fill in;
 * a per-visitor limit (5 an hour by default) and a per-school limit (60 an
 * hour); only
 * approved schools; admission applications only while the season is open and
 * only for grades taking applications. Nothing about the inquiry is returned.
 *
 * Returns `{ status, message, code? }` for the route to send.
 */
export async function receiveInquiry({ schoolId, body, source, visitor, visitorMax = 5 }) {
  if (!body || typeof body !== "object") {
    return { status: 400, message: "Fill in the form and try again.", code: "VALIDATION_ERROR" };
  }

  // A bot filled the hidden field: answer as if it worked, store nothing.
  if (String(body.website || "").trim()) {
    return { status: 201, message: "Inquiry sent" };
  }

  const [perVisitor, perSchool] = await Promise.all([
    applyRateLimit({ key: `inquiry:ip:${visitor || "unknown"}`, windowMs: HOUR, max: visitorMax }),
    applyRateLimit({ key: `inquiry:school:${schoolId}`, windowMs: HOUR, max: 60 }),
  ]);
  if (!perVisitor.ok || !perSchool.ok) {
    const retryAfter = Math.max(perVisitor.retryAfter || 0, perSchool.retryAfter || 0);
    return {
      status: 429,
      code: "RATE_LIMITED",
      message: `Too many inquiries were sent just now. Please try again in ${Math.ceil(retryAfter / 60) || 1} minutes.`,
    };
  }

  const type = submissionType(body);
  let data;
  if (type === "GENERAL") {
    const parsed = parseInquiry(body);
    if (parsed.error) return { status: 400, message: parsed.error, code: "VALIDATION_ERROR" };
    data = { ...parsed.data, type: "GENERAL" };
  }

  const school = await User.exists({
    _id: schoolId,
    role: "SCHOOL_ADMIN",
    status: { $in: ["APPROVED", "SUBSCRIBED"] },
  });
  if (!school) return { status: 404, message: "School not found.", code: "SCHOOL_NOT_FOUND" };

  if (type === "ADMISSION") {
    const { season } = await getAdmissionSeason(schoolId);
    const parsed = parseAdmissionApplication(body, season);
    if (parsed.error) {
      return {
        status: parsed.code === "ADMISSION_CLOSED" ? 409 : 400,
        message: parsed.error,
        code: parsed.code,
      };
    }
    data = parsed.data;
  }

  const inquiry = await SchoolInquiry.create({ ...data, source, school: schoolId });
  runAfterResponse(() => pushSchoolInquiry(inquiry));

  return {
    status: 201,
    message: type === "ADMISSION" ? "Admission application sent" : "Inquiry sent",
  };
}
