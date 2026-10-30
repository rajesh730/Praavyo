"use client";

import Link from "next/link";
import { BookOpen as FaBookOpen, CalendarDays as FaCalendarAlt, Clock as FaClock, Feather as FaFeatherAlt, GraduationCap as FaGraduationCap, Layers as FaLayerGroup, PenTool as FaPenNib, Star as FaStar, User as FaUser } from "lucide-react";
import { WritingPreview } from "@/components/WritingContent";
import { WritingCover, WritingTags } from "@/components/WritingMedia";
import AppDate from "@/components/common/AppDate";
import { normalizeWritingCategory } from "@/lib/writingCategories";
import { formatAuthoredEra } from "@/lib/writingProvenance";

const CATEGORY_META = {
  BLOG_ARTICLE: {
    label: "Blog Article",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    icon: FaBookOpen,
  },
  POEM: {
    label: "Poem",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    icon: FaFeatherAlt,
  },
  RESEARCH: {
    label: "Research",
    chip: "border-success-line bg-success-soft text-success",
    icon: FaLayerGroup,
  },
  OPINION: {
    label: "Opinion",
    chip: "border-warning-line bg-warning-soft text-warning",
    icon: FaStar,
  },
  CREATIVE_WRITING: {
    label: "Creative Writing",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    icon: FaPenNib,
  },
};

export function getCategoryMeta(value) {
  return CATEGORY_META[normalizeWritingCategory(value)] || CATEGORY_META.BLOG_ARTICLE;
}

export function formatMagazineDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getReadTime(content = "") {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export function MagazineArticleMeta({
  article,
  className = "",
  showIssue = false,
}) {
  const authoredEra = formatAuthoredEra(article);

  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs font-semibold text-muted ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <FaUser />
        {article.authorStudent?.name || "Student"}
      </span>
      {authoredEra && (
        <span className="inline-flex items-center gap-1.5">
          <FaGraduationCap />
          {authoredEra}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <FaCalendarAlt />
        <AppDate value={article.publishedAt} />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FaClock />
        {getReadTime(article.content)} min read
      </span>
      {showIssue && article.magazineIssue?.title && (
        <span className="inline-flex items-center gap-1.5">
          <FaBookOpen />
          {article.magazineIssue.title}
        </span>
      )}
    </div>
  );
}

export default function MagazineArticleCard({
  article,
  index,
  href,
  compact = false,
}) {
  const meta = getCategoryMeta(article.category);

  return (
    <Link
      href={href}
      className={`group rounded-card border border-line-strong bg-surface text-left shadow-card transition-colors hover:border-brand-line hover:bg-surface hover:shadow-pop ${
        compact ? "p-4" : "p-4"
      }`}
    >
      <WritingCover
        coverImage={article.coverImage}
        images={article.images}
        title={article.title}
        className="mb-4 aspect-[16/9]"
      />
      <div className="flex items-start justify-between gap-3">
        <span className={`badge badge-neutral inline-flex ${meta.chip}`}>
          {meta.label}
        </span>
        {Number.isInteger(index) && (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
            {index + 1}
          </span>
        )}
      </div>
      <h3 className={`${compact ? "mt-3" : "mt-4"} line-clamp-2 font-semibold leading-snug text-ink group-hover:text-brand-strong`}>
        {article.title}
      </h3>
      <WritingPreview
        content={article.content}
        maxLength={compact ? 120 : 240}
        className={`${compact ? "line-clamp-3" : "line-clamp-5"} mt-3 text-sm leading-5 text-muted`}
      />
      <WritingTags tags={article.tags} className="mt-3" />
      <MagazineArticleMeta article={article} className="mt-3" />
      <span className="mt-5 inline-flex text-sm font-semibold text-brand-strong">
        Read full writing
      </span>
    </Link>
  );
}
