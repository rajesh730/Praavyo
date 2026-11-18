"use client";

import { MapPin, Trash2 } from "lucide-react";
import { MAP_EMBED_HELP, parseGoogleMapEmbed } from "@/lib/googleMapEmbed";

// Settings > Contact & Location: the school's Google Maps location. Shows a
// live preview of exactly what the public school page will show.
export default function SchoolMapField({ value, onChange }) {
  const { url, error } = parseGoogleMapEmbed(value);

  return (
    <div>
      <label
        htmlFor="school-map-embed"
        className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"
      >
        <MapPin className="h-4 w-4 text-brand" aria-hidden />
        School location map
      </label>
      <textarea
        id="school-map-embed"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder='<iframe src="https://www.google.com/maps/embed?pb=..." ...></iframe>'
        className="input w-full font-mono text-xs"
        aria-describedby="school-map-embed-help"
        spellCheck={false}
      />
      <p id="school-map-embed-help" className="mt-2 text-xs text-muted">
        {MAP_EMBED_HELP} The map is shown on your public school page.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {url && (
        <div className="mt-3 space-y-2">
          <div className="overflow-hidden rounded-card border border-line-strong">
            <iframe
              src={url}
              title="School location map preview"
              className="block h-64 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="btn btn-soft-danger btn-sm inline-flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Remove map
          </button>
        </div>
      )}
    </div>
  );
}
