import QRCode from "qrcode";

/**
 * QR settings shared by every printed or on-screen login card (Parent Access
 * Card and Teacher Login Card), so they all scan the same way.
 *
 * - Level M survives a fold, a smudge and a mediocre photocopy.
 * - A 4-module quiet zone is what the QR spec asks for. Cards used to ship with
 *   1, which phone cameras and photo decoding often could not lock on to when
 *   the card's border or text sat close to the code.
 *
 * Client-safe: `qrcode` runs in the browser and on the server, offline.
 */
export const CARD_QR_OPTIONS = {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 4,
  width: 240,
  color: { dark: "#000000", light: "#ffffff" },
};

/** The link encoded into a Parent Access Card's QR. */
export function parentCardUrl(siteUrl, parentIdentifier) {
  return `${siteUrl}/parent/login?id=${encodeURIComponent(parentIdentifier)}`;
}

/** Inline SVG markup for a card QR. */
export function cardQrSvg(text) {
  return QRCode.toString(text, CARD_QR_OPTIONS);
}

/**
 * Draw a card as a PNG — heading, a few lines, the QR, and the code in large
 * type — so staff on a phone can send it straight to WhatsApp as a picture.
 * A photo of the screen is blurry; this is sharp and always decodes.
 *
 * Browser only. Resolves to a Blob.
 */
export async function renderCardImage({ heading, title, lines = [], qrText, codeLabel, code, footer }) {
  const width = 720;
  const qrSize = 440;
  const pad = 48;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px Figtree, "Noto Sans Devanagari", system-ui, sans-serif`;

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, qrText, { ...CARD_QR_OPTIONS, type: undefined, width: qrSize });

  const height = pad + 40 + 56 + lines.length * 38 + 24 + qrSize + 32 + 30 + 64 + (footer ? 70 : 0) + pad;
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  let y = pad + 28;
  ctx.font = font(700, 26);
  ctx.fillText(fit(ctx, heading, width - pad * 2), width / 2, y);
  y += 56;
  ctx.font = font(700, 36);
  ctx.fillText(fit(ctx, title, width - pad * 2), width / 2, y);
  ctx.font = font(400, 26);
  for (const line of lines) {
    y += 38;
    ctx.fillText(fit(ctx, line, width - pad * 2), width / 2, y);
  }
  y += 24;
  ctx.drawImage(qrCanvas, (width - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 32;
  ctx.font = font(600, 22);
  ctx.fillText(codeLabel, width / 2, y);
  y += 56;
  ctx.font = `700 46px "JetBrains Mono", Consolas, monospace`;
  ctx.fillText(fit(ctx, code, width - pad * 2), width / 2, y);
  if (footer) {
    y += 60;
    ctx.font = font(400, 20);
    ctx.fillText(fit(ctx, footer, width - pad * 2), width / 2, y);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image failed"))), "image/png")
  );
}

/** Trim text with an ellipsis so it fits `maxWidth` on one line. */
function fit(ctx, text, maxWidth) {
  let value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

/**
 * Hand a card image to the phone's share sheet (WhatsApp, Viber, ...), or
 * download it where file sharing is not supported (most desktops).
 * Returns "shared", "downloaded" or "cancelled".
 */
export async function shareOrDownloadImage(blob, filename, title) {
  const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Some Android WebViews advertise file sharing and then refuse it.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
