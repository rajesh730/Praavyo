import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import { getActiveCertificateFilter } from "@/lib/certificates";
import { formatPlacementLabel } from "@/lib/results";
import { bsAcademicYearLabel } from "@pravyo/core/nepaliDate";
import Achievement from "@/models/Achievement";
import User from "@/models/User";
import "@/models/Student";
import "@/models/Event";
import "@/models/PerformanceProgram";

export const dynamic = "force-dynamic";

/**
 * GET /api/school/certificates — the school's certificate register.
 *
 * One flat row per certificate, already resolved for the table: who, which
 * competition or performance program, which award, which academic year. The
 * page filters these rows (year, type, event, award, grade, name), so every
 * field it filters on is computed here once, the same way for every row.
 *
 * Academic year: the event's / program's own session when it has one;
 * otherwise the session the certificate was issued in (a session starts in
 * April, with Baisakh). Shown in the school's calendar, e.g. "2083 BS".
 */
export async function GET() {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const [school, certificates] = await Promise.all([
      User.findById(session.user.id).select("calendarPreference").lean(),
      Achievement.find({ school: session.user.id, ...getActiveCertificateFilter() })
        .select(
          "student captainStudent parentAchievement teamName recipientType certificateRecipientName event program performanceTitle title placement certificateIssuedAt awardedAt certificateCode certificateUrl"
        )
        .populate("parentAchievement", "certificateRecipientName teamName recipientType")
        .populate("captainStudent", "name grade section")
        .populate("student", "name grade section rollNumber")
        .populate("event", "title date eventType academicYearStart")
        .populate("program", "title date academicYearStart")
        .sort({ certificateIssuedAt: -1 })
        .lean(),
    ]);

    const calendar = school?.calendarPreference === "AD" ? "AD" : "BS";
    const yearLabel = (start) =>
      calendar === "BS" ? `${bsAcademicYearLabel(start)} BS` : `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

    const rows = certificates.map((c) => {
      const source = c.program || c.event || null;
      const issued = c.certificateIssuedAt || c.awardedAt || null;
      let yearStart = Number.isFinite(source?.academicYearStart) ? source.academicYearStart : null;
      if (yearStart === null) {
        const date = new Date(source?.date || issued || Date.now());
        // A session runs from April (Baisakh) to March.
        yearStart = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
      }
      const person = c.student || c.captainStudent || null;
      const isTeam = String(c.recipientType || "").toUpperCase() === "TEAM";

      return {
        _id: String(c._id),
        recipient:
          c.certificateRecipientName ||
          c.teamName ||
          c.parentAchievement?.teamName ||
          person?.name ||
          "School recipient",
        isTeam,
        grade: person?.grade || "",
        section: person?.section || "",
        kind: c.program ? "PROGRAM" : "COMPETITION",
        sourceId: source ? String(source._id) : "",
        sourceTitle: source?.title || c.title || "Certificate",
        performanceTitle: c.performanceTitle || "",
        placement: c.placement || "PARTICIPANT",
        placementLabel: formatPlacementLabel(c.placement || "PARTICIPANT")
          .toLowerCase()
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        yearStart,
        yearLabel: yearLabel(yearStart),
        eventDate: source?.date || null,
        issuedAt: issued,
        code: c.certificateCode || "",
        url: c.certificateUrl || `/certificates/${c._id}`,
      };
    });

    return NextResponse.json({ certificates: rows, calendar }, { status: 200 });
  } catch (error) {
    console.error("School Certificates Error:", error);
    return NextResponse.json({ message: "Failed to load certificates" }, { status: 500 });
  }
}
