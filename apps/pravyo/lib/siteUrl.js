/**
 * The origin printed into QR codes, certificates and card links.
 *
 * The site moved from pravyo.infobytesnepal.com to praavyo.com. A card or
 * certificate is printed once and carried for years, so anything that ends up
 * on paper must point at the live domain — even when NEXT_PUBLIC_SITE_URL is
 * stale or a school admin is still signed in on the old host. Every other
 * origin (localhost, Vercel previews) passes through untouched.
 *
 * Reading is unaffected: scanners ignore the host, so cards already printed
 * with the old domain keep working.
 *
 * Client-safe: no server imports.
 */

export const CANONICAL_SITE_URL = "https://praavyo.com";

const RETIRED_HOSTS = new Set(["pravyo.infobytesnepal.com"]);

/** `origin` with a retired host swapped for the live domain, no trailing slash. */
export function printableOrigin(origin) {
  const value = String(origin || "").replace(/\/+$/, "");
  try {
    if (RETIRED_HOSTS.has(new URL(value).hostname)) return CANONICAL_SITE_URL;
  } catch {
    // Not an absolute URL — leave it as it was.
  }
  return value;
}
