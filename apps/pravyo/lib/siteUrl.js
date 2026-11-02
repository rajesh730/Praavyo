/**
 * The origin printed into QR codes, certificates and card links.
 *
 * The live site is https://www.praavyo.com (it moved from
 * pravyo.infobytesnepal.com; the bare praavyo.com redirects to www). A card or
 * certificate is printed once and carried for years, so anything that ends up
 * on paper must point straight at the live origin — even when
 * NEXT_PUBLIC_SITE_URL is stale or a school admin is signed in on another
 * host. Every other origin (localhost, Vercel previews) passes through
 * untouched.
 *
 * Reading is unaffected: scanners ignore the host, so cards already printed
 * with an old domain keep working.
 *
 * Client-safe: no server imports.
 */

export const CANONICAL_SITE_URL = "https://www.praavyo.com";

// Hosts that only redirect to the canonical origin.
const NON_CANONICAL_HOSTS = new Set(["pravyo.infobytesnepal.com", "praavyo.com"]);

/** `origin` with a redirecting host swapped for the live one, no trailing slash. */
export function printableOrigin(origin) {
  const value = String(origin || "").replace(/\/+$/, "");
  try {
    if (NON_CANONICAL_HOSTS.has(new URL(value).hostname)) return CANONICAL_SITE_URL;
  } catch {
    // Not an absolute URL — leave it as it was.
  }
  return value;
}
