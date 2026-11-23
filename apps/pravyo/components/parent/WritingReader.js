"use client";

import { useEffect, useState } from "react";
import { X as FaTimes } from "lucide-react";
import { useParentApp, useParentFetch } from "./ParentAppContext";
import { formatParentDate } from "@/lib/parentFormat";
import { WritingCover, WritingGallery, WritingTags } from "@/components/WritingMedia";
import WritingContent from "@/components/WritingContent";

/**
 * Full-screen reader for one piece of the child's writing (§6, §7).
 *
 * The full text is fetched only when the parent opens it — the portfolio list
 * carries previews only, so a child with forty articles does not download forty
 * bodies to scroll a list (§22).
 */
export default function WritingReader({ writingId, onClose }) {
  const { t, preferences } = useParentApp();
  const parentFetch = useParentFetch();
  const [state, setState] = useState({ loading: true, error: "", writing: null });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await parentFetch(`/api/parent/writings/${writingId}`);
        if (active) {
          setState({ loading: false, error: "", writing: data.writing });
        }
      } catch (err) {
        if (active) {
          setState({ loading: false, error: err.message, writing: null });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [parentFetch, writingId]);

  // Lock background scroll while the reader is open, and close on Escape.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const writing = state.writing;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={writing?.title || t("child.writing")}
      className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="btn-icon btn-ghost flex items-center justify-center"
        >
          <FaTimes aria-hidden="true" className="h-5 w-5" />
        </button>
        <p className="flex-1 truncate text-sm font-semibold text-muted">
          {t("child.writing")}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-5">
        {state.loading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-7 w-3/4 animate-pulse rounded-control bg-line" />
            <div className="h-4 animate-pulse rounded-control bg-surface-2" />
            <div className="h-4 animate-pulse rounded-control bg-surface-2" />
            <div className="h-4 w-5/6 animate-pulse rounded-control bg-surface-2" />
          </div>
        ) : state.error ? (
          <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        ) : (
          <article className="mx-auto max-w-2xl">
            <h1 className="break-words font-semibold leading-snug text-ink">
              {writing.title}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {formatParentDate(writing.date, {
                calendar: preferences.calendarPreference,
                relative: false,
              })}
            </p>

            {writing.magazineSelected ? (
              <p className="badge badge-brand mt-3 inline-flex text-xs font-semibold">
                {writing.magazinePublished
                  ? t("child.magazinePublished")
                  : t("child.magazineSelected")}
                {writing.magazineIssue?.title
                  ? ` · ${writing.magazineIssue.title}`
                  : ""}
              </p>
            ) : null}

            {writing.reviewNote ? (
              <div className="mt-3 rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">
                <p className="font-semibold">{t("child.teacherNote")}</p>
                <p className="mt-1 whitespace-pre-wrap">{writing.reviewNote}</p>
              </div>
            ) : null}

            <WritingCover coverImage={writing.coverImage} images={writing.images} title={writing.title} className="mt-5 aspect-[16/9] max-h-[32rem]" />
            <WritingTags tags={writing.tags} className="mt-4" />
            {/* Bold, italic and links as the child wrote them; rendered as React, never as HTML. */}
            <WritingContent content={stripHtml(writing.content)} className="mt-5 break-words leading-[1.75] text-ink" />

            {false && writing.images?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {writing.images.map((image, index) => (
                  <figure key={image.asset || image.url || index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.altText || `Writing photo ${index + 1}`}
                      className="w-full rounded-card object-cover"
                      loading="lazy"
                    />
                    {image.caption ? (
                      <figcaption className="mt-1 text-sm text-muted">
                        {image.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : null}
            <WritingGallery
              images={writing.images}
              coverImage={writing.coverImage}
              title={writing.title}
              className="mt-4"
            />
          </article>
        )}
      </div>
    </div>
  );
}

/**
 * Render stored content as plain text.
 *
 * Deliberately NOT dangerouslySetInnerHTML: this content is authored by
 * students and reviewed by teachers, but it is still user input, and injecting
 * it as markup into the parent app would be an XSS vector for the price of some
 * formatting.
 */
function stripHtml(value) {
  return String(value || "")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
