"use client";

import { useMemo, useState } from "react";

function wordsFromText(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

export default function ExpandableStoryText({ text, limit = 70 }) {
  const [expanded, setExpanded] = useState(false);
  const words = useMemo(() => wordsFromText(text), [text]);
  const canExpand = words.length > limit;
  const visibleText =
    canExpand && !expanded ? `${words.slice(0, limit).join(" ")}...` : text;

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-7 text-muted">
        {visibleText}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-sm font-semibold text-brand-strong transition-colors hover:text-brand-strong"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
