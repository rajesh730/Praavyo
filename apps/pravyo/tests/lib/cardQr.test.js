import QRCode from "qrcode";
import jsQR from "jsqr";
import { CARD_QR_OPTIONS, cardQrSvg, parentCardUrl } from "@/lib/cardQr";
import { readParentCard } from "@/components/parent/QrCardScanner";

/** Render a QR to RGBA pixels with the card's own quiet zone. */
function rasterize(text, scale = 5) {
  const quiet = CARD_QR_OPTIONS.margin;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: CARD_QR_OPTIONS.errorCorrectionLevel });
  const size = (modules.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (!modules.get(row, col)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = ((row + quiet) * scale + y) * size + (col + quiet) * scale + x;
          data[px * 4] = 0; data[px * 4 + 1] = 0; data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

describe("card QR", () => {
  it("keeps the 4-module quiet zone scanners need", () => {
    expect(CARD_QR_OPTIONS.margin).toBeGreaterThanOrEqual(4);
  });

  it("round-trips a Parent ID through the printed QR", () => {
    const url = parentCardUrl("https://www.praavyo.com", "PRV-P-X7K4Q9");
    expect(url).toBe("https://www.praavyo.com/parent/login?id=PRV-P-X7K4Q9");

    const { data, size } = rasterize(url);
    const found = jsQR(data, size, size, { inversionAttempts: "attemptBoth" });
    expect(readParentCard(found.data)).toEqual({ parentId: "PRV-P-X7K4Q9" });
  });

  it("renders inline SVG", async () => {
    await expect(cardQrSvg("https://x.test")).resolves.toMatch(/^<svg/);
  });
});
