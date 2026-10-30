"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight as FaArrowRight, BookOpen as FaBookOpen, ChevronLeft as FaChevronLeft, ChevronRight as FaChevronRight, Shield as FaShieldAlt, Star as FaStar } from "lucide-react";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";

function getPreview(value = "", maxLength = 150) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function getCategoryLabel(value) {
  const label = String(value || "Writing").replaceAll("_", " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function HomepageHeroCarousel({ stories = [] }) {
  const slides = useMemo(() => {
    if (!stories.length) {
      return [
        {
          id: "empty-magazine-hero",
          title: "Student writing, published by schools",
          content: "",
          category: "School Magazine",
          author: "",
          schoolName: "",
          href: "/schools",
          empty: true,
        },
      ];
    }

    return stories.map((story) => ({
      ...story,
      category: getCategoryLabel(story.category),
    }));
  }, [stories]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex] || slides[0];

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const move = (direction) => {
    setActiveIndex((current) => {
      if (direction === "next") return (current + 1) % slides.length;
      return (current - 1 + slides.length) % slides.length;
    });
  };

  return (
    <section
      className="surface-brand relative min-h-[280px] overflow-hidden rounded-card p-4 text-white shadow-card md:min-h-[390px] md:p-7"
    >
      <div className="absolute bottom-0 left-0 right-0 h-px bg-surface" />

      <div className="relative z-10 flex min-h-[248px] flex-col justify-between md:min-h-[336px]">
        <div className="flex items-center justify-between gap-3">
          <span className="badge badge-neutral inline-flex items-center gap-2 text-xs">
            <FaStar />
            School Magazine
          </span>
          {slides.length > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => move("previous")}
                className="btn-icon btn-ghost flex items-center justify-center transition-colors"
                aria-label="Previous story"
              >
                <FaChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => move("next")}
                className="btn-icon btn-ghost flex items-center justify-center transition-colors"
                aria-label="Next story"
              >
                <FaChevronRight />
              </button>
            </div>
          )}
        </div>

        <div className="max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase text-white">
            <FaBookOpen />
            {activeSlide.category}
          </p>
          <h1
            className="line-clamp-2 max-w-4xl text-xl font-semibold leading-tight text-white md:text-3xl md:font-semibold"
            title={activeSlide.title}
          >
            {activeSlide.title}
          </h1>
          {!activeSlide.empty && (
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-white">
              <span>by {activeSlide.author}</span>
              <span className="inline-flex items-center gap-2">
                <FaShieldAlt className="text-white" />
                {activeSlide.schoolName}
              </span>
            </div>
          )}
          {activeSlide.content && (
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-white md:mt-5 md:text-base md:leading-7">
              {getPreview(activeSlide.content, activeSlide.empty ? 180 : 150)}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3 md:mt-4">
            <Link
              href={activeSlide.href || "/student-voices"}
              className="inline-flex h-10 w-fit items-center gap-2 rounded-control border border-white/60 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {activeSlide.empty ? "Explore Schools" : "Read Story"}
              <FaArrowRight />
            </Link>
            {!activeSlide.empty && activeSlide.schoolHref && (
              <Link
                href={activeSlide.schoolHref}
                className="card inline-flex min-w-0 items-center gap-3 px-3 py-2 text-ink transition-colors hover:border-brand-line hover:bg-surface-2"
              >
                <SchoolLogoMark
                  imageUrl={activeSlide.schoolLogoUrl}
                  name={activeSlide.schoolName}
                  className="h-9 w-9"
                  shapeClassName="rounded-control"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-muted">
                    School Profile
                  </span>
                  <span className="block truncate text-sm font-semibold text-ink">
                    {activeSlide.schoolName || "School"}
                  </span>
                </span>
                <span className="badge badge-brand shrink-0 text-xs">
                  See Profile
                </span>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 md:mt-4">
          {slides.map((slide, index) => (
            <button
              key={slide.id || slide.title}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 rounded-full transition-all ${
                index === activeIndex ? "w-8 bg-white" : "w-2.5 bg-white/50 hover:bg-white/75"
              }`}
              aria-label={`Show story ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
