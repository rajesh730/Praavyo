"use client";

import { useRef, useState } from "react";
import { Image as FaImage, LoaderCircle as FaSpinner, X as FaTimes } from "lucide-react";
import { compressImage } from "@/lib/client/compressImage";

const MAX_BYTES_BY_PURPOSE = {
  SCHOOL_LOGO: 800_000,
  SCHOOL_COVER: 1_500_000,
  REPORT_CARD_IMAGE: 800_000,
  WRITING_IMAGE: 1_200_000,
};

export default function ImageUploadField({
  purpose,
  value,
  onChange,
  label = "Upload image",
  maxEdge = 1280,
  quality = 0.72,
  maxBytes = MAX_BYTES_BY_PURPOSE[purpose],
  allowRemove = true,
  className = "",
  hint = "The original is not uploaded. A smaller WebP copy is created first.",
  buttonClassName = "btn btn-soft mt-2 inline-flex items-center justify-center gap-2",
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (event) => {
    const original = event.target.files?.[0];
    event.target.value = "";
    if (!original) return;

    try {
      setUploading(true);
      setError("");
      const compressed = await compressImage(original, { maxEdge, quality, maxBytes });
      const form = new FormData();
      form.append("file", compressed.file);
      form.append("purpose", purpose);
      form.append("width", String(compressed.width));
      form.append("height", String(compressed.height));
      form.append("originalName", original.name);

      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });
      const responseText = await response.text();
      let json = null;
      try {
        json = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Proxies can replace an upstream 5xx response with an HTML error page.
      }
      if (!response.ok) {
        throw new Error(
          json?.message ||
            (response.status === 502 || response.status === 504
              ? "Storage did not respond in time. Check the R2 S3 endpoint and credentials."
              : `Image upload failed (${response.status}).`)
        );
      }
      if (!json?.data?.asset) {
        throw new Error("The upload completed without a valid media record.");
      }
      onChange(json.data.asset);
    } catch (uploadError) {
      setError(uploadError.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      {value?.url ? (
        <div className="card relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.url} alt="Upload preview" className="h-40 w-full object-cover" />
          {allowRemove ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="btn-icon btn-ghost absolute right-2 top-2 flex items-center justify-center"
              aria-label="Remove image"
            >
              <FaTimes />
            </button>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={upload}
        className="sr-only"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={buttonClassName}
      >
        {uploading ? <FaSpinner className="animate-spin" /> : <FaImage />}
        {uploading ? "Compressing and uploading..." : label}
      </button>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
