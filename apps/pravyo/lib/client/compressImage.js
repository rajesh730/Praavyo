"use client";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CANVAS_EDGE = 4096;
const MIN_QUALITY = 0.45;
const QUALITY_STEP = 0.08;
const MAX_RESIZE_PASSES = 5;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadImageSource(file) {
  // createImageBitmap is fast and honors camera EXIF orientation. Some older
  // mobile browsers lack it, so keep a browser-native Image fallback instead
  // of making image upload unavailable on those phones.
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("This image could not be read."));
      candidate.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function renderWebP(source, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Image compression is not available in this browser.");
  context.drawImage(source, 0, 0, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

/**
 * Convert a user-selected image to WebP before it reaches the network.
 *
 * `maxBytes` is deliberately a target rather than a post-upload validation:
 * when a photo is too large we lower quality, then dimensions, locally. This
 * avoids wasting a family's data allowance on a request the server will reject.
 */
export async function compressImage(file, options = {}) {
  if (!IMAGE_TYPES.has(file?.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }

  const maxEdge = clamp(Number(options.maxEdge) || 1280, 1, MAX_CANVAS_EDGE);
  const preferredQuality = clamp(Number(options.quality) || 0.72, MIN_QUALITY, 0.92);
  const requestedMaxBytes = Number(options.maxBytes);
  const maxBytes = Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? requestedMaxBytes
    : Number.POSITIVE_INFINITY;
  const { source, width: sourceWidth, height: sourceHeight, cleanup } = await loadImageSource(file);

  if (!sourceWidth || !sourceHeight) {
    cleanup();
    throw new Error("This image has invalid dimensions.");
  }

  let best = null;
  let edge = maxEdge;

  try {
    for (let resizePass = 0; resizePass < MAX_RESIZE_PASSES; resizePass += 1) {
      const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      for (let quality = preferredQuality; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
        const blob = await renderWebP(source, width, height, quality);
        if (!blob) throw new Error("This image could not be compressed.");

        if (!best || blob.size < best.blob.size) {
          best = { blob, width, height };
        }
        if (blob.size <= maxBytes) {
          return {
            file: new File([blob], `${Date.now()}.webp`, { type: "image/webp" }),
            width,
            height,
            originalBytes: file.size,
            compressedBytes: blob.size,
          };
        }
      }

      edge = Math.max(1, Math.floor(edge * 0.8));
    }
  } finally {
    cleanup();
  }

  if (best && best.blob.size <= maxBytes) {
    return {
      file: new File([best.blob], `${Date.now()}.webp`, { type: "image/webp" }),
      width: best.width,
      height: best.height,
      originalBytes: file.size,
      compressedBytes: best.blob.size,
    };
  }

  throw new Error(
    `This image cannot be compressed below ${Math.ceil(maxBytes / 1024)} KB. Choose a simpler or smaller image.`
  );
}
