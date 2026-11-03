/**
 * Teacher Login Card QR — shared by the printed card and the sign-in page.
 *
 * Like the Parent Access Card, the teacher card is a credential: its QR opens
 * `/login?as=teacher&card=<token>` and signs the teacher straight in. The token
 * is made and checked on the server (@pravyo/auth/teacherCardToken).
 *
 * A teacher who also works at another school gets a username-only card
 * (`?user=`), which fills the form and still needs the password — one school
 * must not hand out a login into another school. Cards printed before the
 * token existed are the same shape and keep working that way.
 *
 * Client-safe: no server imports.
 */

const USERNAME = /^[a-z][a-z0-9._-]{2,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_TOKEN = /^[a-f\d]{24}\.[A-Za-z0-9_-]{32}$/;

/** The link encoded into a username-only card's QR. */
export function teacherCardUrl(siteUrl, identifier) {
  return `${siteUrl}/login?as=teacher&user=${encodeURIComponent(identifier)}`;
}

/** The link encoded into a card that signs the teacher in by itself. */
export function teacherCardTokenUrl(siteUrl, token) {
  return `${siteUrl}/login?as=teacher&card=${encodeURIComponent(token)}`;
}

/** A valid-looking card token, or null. The server still verifies it. */
export function readTeacherCardToken(value) {
  const token = String(value || "").trim();
  return CARD_TOKEN.test(token) ? token : null;
}

/**
 * Read a scanned teacher card: `{ card }` for a sign-in card, `{ user }` for a
 * username-only one, or null if the QR is not a Pravyo teacher card.
 */
export function readTeacherCard(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.pathname.replace(/\/$/, "") !== "/login") return null;
    const card = readTeacherCardToken(url.searchParams.get("card"));
    if (card) return { card };
    const user = String(url.searchParams.get("user") || "").trim().toLowerCase();
    return USERNAME.test(user) || EMAIL.test(user) ? { user } : null;
  } catch {
    return null;
  }
}
