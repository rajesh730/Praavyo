import { compressImage } from "@/lib/client/compressImage";

const originalCreateImageBitmap = global.createImageBitmap;
const originalDocument = global.document;
const originalFile = global.File;

afterEach(() => {
  if (originalCreateImageBitmap === undefined) delete global.createImageBitmap;
  else global.createImageBitmap = originalCreateImageBitmap;

  if (originalDocument === undefined) delete global.document;
  else global.document = originalDocument;

  if (originalFile === undefined) delete global.File;
  else global.File = originalFile;
});

describe("compressImage", () => {
  it("rejects unsupported files before trying to decode them", async () => {
    await expect(
      compressImage({ type: "image/gif", size: 100 }, { maxBytes: 80 })
    ).rejects.toThrow("Choose a JPG, PNG, or WebP image.");
  });

  it("retries at lower quality until the output fits the upload limit", async () => {
    const close = jest.fn();
    global.createImageBitmap = jest.fn().mockResolvedValue({
      width: 2000,
      height: 1000,
      close,
    });
    global.document = {
      createElement: jest.fn(() => ({
        getContext: () => ({ drawImage: jest.fn() }),
        toBlob: (callback, _type, quality) =>
          callback({ size: quality > 0.75 ? 120 : 90 }),
      })),
    };
    global.File = class TestFile {
      constructor(parts, name, options) {
        this.name = name;
        this.type = options.type;
        this.size = parts.reduce((sum, part) => sum + Number(part.size || 0), 0);
      }
    };

    const compressed = await compressImage(
      { type: "image/jpeg", size: 3_000_000 },
      { maxEdge: 1000, quality: 0.8, maxBytes: 100 }
    );

    expect(compressed).toMatchObject({
      width: 1000,
      height: 500,
      originalBytes: 3_000_000,
      compressedBytes: 90,
    });
    expect(compressed.file.type).toBe("image/webp");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
