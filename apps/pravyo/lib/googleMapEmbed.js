// School location map (Settings > Contact & Location, shown on /schools/[id]).
//
// A school pastes what Google Maps gives under Share > "Embed a map": either
// the whole <iframe ...> code or just its link. Only the checked link is ever
// stored or rendered — never the pasted HTML — and only Google's embed
// endpoint is accepted, so nothing else can be framed on a public page.
// Runs in the browser (live preview) and on the server (the save is checked
// again there).

export const MAP_EMBED_MAX_LENGTH = 2000;

const ALLOWED_HOSTS = new Set(["www.google.com", "google.com"]);

export const MAP_EMBED_HELP =
  'In Google Maps, find the school, click Share > "Embed a map" > Copy HTML, and paste it here.';

function extractSrc(input) {
  const iframeSrc = input.match(/<iframe[^>]*\ssrc\s*=\s*(["'])(.*?)\1/i);
  const raw = iframeSrc ? iframeSrc[2] : input;
  // Copied HTML escapes "&" in attribute values.
  return raw.replace(/&amp;/gi, "&").trim();
}

/**
 * Turn pasted embed code or a link into a safe Google Maps embed URL.
 * Returns { url } (url is "" when the input is empty) or { error }.
 */
export function parseGoogleMapEmbed(input) {
  const text = String(input ?? "").trim();
  if (!text) return { url: "" };

  const src = extractSrc(text);
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(src)) {
    return {
      error: `Short share links can't be shown as a map. ${MAP_EMBED_HELP}`,
    };
  }

  let url;
  try {
    url = new URL(src);
  } catch {
    return { error: `That is not a Google Maps embed. ${MAP_EMBED_HELP}` };
  }

  if (
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    !/^\/maps\/embed(\/|$)/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return { error: `That is not a Google Maps embed. ${MAP_EMBED_HELP}` };
  }

  url.hostname = "www.google.com";
  url.hash = "";
  const clean = url.toString();
  if (clean.length > MAP_EMBED_MAX_LENGTH) {
    return { error: "That map link is too long. Copy the embed code from Google Maps again." };
  }
  return { url: clean };
}

/** The pinned point in a Share > "Embed a map" link, when it has one. */
export function getMapEmbedCoordinates(embedUrl) {
  const match = String(embedUrl || "").match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A Google Maps directions link for the public page's button. */
export function getMapDirectionsUrl(embedUrl, fallbackQuery = "") {
  const point = getMapEmbedCoordinates(embedUrl);
  if (point) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
  }
  const query = String(fallbackQuery || "").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}
