"use client";

import { useState } from "react";
import { School as FaSchool } from "lucide-react";
import { normalizeImageUrl } from "@/lib/imageUrls";

export default function SchoolLogoMark({
  imageUrl,
  name = "School",
  className = "h-10 w-10",
  iconClassName = "",
  shapeClassName = "rounded-full",
}) {
  const [failedImage, setFailedImage] = useState("");
  const image = normalizeImageUrl(imageUrl);
  const failed = Boolean(image && failedImage === image);
  const initial = String(name || "S").charAt(0).toUpperCase();

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-line bg-surface text-brand-strong ${shapeClassName} ${className}`.trim()}
    >
      {image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          decoding="async"
          className="h-full w-full object-contain p-1"
          onError={() => setFailedImage(image)}
        />
      ) : initial ? (
        <span className="text-sm font-semibold">{initial}</span>
      ) : (
        <FaSchool className={iconClassName} />
      )}
    </span>
  );
}
