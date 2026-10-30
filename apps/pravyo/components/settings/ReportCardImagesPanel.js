"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Image as FaImage } from "lucide-react";
import { normalizeImageUrl } from "@/lib/imageUrls";
import ImageUploadField from "@/components/media/ImageUploadField";

/**
 * The two images on a report card header. The left is the school logo, which
 * is managed with the school's public profile; the right is optional and is
 * set here. Each saves as soon as it changes, apart from the settings form.
 */
export default function ReportCardImagesPanel({ logoUrl = "", imageUrl = "" }) {
  const [current, setCurrent] = useState(imageUrl);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => setCurrent(imageUrl), [imageUrl]);

  const save = async (asset) => {
    const previous = current;
    const next = asset?.url || "";
    setCurrent(next);
    setSaving(true);
    setStatus({ type: "", text: "" });
    try {
      const response = await fetch("/api/school/settings/report-card-image", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportCardImageUrl: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to update the report card image.");
      setCurrent(data.data?.reportCardImageUrl || "");
      setStatus({ type: "success", text: next ? "Report card image saved." : "Report card image removed." });
    } catch (error) {
      setCurrent(previous);
      setStatus({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const logo = normalizeImageUrl(logoUrl);

  return (
    <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink">
        <FaImage className="text-brand" />
        Report card images
      </h2>
      <p className="mb-5 text-sm text-muted">
        Shown at the top of every CAS report card, including ones already published.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Left: school logo</p>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="School logo" className="h-20 w-20 rounded-card border border-line object-contain p-1" />
          ) : (
            <p className="text-sm text-muted">No logo yet. The school&apos;s first letter is shown instead.</p>
          )}
          <p className="mt-2 text-xs text-muted">
            Change it under{" "}
            <Link href="/school/dashboard?tab=showcase" className="font-semibold text-brand hover:underline">
              Showcase profile
            </Link>
            .
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Right: optional image</p>
          <ImageUploadField
            purpose="REPORT_CARD_IMAGE"
            value={current ? { url: current } : null}
            onChange={save}
            label={current ? "Replace image" : "Upload image"}
            maxEdge={512}
            quality={0.8}
          />
          <p className="mt-2 text-xs text-muted">
            {saving ? "Saving..." : "Leave empty to keep the right side of the card blank."}
          </p>
        </div>
      </div>
      {status.text && (
        <p role={status.type === "error" ? "alert" : "status"} className={`mt-4 text-sm font-semibold ${status.type === "error" ? "text-danger" : "text-success"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
