import QRCode from "qrcode";
import jsQR from "jsqr";
import { readTeacherCard, teacherCardTokenUrl, teacherCardUrl } from "@/lib/teacherCard";

/** Render a QR to RGBA pixels the way a photo would reach jsQR. */
function rasterize(text, scale = 6, quiet = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
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

describe("teacher login card", () => {
  it("round-trips the username through a printed QR", () => {
    const { data, size } = rasterize(teacherCardUrl("https://pravyo.example", "sita.shrestha"));
    const found = jsQR(data, size, size, { inversionAttempts: "attemptBoth" });
    expect(readTeacherCard(found.data)).toEqual({ user: "sita.shrestha" });
  });

  it("accepts an email for teachers without a username", () => {
    expect(readTeacherCard(teacherCardUrl("https://x.test", "Ram@School.np"))).toEqual({ user: "ram@school.np" });
  });

  it("round-trips a sign-in card token through a printed QR", () => {
    const token = `${"a".repeat(24)}.${"Zz9_-".repeat(6)}Ab`;
    const { data, size } = rasterize(teacherCardTokenUrl("https://pravyo.example", token));
    const found = jsQR(data, size, size, { inversionAttempts: "attemptBoth" });
    expect(readTeacherCard(found.data)).toEqual({ card: token });
  });

  it("rejects parent cards and unrelated QR codes", () => {
    expect(readTeacherCard("https://x.test/parent/login?id=PRV-P-X7K4Q9")).toBeNull();
    expect(readTeacherCard("https://shop.test/login?user=<script>")).toBeNull();
    expect(readTeacherCard("just some text")).toBeNull();
  });
});
