/**
 * Teacher Login Card token — the QR on a teacher's card IS the credential,
 * the same trade the Parent Access Card makes: scanning it signs the teacher
 * straight in, no password.
 *
 * The token is `<teacherId>.<signature>`, an HMAC of the id and the teacher's
 * `cardVersion` under NEXTAUTH_SECRET. Nothing is stored, so the school can
 * show or reprint the card at any time and get the same QR. Bumping
 * `cardVersion` (done by "Reset password") kills every card printed before.
 *
 * Server-only: imports node:crypto.
 */
import crypto from "node:crypto";
import Teacher from "@pravyo/db/models/Teacher";

const TOKEN = /^([a-f\d]{24})\.([A-Za-z0-9_-]{32})$/;

function sign(teacherId, cardVersion) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for teacher login cards");
  return crypto
    .createHmac("sha256", secret)
    .update(`teacher-card:v1:${teacherId}:${cardVersion || 0}`)
    .digest("base64url")
    .slice(0, 32);
}

/** The card token for a teacher document (needs `_id` and `cardVersion`). */
export function teacherCardToken(teacher) {
  const id = teacher._id.toString();
  return `${id}.${sign(id, teacher.cardVersion)}`;
}

/** `{ ok: true, teacher }` for a current card, `{ ok: false }` otherwise. */
export async function verifyTeacherCardToken(token) {
  const match = TOKEN.exec(String(token || "").trim());
  if (!match) return { ok: false };
  const [, id, signature] = match;

  const teacher = await Teacher.findById(id);
  if (!teacher || teacher.isDeleted) return { ok: false };

  const expected = Buffer.from(sign(id, teacher.cardVersion));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false };
  }
  return { ok: true, teacher };
}
