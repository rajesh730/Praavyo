import Link from "next/link";
import PublicSiteNav from "@/components/public/PublicSiteNav";

// Rendered publicly on /contact, /privacy and /terms, so the fallback must be an
// official address — never a personal mailbox.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "contact@pravyo.infobytesnepal.com";

export function InfoSection({ title, children }) {
  return (
    <section className="card p-5 sm:p-5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export default function InfoPageShell({
  active = "home",
  eyebrow,
  title,
  intro,
  updated,
  children,
}) {
  return (
    <main className="min-h-screen bg-surface-2 pb-20 text-ink">
      <PublicSiteNav active={active} />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <header>
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand-strong">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight md:text-3xl">
            {title}
          </h1>
          {intro && (
            <p className="mt-3 text-sm leading-7 text-muted">{intro}</p>
          )}
          {updated && (
            <p className="mt-2 text-xs font-semibold text-subtle">
              Last updated: {updated}
            </p>
          )}
        </header>

        {children}

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-xs font-semibold text-muted">
          <Link href="/privacy" className="hover:text-brand-strong">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-brand-strong">
            Terms of Use
          </Link>
          <Link href="/contact" className="hover:text-brand-strong">
            Contact
          </Link>
          <span className="ml-auto">&copy; {new Date().getFullYear()} Praavyo</span>
        </footer>
      </div>
    </main>
  );
}
