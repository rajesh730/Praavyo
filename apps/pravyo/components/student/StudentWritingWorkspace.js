"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft as FaArrowLeft, ArrowRight as FaArrowRight, BookOpen as FaBookOpen, CalendarDays as FaCalendarAlt, CircleCheck as FaCheckCircle, Clock as FaClock, Cloud as FaCloud, SquarePen as FaEdit, EllipsisVertical as FaEllipsisV, Eye as FaEye, Feather as FaFeatherAlt, FileText as FaFileAlt, Earth as FaGlobeAsia, Heart as FaHeart, House as FaHome, Image as FaImage, Layers as FaLayerGroup, Lightbulb as FaLightbulb, Lock as FaLock, Send as FaPaperPlane, PenTool as FaPenNib, Plus as FaPlus, File as FaRegFileAlt, School as FaSchool, Star as FaStar, Tags as FaTags, X as FaTimes, Trash2 as FaTrash, Trophy as FaTrophy } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import AppDate from "@/components/common/AppDate";
import Modal from "@/components/Modal";
import StudentQuickNav from "@/components/student/StudentQuickNav";
import ImageUploadField from "@/components/media/ImageUploadField";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LoadingState from "@/components/ui/LoadingState";
import WritingContent from "@/components/WritingContent";
import {
  getWritingBodyImages,
  getWritingLeadImage,
} from "@/components/WritingMedia";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import {
  WRITING_CATEGORIES,
  normalizeWritingCategory,
} from "@/lib/writingCategories";

const MAX_WRITING_CHARACTERS = 50000;

const CATEGORY_META = {
  BLOG_ARTICLE: {
    label: "Blog Article",
    icon: FaBookOpen,
    accent: "text-brand-strong",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    art: "",
  },
  POEM: {
    label: "Poem",
    icon: FaFeatherAlt,
    accent: "text-brand-strong",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    art: "",
  },
  RESEARCH: {
    label: "Research",
    icon: FaLayerGroup,
    accent: "text-success",
    chip: "border-success-line bg-success-soft text-success",
    art: "",
  },
  OPINION: {
    label: "Opinion",
    icon: FaStar,
    accent: "text-warning",
    chip: "border-warning-line bg-warning-soft text-warning",
    art: "",
  },
  CREATIVE_WRITING: {
    label: "Creative Writing",
    icon: FaPenNib,
    accent: "text-brand-strong",
    chip: "border-brand-line bg-brand-soft text-brand-strong",
    art: "",
  },
};

const STATUS_META = {
  DRAFT: {
    label: "Draft",
    chip: "border-line bg-surface text-muted",
    dot: "bg-subtle",
    icon: FaRegFileAlt,
  },
  SUBMITTED: {
    label: "Posted to School",
    chip: "border-warning-line bg-warning-soft text-warning",
    dot: "bg-warning",
    icon: FaPaperPlane,
  },
  APPROVED: {
    label: "Selected",
    chip: "border-success-line bg-success-soft text-success",
    dot: "bg-success",
    icon: FaCheckCircle,
  },
  REJECTED: {
    label: "Returned",
    chip: "border-danger-line bg-danger-soft text-danger",
    dot: "bg-danger",
    icon: FaEdit,
  },
};

const LIBRARY_FILTERS = [
  ["ALL", "All Writing"],
  ["FREE", "Free Writing"],
  ["SCHOOL", "School Writing"],
  ["MAGAZINE", "School Magazine"],
];

const CATEGORY_OPTIONS = WRITING_CATEGORIES;

function normalizeCategory(value) {
  return normalizeWritingCategory(value);
}

function getCategoryMeta(value) {
  return CATEGORY_META[normalizeCategory(value)];
}

function getStatusMeta(value) {
  return STATUS_META[String(value || "DRAFT").toUpperCase()] || STATUS_META.DRAFT;
}

function getLibraryBucket(writing) {
  if (writing.isMagazinePublished && writing.magazineIssue) return "MAGAZINE";
  if (
    writing.submissionSource === "FREE_WRITE" &&
    String(writing.status || "DRAFT").toUpperCase() === "DRAFT"
  ) {
    return "FREE";
  }
  return "SCHOOL";
}

function getLibraryMeta(writing) {
  const bucket = getLibraryBucket(writing);
  const meta = {
    FREE: {
      label: "Free Writing",
      icon: FaPenNib,
      chip: "border-danger-line bg-danger-soft text-danger",
    },
    SCHOOL: {
      label: "School Writing",
      icon: FaSchool,
      chip: "border-brand-line bg-brand-soft text-brand-strong",
    },
    MAGAZINE: {
      label: "School Magazine",
      icon: FaBookOpen,
      chip: "border-success-line bg-success-soft text-success",
    },
  };
  return meta[bucket];
}

function getWorkflowMessage(writing) {
  const bucket = getLibraryBucket(writing);
  const status = String(writing.status || "DRAFT").toUpperCase();

  if (writing.isTransferredOut) {
    return `Written at ${writing.schoolName || "your previous school"}. It stays in your portfolio — you can edit, hide, or delete it anytime.`;
  }

  if (writing.isMagazinePublished && !writing.magazineIssue) {
    return "Selected writing with an old magazine placement. Make it private or withdraw from magazine to clean it up.";
  }

  if (bucket === "MAGAZINE") {
    return "Published in your school magazine and visible to students from your school.";
  }

  if (status === "DRAFT") {
    return "Private writing. Keep editing, then post it to your school when it is ready.";
  }

  if (status === "SUBMITTED") {
    return "Posted to your school. Your school can keep it on the school wall or select it for the magazine/homepage.";
  }

  if (status === "APPROVED") {
    return "Selected by your school for the magazine or homepage.";
  }

  if (status === "REJECTED") {
    return "Private writing. Keep editing, then post it to school when it is ready.";
  }

  return "Writing is saved in your library.";
}

function isLockedPublishedWriting(writing) {
  return Boolean(
    writing?.isMagazinePublished ||
      writing?.isPublished ||
      writing?.isGlobalWallPublished
  );
}

function canEditWriting(writing) {
  // A piece from a school she has left is portfolio-owned — always editable.
  if (writing?.isTransferredOut) return true;
  return !isLockedPublishedWriting(writing);
}

function getDeleteMessage(writing) {
  if (!writing) return "";
  const publicSurfaces = [
    writing.isPublished ? "homepage" : "",
    writing.isMagazinePublished ? "school magazine" : "",
    writing.isGlobalWallPublished ? "global wall" : "",
    writing.showOnSchoolWall ? "school wall" : "",
  ].filter(Boolean);

  if (publicSurfaces.length === 0) {
    return `"${writing.title}" will be removed from your writing list.`;
  }

  return `"${writing.title}" will be removed from your writing list and hidden from ${publicSurfaces.join(", ")}.`;
}

// The public surfaces a writing is currently live on, so the student always
// knows where their post appears right now (or that it is private). After a
// transfer, the origin school's wall/global wall drop off here automatically.
function getPlacements(writing) {
  return [
    writing.showOnSchoolWall
      ? { key: "wall", label: "School Wall", icon: FaSchool }
      : null,
    writing.isMagazinePublished
      ? { key: "magazine", label: "School Magazine", icon: FaBookOpen }
      : writing.submissionSource === "MAGAZINE" && String(writing.status || "").toUpperCase() !== "DRAFT"
        ? { key: "magazine-sent", label: "Sent to magazine", icon: FaBookOpen }
        : null,
    writing.isPublished
      ? { key: "home", label: "Homepage", icon: FaHome }
      : null,
    writing.isGlobalWallPublished
      ? { key: "global", label: "Global Wall", icon: FaGlobeAsia }
      : null,
  ].filter(Boolean);
}

function getWithdrawalActions(writing) {
  return [
    writing.showOnSchoolWall
      ? {
          label: "Withdraw from school wall",
          icon: FaSchool,
          action: "WITHDRAW_SCHOOL_WALL",
        }
      : null,
    writing.isPublished
      ? {
          label: "Withdraw from homepage",
          icon: FaHome,
          action: "WITHDRAW_HOMEPAGE",
        }
      : null,
    writing.isMagazinePublished
      ? {
          label: "Withdraw from magazine",
          icon: FaBookOpen,
          action: "WITHDRAW_MAGAZINE",
        }
      : null,
    writing.isGlobalWallPublished
      ? {
          label: "Withdraw from global wall",
          icon: FaGlobeAsia,
          action: "WITHDRAW_GLOBAL_WALL",
        }
      : null,
  ].filter(Boolean);
}

function getReleaseActions(writing) {
  const status = String(writing?.status || "DRAFT").toUpperCase();
  const canReleaseToSchoolWall =
    writing &&
    writing.showOnSchoolWall === false &&
    ["SUBMITTED", "APPROVED"].includes(status) &&
    !writing.isMagazinePublished &&
    !writing.isPublished &&
    !writing.isGlobalWallPublished;

  return [
    canReleaseToSchoolWall
      ? {
          label: "Show on school wall",
          icon: FaSchool,
          action: "RELEASE_SCHOOL_WALL",
        }
      : null,
  ].filter(Boolean);
}


function getWordCount(content = "") {
  return String(content || "").trim().split(/\s+/).filter(Boolean).length;
}

function getReadTime(content = "") {
  return Math.max(1, Math.ceil(getWordCount(content) / 180));
}

function getPreview(content = "", maxLength = 130) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function buildEmptyForm() {
  return {
    id: "",
    title: "",
    content: "",
    category: "BLOG_ARTICLE",
    // Where it goes when posted: the school wall or the school magazine.
    submissionSource: "FREE_WRITE",
    // The magazine (open for writing) it is written for.
    requestedIssue: "",
    status: "DRAFT",
    images: [],
    coverImage: null,
    tags: [],
  };
}

function StatusPill({ status }) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;

  return (
    <span
      className={`badge badge-neutral inline-flex items-center gap-1.5 ${meta.chip}`}
    >
      <Icon />
      {meta.label}
    </span>
  );
}

function PlacementRow({ writing, className = "" }) {
  const placements = getPlacements(writing);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-2xs font-semibold ${className}`}>
      <span className="text-muted">
        {placements.length ? "Showing on:" : "Visibility:"}
      </span>
      {placements.length ? (
        placements.map((placement) => {
          const Icon = placement.icon;
          return (
            <span
              key={placement.key}
              className="inline-flex items-center gap-1 rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-success"
            >
              <Icon className="text-2xs" />
              {placement.label}
            </span>
          );
        })
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-muted">
          <FaLock className="text-2xs" />
          Private — not shown publicly
        </span>
      )}
    </div>
  );
}

function CategoryArt({ category, className = "" }) {
  const meta = getCategoryMeta(category);
  const Icon = meta.icon;

  return (
    <div
      className={`card surface-brand relative overflow-hidden ${className}`}
    >
      <div className="card absolute left-6 top-5 h-16 w-24 rotate-[-8deg]" />
      <div className="card absolute left-16 top-9 h-16 w-24 rotate-[8deg]" />
      <div className="absolute bottom-7 right-8 h-1 w-28 rotate-[-18deg] rounded-full bg-surface" />
      <div className="absolute bottom-11 right-12 h-1 w-20 rotate-[-18deg] rounded-full bg-surface" />
      <Icon className="absolute right-6 top-6 text-2xl text-white" />
      <FaPenNib className="absolute bottom-6 left-7 text-2xl text-white" />
      <span className="badge badge-neutral absolute bottom-4 right-4">
        {meta.label}
      </span>
    </div>
  );
}

// A photo the student added is the truest thumbnail for her writing; the drawn
// category art is only the stand-in for a piece with no image yet.
function WritingArt({ writing, className = "" }) {
  const leadImage = getWritingLeadImage(writing.coverImage, writing.images);
  if (!leadImage?.url) {
    return <CategoryArt category={writing.category} className={className} />;
  }

  const meta = getCategoryMeta(writing.category);

  return (
    <figure
      className={`relative overflow-hidden rounded-control border border-line-strong bg-surface-2 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leadImage.url}
        alt={leadImage.altText || writing.title || "Writing photo"}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <span className="badge badge-neutral absolute bottom-2 right-2">
        {meta.label}
      </span>
    </figure>
  );
}

function InlineFormattedText({ text }) {
  const pattern =
    /(\{\{highlight\}\}.*?\{\{\/highlight\}\}|\*\*[^*]+\*\*|_[^_]+_)/g;
  const parts = String(text || "").split(pattern).filter(Boolean);

  return parts.map((part, index) => {
    const highlight = part.match(/^\{\{highlight\}\}(.*)\{\{\/highlight\}\}$/);
    if (highlight) {
      return (
        <mark
          key={`${part}-${index}`}
          className="rounded-control bg-warning-soft px-1 font-semibold text-ink"
        >
          {highlight[1]}
        </mark>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderFormattedContent(content) {
  const lines = String(content || "").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      blocks.push(<div key={`space-${index}`} className="h-3" />);
      index += 1;
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*-\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="list-disc space-y-2 pl-6">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              <InlineFormattedText text={item} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${index}`} className="list-decimal space-y-2 pl-6">
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              <InlineFormattedText text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quotes = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quotes.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="border-l border-brand-line bg-brand-soft px-4 py-3 font-semibold text-muted"
        >
          {quotes.map((quote, quoteIndex) => (
            <p key={`${quote}-${quoteIndex}`}>
              <InlineFormattedText text={quote} />
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    blocks.push(
      <p key={`${index}`}>
        <InlineFormattedText text={line} />
      </p>
    );
    index += 1;
  }

  return <div className="space-y-3">{blocks}</div>;
}

function WritingEditor({
  form,
  setForm,
  editorMode,
  setEditorMode,
  activeEditingLabel,
  saving,
  onSave,
  onReset,
  resetLabel = "New",
  portfolioOnly = false,
  titleRef = null,
}) {
  const [showCoverImage, setShowCoverImage] = useState(Boolean(form.coverImage));
  const [showTags, setShowTags] = useState(Boolean(form.tags?.length));
  const tagsInputId = useId();
  const forMagazine = form.submissionSource === "MAGAZINE";
  // Writing types (blog, poem…) are for the school wall; a magazine piece needs none.
  const showCategory = portfolioOnly || !forMagazine;
  const [openIssues, setOpenIssues] = useState(null);
  useEffect(() => {
    if (!forMagazine || portfolioOnly) return undefined;
    let live = true;
    fetch("/api/student/magazine-issues", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((payload) => {
        if (!live) return;
        const issues = Array.isArray(payload.issues) ? payload.issues : [];
        setOpenIssues(issues);
        // Only one magazine open: choose it for them.
        if (issues.length === 1) {
          setForm((current) => (current.requestedIssue ? current : { ...current, requestedIssue: issues[0].id }));
        }
      })
      .catch(() => live && setOpenIssues([]));
    return () => {
      live = false;
    };
  }, [forMagazine, portfolioOnly, setForm]);
  const chosenIssueOpen = Boolean(form.requestedIssue && openIssues?.some((issue) => issue.id === form.requestedIssue));
  const previewLeadImage = getWritingLeadImage(form.coverImage, form.images);
  const previewBodyImages = getWritingBodyImages(form.coverImage, form.images);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line-strong px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {["WRITE", "PREVIEW"].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setEditorMode(mode)}
              className={`btn btn-ghost transition-colors ${
                editorMode === mode
                  ? "bg-brand-soft text-brand-strong"
                  : "text-muted hover:bg-surface"
              }`}
            >
              {mode === "WRITE" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted">
          <FaCloud />
          {form.id ? activeEditingLabel : "Saved as draft"}
        </div>
      </div>

      {!portfolioOnly && (
        <div className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Send to</span>
          <div role="group" aria-label="Send to" className="grid grid-cols-2 rounded-control border border-line bg-surface-2 p-0.5 sm:inline-grid">
            {[
              { id: "FREE_WRITE", label: "School wall", icon: FaSchool },
              { id: "MAGAZINE", label: "School magazine", icon: FaBookOpen },
            ].map(({ id, label, icon: Icon }) => {
              const on = (form.submissionSource || "FREE_WRITE") === id;
              return (
                <button key={id} type="button" aria-pressed={on}
                  onClick={() => setForm((current) => ({ ...current, submissionSource: id }))}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-brand text-white shadow-card" : "text-muted hover:text-ink"}`}>
                  <Icon aria-hidden /> {label}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-muted">
            {forMagazine
              ? "Your school chooses which writing goes into the magazine. It does not appear on the school wall."
              : "Classmates see it on the school wall after you post it."}
          </span>
        </div>
      )}

      {!portfolioOnly && forMagazine && (
        <div className="px-4 pt-3">
          {openIssues === null ? (
            <p className="text-xs text-muted">Loading magazines…</p>
          ) : openIssues.length === 0 ? (
            <p className="rounded-control border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
              Your school has no magazine open for writing right now. Save it privately and send it when one opens.
            </p>
          ) : (
            <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Which magazine?</span>
              <select
                className="input sm:max-w-sm"
                value={chosenIssueOpen ? form.requestedIssue : ""}
                onChange={(event) => setForm((current) => ({ ...current, requestedIssue: event.target.value }))}
              >
                <option value="">Choose a magazine…</option>
                {openIssues.map((issue) => (
                  <option key={issue.id} value={issue.id}>{issue.title}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className={`grid gap-3 p-4 ${showCategory ? "sm:grid-cols-[1fr_190px]" : ""}`}>
        <input
          ref={titleRef}
          type="text"
          placeholder="Enter your article title..."
          value={form.title}
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
          className="input transition-colors"
        />

        {showCategory ? (
          <select
            value={form.category}
            onChange={(event) =>
              setForm((current) => ({ ...current, category: event.target.value }))
            }
            className="input transition-colors"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {CATEGORY_META[option].label}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {editorMode === "WRITE" ? (
        <div className="relative border-t border-line">
          <textarea
            placeholder="Start writing your amazing article here..."
            value={form.content}
            onChange={(event) =>
              setForm((current) => ({ ...current, content: event.target.value }))
            }
            maxLength={MAX_WRITING_CHARACTERS}
            className="input block min-h-[340px] w-full resize-y rounded-none border-0 px-5 pb-10 pt-4 text-base leading-8 focus:shadow-none"
          />
          <span className="pointer-events-none absolute bottom-3 right-5 rounded-full bg-surface px-2 text-xs font-semibold text-muted">
            {form.content.length} / {MAX_WRITING_CHARACTERS}
          </span>
        </div>
      ) : (
        <article className="min-h-[340px] bg-surface px-5 py-5 text-base leading-8 text-ink">
          {previewLeadImage?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewLeadImage.url}
              alt={previewLeadImage.altText || form.title || "Writing cover"}
              className="mb-5 max-h-80 w-full rounded-card object-cover"
            />
          ) : null}
          {form.content
            ? renderFormattedContent(form.content)
            : "Your preview will appear here as you write."}
          {previewBodyImages.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {previewBodyImages.map((image, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.asset || image.url || index}
                  src={image.url}
                  alt={image.altText || `Writing photo ${index + 1}`}
                  className="w-full rounded-card object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
        </article>
      )}

      {(form.images || []).length ? (
        <div className="border-t border-line-strong bg-surface px-4 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(form.images || []).map((image, index) => (
              <div key={image.asset || index} className="relative overflow-hidden rounded-control border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.altText || `Photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      images: current.images.filter((_, currentIndex) => currentIndex !== index),
                    }))
                  }
                  className="btn-icon btn-ghost absolute right-1.5 top-1.5 flex items-center justify-center bg-surface/90"
                >
                  <FaTimes />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`flex flex-col gap-3 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${(form.images || []).length ? "" : "border-t border-line-strong"}`}>
        <div className="flex flex-wrap items-start gap-2">
          {(form.images || []).length < 5 ? (
            <ImageUploadField
              purpose="WRITING_IMAGE"
              value={null}
              onChange={(asset) => {
                if (!asset) return;
                setForm((current) => ({
                  ...current,
                  images: [...(current.images || []), { asset: asset.id, url: asset.url }],
                }));
              }}
              label={(form.images || []).length ? `Add a photo (${form.images.length}/5)` : "Add a photo"}
              hint={null}
              buttonClassName="btn btn-soft btn-sm inline-flex items-center gap-2 transition-colors"
              maxEdge={1280}
              quality={0.68}
            />
          ) : null}
          <button
            type="button"
            onClick={() => setShowCoverImage((current) => !current)}
            className="btn btn-soft btn-sm inline-flex items-center gap-2 transition-colors"
          >
            <FaImage />
            Add Cover Image
          </button>
          <button
            type="button"
            onClick={() => setShowTags((current) => !current)}
            className="btn btn-soft btn-sm inline-flex items-center gap-2 transition-colors"
          >
            <FaTags />
            Add Tags
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {portfolioOnly ? (
            // Portfolio-owned piece (written at a school she has left): edits just
            // update her own copy — no draft/school-wall split.
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave("DRAFT")}
              className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaEdit />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave("DRAFT")}
                className="btn btn-soft btn-sm inline-flex items-center justify-center gap-2 transition-colors"
              >
                <FaEdit />
                {saving ? "Saving..." : form.id ? "Update Private" : "Save Private"}
              </button>
              <button
                type="button"
                disabled={saving || (forMagazine && !chosenIssueOpen)}
                title={forMagazine && !chosenIssueOpen ? "Choose a magazine first" : ""}
                onClick={() => onSave("SUBMITTED")}
                className="btn btn-primary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
              >
                <FaPaperPlane />
                {saving
                  ? "Sending..."
                  : form.submissionSource === "MAGAZINE"
                    ? "Send to Magazine"
                    : "Post to School Wall"}
              </button>
            </>
          )}
          {(form.id || form.title || form.content) && (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              {resetLabel === "Cancel" ? <FaTimes /> : <FaPlus />}
              {resetLabel}
            </button>
          )}
        </div>
      </div>

      {showCoverImage ? (
        <div className="border-t border-line-strong bg-surface px-4 py-4">
          <p className="text-sm font-semibold text-ink">Cover image</p>
          <p className="mt-1 text-xs text-muted">
            This image appears at the top of your writing.
          </p>
          <ImageUploadField
            purpose="WRITING_IMAGE"
            value={form.coverImage}
            onChange={(asset) =>
              setForm((current) => ({
                ...current,
                coverImage: asset
                  ? { asset: asset.id, url: asset.url, altText: current.title }
                  : null,
              }))
            }
            label={form.coverImage ? "Replace cover image" : "Upload cover image"}
            hint={null}
            className="mt-1"
            maxEdge={1600}
            quality={0.7}
          />
        </div>
      ) : null}

      {showTags ? (
        <div className="border-t border-line-strong bg-surface px-4 py-4">
          <label className="text-sm font-semibold text-ink" htmlFor={tagsInputId}>
            Tags
          </label>
          <p className="mt-1 text-xs text-muted">
            Add up to eight tags, separated by commas.
          </p>
          <input
            id={tagsInputId}
            type="text"
            value={(form.tags || []).join(", ")}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                tags: event.target.value
                  .split(",")
                  .map((tag) => tag.trimStart())
                  .slice(0, 8),
              }))
            }
            placeholder="science, school life, creativity"
            className="input mt-3 w-full"
          />
          {(form.tags || []).filter((tag) => tag.trim()).length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {form.tags.filter((tag) => tag.trim()).map((tag, index) => (
                <span key={`${tag}-${index}`} className="badge badge-brand text-xs">
                  #{tag.trim().replace(/^#+/, "")}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WritingListItem({
  writing,
  onRead,
  onEdit,
  onStatusAction,
  onDelete,
}) {
  const categoryMeta = getCategoryMeta(writing.category);
  const statusMeta = getStatusMeta(writing.status);
  const libraryMeta = getLibraryMeta(writing);
  const LibraryIcon = libraryMeta.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const status = String(writing.status || "DRAFT").toUpperCase();
  const isPrivate = status === "DRAFT" || status === "REJECTED";
  const isTransferredOut = Boolean(writing.isTransferredOut);
  // For a piece from a school she has left, the actions are portfolio-only
  // (show/hide), never school-wall posting.
  const primaryStatusAction = isTransferredOut
    ? writing.isPublished
      ? { label: "Hide from portfolio", icon: FaLock, action: "MAKE_PRIVATE" }
      : { label: "Show on portfolio", icon: FaEye, action: "RELEASE_SCHOOL_WALL" }
    : isPrivate
    ? {
        label: "Post to school wall",
        icon: FaPaperPlane,
        action: "SUBMITTED",
      }
    : {
        label: "Make private",
        icon: FaLock,
        action: "MAKE_PRIVATE",
      };
  const PrimaryStatusIcon = primaryStatusAction.icon;
  const editAllowed = canEditWriting(writing);
  // School-wall / homepage / magazine actions don't apply once she has left.
  const withdrawalActions = isTransferredOut ? [] : getWithdrawalActions(writing);
  const releaseActions = isTransferredOut ? [] : getReleaseActions(writing);

  const runMenuAction = (callback) => {
    setMenuOpen(false);
    callback();
  };

  return (
    <article className="card grid gap-4 p-3 transition-colors hover:border-brand-line md:grid-cols-[128px_1fr]">
      <WritingArt writing={writing} className="h-28" />

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={writing.status} />
            {writing.submissionSource === "MAGAZINE" ? (
              // Once printed, the "School Magazine" chip below already says it.
              getLibraryBucket(writing) === "MAGAZINE" ? null : (
                <span className="badge badge-success inline-flex items-center gap-1.5">
                  <FaBookOpen />
                  For the magazine
                </span>
              )
            ) : (
              <span
                className={`badge badge-neutral inline-flex ${categoryMeta.chip}`}
              >
                {categoryMeta.label}
              </span>
            )}
            <span
              className={`badge badge-neutral inline-flex items-center gap-1.5 ${libraryMeta.chip}`}
            >
              <LibraryIcon />
              {libraryMeta.label}
            </span>
            {writing.schoolName && (
              <span
                className={`badge badge-neutral inline-flex items-center gap-1.5 ${
                  isTransferredOut
                    ? "border-brand-line bg-brand-soft text-brand-strong"
                    : "border-line bg-surface-2 text-muted"
                }`}
                title={
                  isTransferredOut
                    ? `Written at ${writing.schoolName} (previous school)`
                    : writing.schoolName
                }
              >
                <FaSchool />
                {isTransferredOut
                  ? `Written at ${writing.schoolName}`
                  : writing.schoolName}
              </span>
            )}
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              onBlur={(event) => {
                if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                  setMenuOpen(false);
                }
              }}
              className="btn-icon btn-ghost flex items-center justify-center transition-colors"
              aria-label="Writing options"
              aria-expanded={menuOpen}
            >
              <FaEllipsisV />
            </button>
            {menuOpen && (
              <div
                className="card absolute right-0 top-10 z-20 w-64 overflow-hidden py-1 text-sm font-semibold text-ink shadow-pop"
                onMouseDown={(event) => event.preventDefault()}
              >
                <button
                  type="button"
                  onClick={() => runMenuAction(() => onRead(writing))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                >
                  <FaEye className="text-brand-strong" />
                  Open
                </button>
                {editAllowed ? (
                  <button
                    type="button"
                    onClick={() => runMenuAction(() => onEdit(writing))}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                  >
                    <FaEdit className="text-brand-strong" />
                    Edit
                  </button>
                ) : (
                  <div className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs leading-5 text-muted">
                    <FaLock className="mt-0.5 shrink-0 text-brand-strong" />
                    Editing is locked while published
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    runMenuAction(() =>
                      onStatusAction(writing, primaryStatusAction.action)
                    )
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                >
                  <PrimaryStatusIcon className="text-brand-strong" />
                  {primaryStatusAction.label}
                </button>
                {withdrawalActions.map((withdrawAction) => {
                  const WithdrawIcon = withdrawAction.icon;
                  return (
                    <button
                      key={withdrawAction.action}
                      type="button"
                      onClick={() =>
                        runMenuAction(() =>
                          onStatusAction(writing, withdrawAction.action)
                        )
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                    >
                      <WithdrawIcon className="text-brand-strong" />
                      {withdrawAction.label}
                    </button>
                  );
                })}
                {releaseActions.map((releaseAction) => {
                  const ReleaseIcon = releaseAction.icon;
                  return (
                    <button
                      key={releaseAction.action}
                      type="button"
                      onClick={() =>
                        runMenuAction(() =>
                          onStatusAction(writing, releaseAction.action)
                        )
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                    >
                      <ReleaseIcon className="text-brand-strong" />
                      {releaseAction.label}
                    </button>
                  );
                })}
                {(writing.isPublished || writing.isMagazinePublished) && (
                  <div className="border-t border-line px-3 py-2 text-xs font-semibold leading-5 text-muted">
                    Homepage and magazine placement are selected by your school.
                    Repost after editing so your school can select it again.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => runMenuAction(() => onDelete(writing))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger hover:bg-danger-soft"
                >
                  <FaTrash />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <h3 className="mt-2 line-clamp-1 font-semibold text-ink">
          {writing.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
          {getPreview(writing.content, 160)}
        </p>
        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-muted">
          {getWorkflowMessage(writing)}
        </p>
        <PlacementRow writing={writing} className="mt-2.5" />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted">
          <span><AppDate value={writing.updatedAt} /></span>
          <span>{getWordCount(writing.content)} words</span>
          <span>{getReadTime(writing.content)} min read</span>
          <span className={`inline-flex items-center gap-1.5 ${statusMeta.chip.split(" ").at(-1)}`}>
            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRead(writing)}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-strong"
        >
          Read More
          <FaArrowRight />
        </button>
      </div>
    </article>
  );
}

function SidebarPanels({ counts, libraryCounts, totalWords }) {
  const tips = [
    ["Write from the heart", "Your authentic voice connects with readers.", FaHeart],
    ["Edit and polish", "Good writing becomes clearer when you revisit it.", FaEdit],
    ["Be original", "Share your unique perspective.", FaLightbulb],
  ];

  return (
    <aside className="space-y-4">
      <section className="card p-4">
        <h2 className="font-semibold text-ink">Writing Tips</h2>
        <div className="mt-4 space-y-4">
          {tips.map(([title, text, Icon]) => (
            <div key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-warning-soft text-warning">
                <Icon />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-4 text-ink">
        <FaLightbulb className="text-2xl text-brand" />
        <p className="mt-4 text-sm font-semibold leading-6 text-ink">
          Words have power. Use yours to inspire the world.
        </p>
        <p className="mt-3 text-xs font-semibold text-muted">
          School writing studio
        </p>
      </section>

      <section className="card p-4">
        <div className="flex items-center gap-2">
          <FaTrophy className="text-warning" />
          <h2 className="font-semibold text-ink">
            Your Achievements
          </h2>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Selected Pieces</span>
            <strong className="text-ink">{counts.APPROVED}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Total Words</span>
            <strong className="text-ink">{totalWords}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">School Wall Posts</span>
            <strong className="text-ink">{counts.SUBMITTED}</strong>
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold text-ink">Writing Breakdown</h2>
        <div className="mt-4 space-y-3 text-sm">
          {[
            ["Free Writing", libraryCounts.FREE, FaPenNib],
            ["School Writing", libraryCounts.SCHOOL, FaSchool],
            ["School Magazine", libraryCounts.MAGAZINE, FaBookOpen],
          ].map(([label, value, Icon]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-muted">
                <Icon className="text-xs text-brand" />
                {label}
              </span>
              <strong className="text-ink">{value}</strong>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default function StudentWritingWorkspace() {
  useWorkIndicators();
  const [student, setStudent] = useState(null);
  const [writings, setWritings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(buildEmptyForm());
  const [editForm, setEditForm] = useState(buildEmptyForm());
  const [readingWriting, setReadingWriting] = useState(null);
  const [editingWriting, setEditingWriting] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeLibrary, setActiveLibrary] = useState("ALL");
  const [activeStatus, setActiveStatus] = useState("ALL");
  const [editorMode, setEditorMode] = useState("WRITE");
  const [editEditorMode, setEditEditorMode] = useState("WRITE");

  const loadWritings = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await fetch("/api/student/writings", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.message || "Failed to load your writing space");
      }

      setStudent(payload.student || null);
      setWritings(Array.isArray(payload.writings) ? payload.writings : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load your writing space");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWritings();
  }, [loadWritings]);

  useRealtimeChannel(
    ["student-notifications", "work-indicators"],
    useCallback(() => {
      void loadWritings({ silent: true });
    }, [loadWritings])
  );

  const editorRef = useRef(null);
  const titleInputRef = useRef(null);

  const resetForm = useCallback(() => {
    setForm(buildEmptyForm());
    setEditorMode("WRITE");
  }, []);

  // "New Writing" clears the editor AND brings it into view + focuses the title,
  // so the button gives visible feedback instead of silently resetting an
  // editor that's below the fold.
  const handleNewWriting = useCallback(() => {
    resetForm();
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  }, [resetForm]);

  const startEdit = useCallback((writing) => {
    if (!canEditWriting(writing)) {
      setSuccess("");
      setError("Make this writing private before editing published work.");
      return;
    }

    setReadingWriting(null);
    setSuccess("");
    setError("");
    setEditEditorMode("WRITE");
    setEditingWriting(writing);
    setEditForm({
      id: writing.id,
      title: writing.title || "",
      content: writing.content || "",
      category: normalizeCategory(writing.category),
      submissionSource: writing.submissionSource === "MAGAZINE" ? "MAGAZINE" : "FREE_WRITE",
      requestedIssue: writing.requestedIssue || "",
      status: writing.status || "DRAFT",
      images: writing.images || [],
      coverImage: writing.coverImage || null,
      tags: writing.tags || [],
    });
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingWriting(null);
    setEditForm(buildEmptyForm());
    setEditEditorMode("WRITE");
  }, []);

  const handleSave = async (nextStatus = "DRAFT") => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const url = form.id
        ? `/api/student/writings/${form.id}`
        : "/api/student/writings";
      const method = form.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          category: form.category,
          submissionSource: form.submissionSource,
          requestedIssue: form.requestedIssue,
          status: nextStatus,
          images: form.images,
          coverImage: form.coverImage,
          tags: form.tags,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to save writing");
      }

      setSuccess(payload.message || "Writing saved");
      resetForm();
      await loadWritings();
    } catch (saveError) {
      setError(saveError.message || "Failed to save writing");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (nextStatus = "DRAFT") => {
    if (!editForm.id) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/student/writings/${editForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          content: editForm.content,
          category: editForm.category,
          submissionSource: editForm.submissionSource,
          requestedIssue: editForm.requestedIssue,
          status: nextStatus,
          images: editForm.images,
          coverImage: editForm.coverImage,
          tags: editForm.tags,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.message || "Failed to save writing");
      }

      setSuccess(payload.message || "Writing saved");
      closeEditDialog();
      await loadWritings();
    } catch (saveError) {
      setError(saveError.message || "Failed to save writing");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch(`/api/student/writings/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.message || "Failed to delete writing");
      }

      if (form.id === deleteTarget.id) {
        resetForm();
      }
      if (editForm.id === deleteTarget.id) {
        closeEditDialog();
      }
      setDeleteTarget(null);
      setSuccess(payload.message || "Writing deleted");
      await loadWritings();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete writing");
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (writing, action) => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const isActionCommand =
        action === "MAKE_PRIVATE" ||
        action === "RELEASE_SCHOOL_WALL" ||
        String(action).startsWith("WITHDRAW_");
      const res = await fetch(`/api/student/writings/${writing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isActionCommand
            ? { action }
            : {
                title: writing.title,
                content: writing.content,
                category: writing.category,
                status: action,
              }
        ),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.message || "Failed to update writing");
      }

      if (isActionCommand && form.id === writing.id) {
        resetForm();
      }
      if (isActionCommand && editForm.id === writing.id) {
        closeEditDialog();
      }

      setSuccess(payload.message || "Writing updated");
      await loadWritings();
    } catch (actionError) {
      setError(actionError.message || "Failed to update writing");
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const nextCounts = {
      ALL: writings.length,
      DRAFT: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    writings.forEach((writing) => {
      const status = String(writing.status || "DRAFT").toUpperCase();
      nextCounts[status] = (nextCounts[status] || 0) + 1;
    });
    return nextCounts;
  }, [writings]);

  const libraryCounts = useMemo(() => {
    const nextCounts = {
      ALL: writings.length,
      FREE: 0,
      SCHOOL: 0,
      MAGAZINE: 0,
    };
    writings.forEach((writing) => {
      const bucket = getLibraryBucket(writing);
      nextCounts[bucket] = (nextCounts[bucket] || 0) + 1;
    });
    return nextCounts;
  }, [writings]);

  const filteredWritings = useMemo(
    () =>
      writings.filter((writing) => {
        const matchesLibrary =
          activeLibrary === "ALL" || getLibraryBucket(writing) === activeLibrary;
        const matchesStatus =
          activeStatus === "ALL" ||
          String(writing.status || "").toUpperCase() === activeStatus;
        return matchesLibrary && matchesStatus;
      }),
    [activeLibrary, activeStatus, writings]
  );

  const totalWords = useMemo(
    () => writings.reduce((sum, writing) => sum + getWordCount(writing.content), 0),
    [writings]
  );

  const activeEditingLabel = useMemo(() => {
    if (!form.id) return "New Draft";
    return "Editing Draft";
  }, [form.id]);

  // The reader leads with a photo — the cover when there is one, otherwise the
  // first photo the student attached — and the rest follow the text.
  const readingLeadImage = useMemo(
    () =>
      readingWriting
        ? getWritingLeadImage(readingWriting.coverImage, readingWriting.images)
        : null,
    [readingWriting]
  );
  const readingBodyImages = useMemo(
    () =>
      readingWriting
        ? getWritingBodyImages(readingWriting.coverImage, readingWriting.images)
        : [],
    [readingWriting]
  );

  return (
    <div className="space-y-4 text-ink">
      <StudentQuickNav className="sm:hidden" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Writing</h1>
        <button
          type="button"
          onClick={handleNewWriting}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <FaPlus />
          New Writing
        </button>
      </div>

      {error && <AlertBanner type="error" title="Action needed" message={error} />}
      {success && <AlertBanner type="success" message={success} />}

      <div className="grid gap-5 xl:grid-cols-[1fr_310px]">
        <main className="min-w-0 space-y-4">
          <div ref={editorRef} className="scroll-mt-4">
            <WritingEditor
              form={form}
              setForm={setForm}
              editorMode={editorMode}
              setEditorMode={setEditorMode}
              activeEditingLabel={activeEditingLabel}
              saving={saving}
              onSave={handleSave}
              onReset={resetForm}
              titleRef={titleInputRef}
            />
          </div>

          <section className="card p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
              <div>
                <h2 className="font-semibold text-ink">
                  Writing Library
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Free writing, school wall posts, and school magazine pieces
                  in one manageable view.
                </p>
              </div>
              <select
                value={activeStatus}
                onChange={(event) => setActiveStatus(event.target.value)}
                className="input min-w-0 transition-colors"
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Drafts</option>
                <option value="SUBMITTED">Posted to School</option>
                <option value="APPROVED">Selected</option>
                <option value="REJECTED">Returned</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {LIBRARY_FILTERS.map(([bucket, label]) => {
                const active = activeLibrary === bucket;
                const Icon =
                  bucket === "FREE"
                    ? FaPenNib
                    : bucket === "SCHOOL"
                    ? FaSchool
                    : bucket === "MAGAZINE"
                    ? FaBookOpen
                    : FaFileAlt;
                return (
                  <button
                    key={bucket}
                    type="button"
                    onClick={() => setActiveLibrary(bucket)}
                    className={`card flex min-h-28 w-full min-w-0 items-start justify-between gap-3 p-4 text-left transition-colors ${
                      active
                        ? "border-brand-line bg-brand-soft text-brand-strong shadow-card"
                        : "border-line-strong bg-surface text-muted hover:border-brand-line"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase leading-4">
                        {label}
                      </span>
                      <strong className="mt-2 block text-2xl font-semibold leading-none text-ink">
                        {libraryCounts[bucket] || 0}
                      </strong>
                    </span>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${
                        active
                          ? "bg-surface text-brand-strong"
                          : "bg-surface text-muted"
                      }`}
                    >
                      <Icon />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["ALL", "All"],
                ["DRAFT", "Drafts"],
                ["SUBMITTED", "Posted"],
                ["APPROVED", "Selected"],
                ["REJECTED", "Returned"],
              ].map(([status, label]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setActiveStatus(status)}
                  className={`btn btn-ghost btn-sm transition-colors ${
                    activeStatus === status
                      ? "bg-brand text-white"
                      : "bg-brand-soft text-brand-strong hover:bg-brand-soft"
                  }`}
                >
                  {label} {counts[status] || 0}
                </button>
              ))}
            </div>

            {loading ? (
              <LoadingState
                title="Loading your writings"
                message="Preparing your private drafts, school wall posts, and selected writing."
                className="mt-4"
              />
            ) : writings.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={FaFileAlt}
                  title="No writing yet"
                  description="Start your first draft or respond to a platform prompt when one is available."
                />
              </div>
            ) : filteredWritings.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={FaFileAlt}
                  title="Nothing in this status"
                  description="Choose another category or status to see more writing."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filteredWritings.map((writing) => (
                  <WritingListItem
                    key={writing.id}
                    writing={writing}
                    onRead={setReadingWriting}
                    onEdit={startEdit}
                    onStatusAction={handleStatusAction}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )}
          </section>
        </main>

        <SidebarPanels
          counts={counts}
          libraryCounts={libraryCounts}
          totalWords={totalWords}
        />
      </div>

      {readingWriting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="card max-h-[92vh] w-full max-w-5xl overflow-y-auto shadow-pop">
            <div className="grid gap-5 p-5 md:p-6 xl:grid-cols-[1fr_0.48fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={readingWriting.status} />
                  <span
                    className={`badge badge-neutral inline-flex text-xs ${
                      getCategoryMeta(readingWriting.category).chip
                    }`}
                  >
                    {getCategoryMeta(readingWriting.category).label}
                  </span>
                  <span
                    className={`badge badge-neutral inline-flex text-xs ${
                      getLibraryMeta(readingWriting).chip
                    }`}
                  >
                    {getLibraryMeta(readingWriting).label}
                  </span>
                </div>
                <h2 className="mt-4 font-semibold leading-tight text-ink">
                  {readingWriting.title}
                </h2>
                <p className="mt-3 max-w-2xl rounded-control border border-line-strong bg-surface px-4 py-3 text-sm font-semibold leading-6 text-muted">
                  {getWorkflowMessage(readingWriting)}
                </p>
                <PlacementRow writing={readingWriting} className="mt-3" />
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <FaCalendarAlt />
                    Updated <AppDate value={readingWriting.updatedAt} mode="dateTime" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <FaClock />
                    {getReadTime(readingWriting.content)} min read
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3">
                <WritingArt writing={readingWriting} className="h-32 flex-1" />
              </div>
            </div>

            <article className="card mx-5 mb-5 mt-5 p-5 md:mx-8 md:p-7">
              {readingLeadImage?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={readingLeadImage.url}
                  alt={readingLeadImage.altText || readingWriting.title || "Writing cover"}
                  className="mb-4 max-h-[28rem] w-full rounded-card object-cover"
                />
              ) : null}
              {readingWriting.tags?.length ? (
                <div className="mb-5 flex flex-wrap gap-2">
                  {readingWriting.tags.map((tag) => (
                    <span key={tag} className="badge badge-brand text-xs">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <WritingContent
                content={readingWriting.content}
                className="text-base leading-7 text-ink md:text-lg"
              />
              {readingBodyImages.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {readingBodyImages.map((image, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={image.asset || image.url || index}
                      src={image.url}
                      alt={image.altText || `Writing photo ${index + 1}`}
                      className="w-full rounded-card object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              ) : null}
            </article>

            <div className="flex flex-wrap gap-3 border-t border-line-strong bg-surface px-5 py-4 md:px-6">
              <button
                type="button"
                onClick={() => setReadingWriting(null)}
                className="btn btn-secondary inline-flex items-center gap-2 transition-colors"
              >
                <FaArrowLeft />
                Back to writing
              </button>
              {canEditWriting(readingWriting) && (
                <button
                  type="button"
                  onClick={() => startEdit(readingWriting)}
                  className="btn btn-primary inline-flex items-center gap-2 transition-colors"
                >
                  <FaEdit />
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(editingWriting)}
        onClose={closeEditDialog}
        title="Edit writing"
        panelClassName=""
        headerClassName=""
        titleClassName=""
        bodyClassName=""
      >
        <div className="">
          <WritingEditor
            form={editForm}
            setForm={setEditForm}
            editorMode={editEditorMode}
            setEditorMode={setEditEditorMode}
            activeEditingLabel="Editing writing"
            saving={saving}
            onSave={handleEditSave}
            onReset={closeEditDialog}
            resetLabel="Cancel"
            portfolioOnly={Boolean(editingWriting?.isTransferredOut)}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this writing?"
        message={getDeleteMessage(deleteTarget)}
        confirmLabel="Delete writing"
        tone="danger"
        busy={saving}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
