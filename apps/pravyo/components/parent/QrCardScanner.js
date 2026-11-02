"use client";

import { useState } from "react";
import jsQR from "jsqr";
import { Camera, Image as FaImage } from "lucide-react";

/**
 * Read a Pravyo card's QR code (Parent Access Card or Teacher Login Card)
 * from a photo of the card.
 *
 * Two buttons, because phones disagree about what a plain file picker offers:
 * newer Android photo pickers show only the gallery, so "Take a photo" opens
 * the camera directly (`capture`), and "Choose a photo" covers a card that
 * arrived over WhatsApp. (Live in-page camera scanning was removed on purpose.)
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
  label = "Choose a photo of my card",
  cameraLabel = "Take a photo of my card",
  fallbackHint = "type your Parent ID instead",
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  /** Decode a still photo of the card. */
  const handleFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    setError("");
    setReading(true);

    try {
      const image = await loadImage(file);
      const text = await decodeQr(image);
      image.close?.();

      if (text) {
        onDetected(text);
        return;
      }

      setError(
        `Could not read the code in that picture. Hold the phone closer so the code fills most of the photo, in good light, or ${fallbackHint}.`
      );
    } catch {
      setError(
        `Could not open that picture. Try taking a new photo, or ${fallbackHint}.`
      );
    } finally {
      setReading(false);
      // Allow re-picking the same file after a failed attempt.
      input.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <PickButton
        icon={Camera}
        label={reading ? "Reading the code…" : cameraLabel}
        capture="environment"
        primary
        disabled={reading}
        onChange={handleFile}
      />
      <PickButton
        icon={FaImage}
        label={label}
        disabled={reading}
        onChange={handleFile}
      />

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

function PickButton({ icon: Icon, label, capture, primary, disabled, onChange }) {
  return (
    <label
      className={`btn ${primary ? "btn-primary" : "btn-secondary"} flex w-full cursor-pointer items-center justify-center gap-3 ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
      <input
        type="file"
        accept="image/*"
        capture={capture}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
    </label>
  );
}

/**
 * Open a picture as something drawable. `createImageBitmap` is fastest, but
 * Safari before 15 cannot take a Blob, so fall back to an <img>.
 */
async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await (img.decode ? img.decode() : new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    }));
    return img;
  } finally {
    // The decoded pixels stay usable after the URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Find a QR in a photo, cheapest attempt first.
 *
 * A single pass at one size failed often in practice: a card photographed from
 * arm's length leaves the code too small once the photo is shrunk, while a
 * full 12-megapixel pass stalls a low-end phone. So try a small size, then
 * larger ones, then the middle of the photo enlarged — and stop at the first
 * hit, which is usually the first pass.
 */
async function decodeQr(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const attempts = [
    { edge: 1000, crop: 1 },
    { edge: 1600, crop: 1 },
    { edge: 1400, crop: 0.6 },
    { edge: 2400, crop: 1 },
  ];

  for (const { edge, crop } of attempts) {
    const sw = width * crop;
    const sh = height * crop;
    const scale = Math.min(1, edge / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    context.drawImage(image, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    // A photographed or photocopied card is often inverted or low-contrast,
    // and a still frame can afford the extra pass.
    const found = jsQR(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: "attemptBoth",
    });
    if (found?.data) return found.data;

    // Let "Reading the code…" paint between passes on a slow phone.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return null;
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
