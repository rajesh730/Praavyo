"use client";

import { useState } from "react";
import jsQR from "jsqr";
import { Image as FaImage } from "lucide-react";

/**
 * Read a Pravyo card's QR code (Parent Access Card or Teacher Login Card)
 * from a photo of the card.
 *
 * Photo upload covers what actually happens for this audience: the card was
 * photographed and sent over WhatsApp, or the guardian snaps it with the
 * phone's own camera. (Live in-page camera scanning was removed on purpose.)
 *
 * Decoding uses jsQR (MIT, no dependencies) rather than the native
 * `BarcodeDetector`, which is absent on iOS Safari and on older Android
 * WebViews — precisely the devices this has to work on.
 *
 * Nothing is uploaded. The picture is decoded on-device and discarded; only
 * the credential inside the QR is ever sent, and only when the guardian
 * continues.
 */
export default function QrCardScanner({
  onDetected,
  label = "Upload a photo of my card",
  fallbackHint = "type your Parent ID instead",
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  /** Decode a still photo of the card. */
  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setReading(true);

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");

      // Cap the working size. A 12-megapixel phone photo decoded at full
      // resolution can stall a low-end device for several seconds.
      const MAX_EDGE = 1400;
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      // A photographed or photocopied card is often inverted or low-contrast,
      // and a still frame can afford the extra pass.
      const found = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      });

      if (found?.data) {
        onDetected(found.data);
        return;
      }

      setError(
        `Could not read the code in that picture. Try a clearer photo, or ${fallbackHint}.`
      );
    } catch {
      setError("Could not open that picture. Please try another one.");
    } finally {
      setReading(false);
      // Allow re-picking the same file after a failed attempt.
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <label className="btn btn-secondary flex w-full cursor-pointer items-center justify-center gap-3">
        <FaImage aria-hidden="true" className="h-5 w-5" />
        {reading ? "Reading…" : label}
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={reading}
          className="sr-only"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-card bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Pull the activation token out of whatever the QR contained.
 *
 * Cards printed under the OLD activation flow encode a full
 * `/parent/activate?t=…` URL. Those are still in circulation and still work, so
 * this stays. New cards carry the Parent ID instead — see `readParentCard`.
 */
export function extractActivationToken(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    const token = url.searchParams.get("t");
    if (token) return token;
  } catch {
    // Not a URL — fall through and treat it as a bare token.
  }

  // A bare token: base64url, and long enough to be one of ours.
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value;

  return null;
}

// The Parent ID alphabet, duplicated from lib/parentIdentity.js on purpose:
// that module imports node:crypto and cannot be pulled into a client bundle.
// Only the shape is repeated here — the server still normalises and validates.
const PARENT_ID_BODY = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * Read a scanned Parent Access Card into something the sign-in form can use.
 *
 * Two card generations have to be understood, because both are in school bags
 * right now:
 *
 *   - **Current** — `/parent/login?id=PRV-P-X7K4Q9`. The Parent ID is the
 *     credential, so the QR is simply a way of typing it without typing.
 *   - **Legacy**  — `/parent/activate?t=<32-byte token>`. Resolves to the same
 *     guardian server-side.
 *
 * Returns `{ parentId }`, `{ token }`, or null for a QR that is not ours —
 * a supermarket loyalty card must not be posted to the sign-in endpoint.
 */
export function readParentCard(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  let candidate = value;

  try {
    const url = new URL(value);
    const id = url.searchParams.get("id");
    if (id) candidate = id;
    const token = url.searchParams.get("t");
    if (token) return { token };
  } catch {
    // Not a URL — treat the whole string as the credential.
  }

  const compact = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("PRVP") ? compact.slice(4) : compact;
  if (PARENT_ID_BODY.test(body)) return { parentId: `PRV-P-${body}` };

  const token = extractActivationToken(value);
  return token ? { token } : null;
}
