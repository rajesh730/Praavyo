import { z } from "zod";
import { INQUIRY_LIMITS } from "./schoolInquiryLimits.js";

/**
 * Inquiries sent to a school from its public profile. One definition of what
 * a valid inquiry is, used by the public form's API and its tests.
 */

export { INQUIRY_LIMITS };

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

export const inquiryInput = z.object({
  name: z
    .string()
    .transform(clean)
    .pipe(z.string().min(2, "Enter your name.").max(INQUIRY_LIMITS.name, "Your name is too long.")),
  email: z
    .string()
    .transform((value) => clean(value).toLowerCase())
    .pipe(z.email("Enter a valid email address.").max(INQUIRY_LIMITS.email, "The email address is too long.")),
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

/** Parse a submitted inquiry: `{ data }` when valid, else `{ error }` with the first problem. */
export function parseInquiry(body) {
  const result = inquiryInput.safeParse({
    name: body?.name ?? "",
    email: body?.email ?? "",
    phone: body?.phone ?? "",
    subject: body?.subject ?? "",
    message: body?.message ?? "",
  });
  if (result.success) return { data: result.data };
  return { error: result.error.issues[0]?.message || "Check the form and try again." };
}

/** The inquiry as the school's inbox shows it. */
export function serializeInquiry(row) {
  return {
    id: String(row._id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    readAt: row.readAt || null,
  };
}
