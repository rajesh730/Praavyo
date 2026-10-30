/**
 * Teacher Login Card QR — shared by the printed card and the sign-in page.
 *
 * Unlike the Parent Access Card, the teacher card is NOT a credential. The QR
 * only carries the teacher's username (or email when they have none) so they
 * do not have to type it; the password is still required to sign in. That is
 * why the identifier can sit in a plain URL.
 *
 * Client-safe: no server imports.
 */

const USERNAME = /^[a-z][a-z0-9._-]{2,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The link encoded into the card's QR. */
export function teacherCardUrl(siteUrl, identifier) {
  return `${siteUrl}/login?as=teacher&user=${encodeURIComponent(identifier)}`;
}

/** A username or email from a printed teacher card, or null if it is not one. */
export function readTeacherCard(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.pathname.replace(/\/$/, "") !== "/login") return null;
    const user = String(url.searchParams.get("user") || "").trim().toLowerCase();
    return USERNAME.test(user) || EMAIL.test(user) ? user : null;
  } catch {
    return null;
  }
}
