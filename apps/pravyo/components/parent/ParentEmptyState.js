"use client";

import { useParentApp } from "./ParentAppContext";
import Glyph from "@/components/ui/Glyph";

/**
 * Friendly empty states (§31).
 *
 * "Never show empty tables." An empty section in a parent app is usually GOOD
 * news — nothing needs your attention — so the default tone here is reassurance
 * ("✓ Everything is up to date"), not apology or absence.
 *
 * Where the emptiness is about the child's future rather than the parent's
 * inbox, the copy is forward-looking: "Aayush's achievements will appear here
 * as their journey grows" reads very differently from "No achievements", which
 * a parent can easily hear as a judgement.
 */
export default function ParentEmptyState({
  emoji = "✓",
  title,
  message,
  action = null,
  tone = "positive",
}) {
  const { simpleMode } = useParentApp();

  const toneClasses =
    tone === "positive"
      ? "border-success-line bg-success-soft"
      : "border-line bg-surface";

  return (
    <div
      className={[
        "card flex flex-col items-center px-6 py-7 text-center",
        toneClasses,
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={simpleMode ? "text-2xl" : "text-2xl"}
      >
        <Glyph emoji={emoji} />
      </span>
      {title ? (
        <p
          className={[
            "mt-3 font-semibold text-ink",
            simpleMode ? "text-lg" : "text-base",
          ].join(" ")}
        >
          {title}
        </p>
      ) : null}
      {message ? (
        <p
          className={[
            "mt-1 max-w-sm leading-relaxed text-muted",
            simpleMode ? "text-base" : "text-sm",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
