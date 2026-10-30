"use client";

import { PenTool as FaPenNib } from "lucide-react";
import WritingContent from "@/components/WritingContent";
import { WritingCover, WritingGallery, WritingTags } from "@/components/WritingMedia";
import {
  getCategoryMeta,
  MagazineArticleMeta,
} from "@/components/student/MagazineArticleCard";

function MagazineArt({ category }) {
  const meta = getCategoryMeta(category);
  const Icon = meta.icon;

  return (
    <div className="card surface-brand relative min-h-72 overflow-hidden p-6">
      <div className="card absolute left-10 top-10 h-32 w-44 rotate-[-8deg] shadow-pop" />
      <div className="card absolute left-32 top-16 h-32 w-44 rotate-[8deg] shadow-pop" />
      <div className="absolute bottom-12 right-16 h-1.5 w-48 rotate-[-18deg] rounded-full bg-surface" />
      <div className="absolute bottom-20 right-24 h-1.5 w-32 rotate-[-18deg] rounded-full bg-surface" />
      <Icon className="absolute right-10 top-10 text-2xl text-white" />
      <FaPenNib className="absolute bottom-12 left-12 text-2xl text-white" />
      <span className="absolute bottom-8 right-8 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-card">
        {meta.label}
      </span>
    </div>
  );
}

export default function MagazineArticleDetail({ article, student = null }) {
  const meta = getCategoryMeta(article.category);

  return (
    <article className="card overflow-hidden shadow-pop">
      <div className="grid gap-4 p-5 md:p-6 xl:grid-cols-[1fr_0.72fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`badge badge-neutral inline-flex text-xs ${meta.chip}`}
            >
              {meta.label}
            </span>
          </div>

          <h1 className="mt-5 max-w-4xl font-semibold leading-tight text-ink md:text-2xl">
            {article.title}
          </h1>
          <MagazineArticleMeta
            article={article}
            showIssue
            className="mt-4 gap-4 text-sm font-normal"
          />
          {student && (
            <p className="mt-3 text-sm text-muted sm:block">
              Reading as {student.name} - {student.grade} - Roll{" "}
              {student.rollNumber || "-"}
            </p>
          )}
        </div>

        <div className="sm:block">
          {article.coverImage?.url || article.images?.some((image) => image?.url) ? (
            <WritingCover
              coverImage={article.coverImage}
              images={article.images}
              title={article.title}
              className="aspect-[16/9] min-h-72"
            />
          ) : (
            <MagazineArt category={article.category} />
          )}
        </div>
      </div>

      <div className="border-t border-line-strong bg-surface px-5 py-6 md:px-6">
        <WritingTags tags={article.tags} className="mx-auto mb-4 max-w-3xl" />
        <WritingContent
          content={article.content}
          className="mx-auto max-w-3xl text-base leading-7 text-ink md:text-lg"
        />
        {false && article.images?.length ? (
          <div className="mx-auto mt-5 grid max-w-4xl gap-4 sm:grid-cols-2">
            {article.images.map((image, index) => (
              <figure key={image.asset || image.url || index}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.altText || `Article photo ${index + 1}`}
                  className="w-full rounded-card object-cover"
                  loading="lazy"
                />
                {image.caption ? (
                  <figcaption className="mt-2 text-sm text-muted">
                    {image.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        ) : null}
        <WritingGallery
          images={article.images}
          coverImage={article.coverImage}
          title={article.title}
          className="mx-auto mt-5 max-w-4xl"
        />
      </div>
    </article>
  );
}
