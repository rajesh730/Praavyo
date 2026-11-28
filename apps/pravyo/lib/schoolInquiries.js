import { z } from "zod";
import {
  ADMISSION_GENDERS,
  ADMISSION_LIMITS,
  GUARDIAN_RELATIONS,
  INQUIRY_LIMITS,
} from "./schoolInquiryLimits.js";

/**
 * Inquiries sent to a school by people who are not signed in: general
 * questions and admission applications, from the school's Praavyo profile or
 * from its own website. One definition of what a valid submission is, used by
 * both doors (lib/inquiryIntake.js) and their tests.
 */

export { INQUIRY_LIMITS, ADMISSION_LIMITS };

export const INQUIRY_TYPES = ["GENERAL", "ADMISSION"];
export const INQUIRY_SOURCES = ["PRAAVYO", "WEBSITE"];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

// Nepali mobiles (98XXXXXXXX), landlines with area codes, or +977 / any
// international number: 7–15 digits once spaces, dashes and brackets go.
const phoneSchema = z
  .string()
  .transform((value) => clean(value))
  .refine((value) => /^\+?[\d\s()-]+$/.test(value), "Enter a phone number using digits only.")
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, "Enter a phone number of 7 to 15 digits.");

const nameSchema = z
  .string()
  .transform(clean)
  .pipe(z.string().min(2, "Enter your name.").max(INQUIRY_LIMITS.name, "Your name is too long."));

const emailSchema = z
  .string()
  .transform((value) => clean(value).toLowerCase())
  .pipe(z.email("Enter a valid email address.").max(INQUIRY_LIMITS.email, "The email address is too long."));

export const inquiryInput = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.pipe(z.string().max(INQUIRY_LIMITS.phone, "The phone number is too long.")),
  subject: z
    .string()
    .transform(clean)
    .pipe(z.string().min(3, "Enter a subject.").max(INQUIRY_LIMITS.subject, "The subject is too long.")),
  // Line breaks are kept in the message; only the ends are trimmed.
  message: z
    .string()
    .transform((value) => String(value ?? "").trim())
    .pipe(z.string().min(10, "Write a little more — at least 10 characters.").max(INQUIRY_LIMITS.message, "The message is too long.")),
});

const optionalText = (max, tooLong) =>
  z.string().transform(clean).pipe(z.string().max(max, tooLong));

// One of `allowed` (case-insensitive) or empty; anything else becomes empty.
const optionalChoice = (allowed) =>
  z.string().transform((value) => {
    const wanted = clean(value).toLowerCase();
    return allowed.find((option) => option.toLowerCase() === wanted) || "";
  });

export const admissionInput = z.object({
  studentName: z
    .string()
    .transform(clean)
    .pipe(
      z
        .string()
        .min(2, "Enter the student's name.")
        .max(ADMISSION_LIMITS.studentName, "The student's name is too long.")
    ),
  grade: z.string().transform(clean).pipe(z.string().min(1, "Choose the grade you are applying for.")),
  dateOfBirth: optionalText(ADMISSION_LIMITS.dateOfBirth, "The date of birth is too long."),
  gender: optionalChoice(ADMISSION_GENDERS),
  previousSchool: optionalText(ADMISSION_LIMITS.previousSchool, "The previous school's name is too long."),
  // The guardian: `name` on the inquiry.
  name: z
    .string()
    .transform(clean)
    .pipe(z.string().min(2, "Enter the parent or guardian's name.").max(INQUIRY_LIMITS.name, "The guardian's name is too long.")),
  guardianRelation: optionalChoice(GUARDIAN_RELATIONS),
  phone: phoneSchema.pipe(z.string().max(INQUIRY_LIMITS.phone, "The phone number is too long.")),
  // Optional: many families apply with a phone number only.
  email: z
    .string()
    .transform((value) => clean(value).toLowerCase())
    .pipe(z.union([z.literal(""), z.email("Enter a valid email address.")]))
    .pipe(z.string().max(INQUIRY_LIMITS.email, "The email address is too long.")),
  address: optionalText(ADMISSION_LIMITS.address, "The address is too long."),
  message: z
    .string()
    .transform((value) => String(value ?? "").trim())
    .pipe(z.string().max(INQUIRY_LIMITS.message, "The message is too long.")),
});

const firstIssue = (result) => result.error.issues[0]?.message || "Check the form and try again.";

/** Parse a general inquiry: `{ data }` when valid, else `{ error }` with the first problem. */
export function parseInquiry(body) {
  const result = inquiryInput.safeParse({
    name: body?.name ?? "",
    email: body?.email ?? "",
    phone: body?.phone ?? "",
    subject: body?.subject ?? "",
    message: body?.message ?? "",
  });
  if (result.success) return { data: result.data };
  return { error: firstIssue(result) };
}

/**
 * Parse an admission application against the school's open season
 * (`season` = serializeAdmission output, with `grades` already resolved to the
 * grades taking applications). Returns `{ data }` shaped for SchoolInquiry,
 * or `{ error, code }`.
 */
export function parseAdmissionApplication(body, season) {
  if (!season?.isOpen) {
    return { error: "Admissions are closed at the moment.", code: "ADMISSION_CLOSED" };
  }
  const result = admissionInput.safeParse({
    studentName: body?.studentName ?? "",
    grade: body?.grade ?? "",
    dateOfBirth: body?.dateOfBirth ?? "",
    gender: body?.gender ?? "",
    previousSchool: body?.previousSchool ?? "",
    name: body?.guardianName ?? body?.name ?? "",
    guardianRelation: body?.guardianRelation ?? "",
    phone: body?.phone ?? "",
    email: body?.email ?? "",
    address: body?.address ?? "",
    message: body?.message ?? "",
  });
  if (!result.success) return { error: firstIssue(result), code: "VALIDATION_ERROR" };

  const input = result.data;
  const grades = season.grades || [];
  const grade = grades.find((option) => option.toLowerCase() === input.grade.toLowerCase());
  if (grades.length && !grade) {
    return { error: `Admissions are open for ${grades.join(", ")} only.`, code: "GRADE_NOT_OPEN" };
  }
  const gradeLabel = grade || input.grade;

  return {
    data: {
      type: "ADMISSION",
      name: input.name,
      email: input.email,
      phone: input.phone,
      subject: `Admission: ${input.studentName} (${gradeLabel})`.slice(0, INQUIRY_LIMITS.subject),
      message: input.message,
      admission: {
        studentName: input.studentName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        grade: gradeLabel,
        previousSchool: input.previousSchool,
        guardianRelation: input.guardianRelation,
        address: input.address,
        academicYear: season.academicYear || "",
      },
    },
  };
}

/** The submission's type: "ADMISSION" only when asked for, else "GENERAL". */
export function submissionType(body) {
  return String(body?.type || "").trim().toUpperCase() === "ADMISSION" ? "ADMISSION" : "GENERAL";
}

/** The inquiry as the school's inbox shows it. */
export function serializeInquiry(row) {
  return {
    id: String(row._id),
    type: row.type === "ADMISSION" ? "ADMISSION" : "GENERAL",
    source: row.source === "WEBSITE" ? "WEBSITE" : "PRAAVYO",
    name: row.name,
    email: row.email || "",
    phone: row.phone,
    subject: row.subject,
    message: row.message || "",
    admission: row.type === "ADMISSION" && row.admission
      ? {
          studentName: row.admission.studentName || "",
          dateOfBirth: row.admission.dateOfBirth || "",
          gender: row.admission.gender || "",
          grade: row.admission.grade || "",
          previousSchool: row.admission.previousSchool || "",
          guardianRelation: row.admission.guardianRelation || "",
          address: row.admission.address || "",
          academicYear: row.admission.academicYear || "",
        }
      : null,
    status: row.status,
    createdAt: row.createdAt,
    readAt: row.readAt || null,
  };
}

/**
 * The inbox's Mongo filter for a school. `status`: "active" (new + read),
 * "NEW", "READ" or "ARCHIVED"; `source`: "WEBSITE" / "PRAAVYO" / anything
 * else = all; `type`: "GENERAL" / "ADMISSION" / anything else = all. Rows
 * from before source/type existed count as PRAAVYO + GENERAL.
 */
export function inquiryListFilter(school, { status, source, type } = {}) {
  const filter = { school };
  const wantedStatus = String(status || "active").toUpperCase();
  filter.status = ["NEW", "READ", "ARCHIVED"].includes(wantedStatus)
    ? wantedStatus
    : { $in: ["NEW", "READ"] };

  const wantedSource = String(source || "").toUpperCase();
  if (wantedSource === "WEBSITE") filter.source = "WEBSITE";
  else if (wantedSource === "PRAAVYO") filter.source = { $in: ["PRAAVYO", null] };

  const wantedType = String(type || "").toUpperCase();
  if (wantedType === "ADMISSION") filter.type = "ADMISSION";
  else if (wantedType === "GENERAL") filter.type = { $in: ["GENERAL", null] };

  return filter;
}
