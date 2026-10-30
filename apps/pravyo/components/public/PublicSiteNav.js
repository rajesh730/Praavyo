"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu as FaBars, Search as FaSearch, X as FaTimes } from "lucide-react";
import PravyoLogo from "@/components/brand/PravyoLogo";
import PublicRegisterLink from "@/components/public/PublicRegisterLink";
import MobileTabBar from "@/components/public/MobileTabBar";

export default function PublicSiteNav({
  active = "home",
  searchPlaceholder = "Search students, schools…",
  searchAction = "/search",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Add shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Prevent body scroll when menu open
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <header
        id="public-site-header"
        className="sticky top-0 z-50 border-b border-line bg-surface"
        style={{
          boxShadow: scrolled
            ? "0 2px 20px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)"
            : "none",
          transition: "box-shadow 200ms ease",
        }}
      >
        {/* ── Main bar ─────────────────────────────────────── */}
        <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-2 sm:h-16 sm:px-6 md:gap-4">

          {/* Logo */}
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="flex shrink-0 items-center gap-2.5"
          >
            <PravyoLogo variant="icon" compact priority imageClassName="h-9 w-9" />
            <span className="hidden text-base font-semibold text-ink sm:block">
              Praavyo
            </span>
          </Link>

          {/* Desktop search */}
          <form
            action={searchAction}
            className="hidden h-[var(--control-h)] max-w-md flex-1 items-center gap-2.5 rounded-control border border-line-strong bg-surface-2 px-3 text-sm text-muted transition-colors focus-within:border-brand focus-within:bg-surface focus-within:shadow-[var(--ring)] xl:flex"
          >
            <FaSearch className="shrink-0 text-muted" />
            <input
              name="q"
              type="search"
              placeholder={searchPlaceholder}
              className="min-h-0 min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:shadow-none"
            />
          </form>

          {/* Desktop CTA buttons */}
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link
              href="/login"
              className="btn btn-secondary btn-sm inline-flex items-center justify-center font-semibold transition-colors"
            >
              Log in
            </Link>
            <PublicRegisterLink size="sm">
              Register
            </PublicRegisterLink>
          </div>

          {/* Navigation trigger for screens where the public sidebar is hidden */}
          <div className="ml-auto flex items-center gap-2 xl:hidden">
            {/* Compact search pill */}
            <form
              action={searchAction}
              className="btn-icon btn-ghost sm:hidden"
            >
              <button type="submit" aria-label="Search">
                <FaSearch className="text-sm" />
              </button>
            </form>

            {/* Hamburger */}
            <button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              aria-expanded={isOpen}
              aria-controls="public-mobile-menu"
              aria-label={isOpen ? "Close menu" : "Open menu"}
              className="btn-icon btn-ghost flex items-center justify-center transition-colors"
            >
              <span
                className="block transition-colors"
                style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
              >
                {isOpen ? <FaTimes className="text-sm" /> : <FaBars className="text-sm" />}
              </span>
            </button>
          </div>
        </div>

        {/* ── Mobile dropdown menu ────────────────────────── */}
        {isOpen && (
          <div
            id="public-mobile-menu"
            className="border-t border-line bg-surface px-2 pb-5 pt-3 xl:hidden"
          >
            {/* The menu contains account actions only; public browsing stays on
                the page and the phone tab bar. */}
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="btn btn-secondary inline-flex items-center justify-center font-semibold transition-colors"
              >
                Log in
              </Link>
              <PublicRegisterLink
                size="lg"
                onClick={() => setIsOpen(false)}
                className="rounded-card"
              >
                Register
              </PublicRegisterLink>
            </div>
          </div>
        )}
      </header>

      {/* Phone navigation. Rendered here rather than per-page so all 13 public
          pages get it without each one remembering to mount it. */}
      <MobileTabBar active={active} />

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-scrim xl:hidden"
          style={{ background: "rgba(15,23,42,0.35)" }}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
