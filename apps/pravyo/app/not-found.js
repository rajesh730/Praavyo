import Link from "next/link";
import { ArrowLeft as FaArrowLeft, Compass as FaCompass, House as FaHome } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-7">
      <div className="card mx-auto max-w-lg p-6 text-center sm:p-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-card bg-brand-soft text-2xl text-brand">
          <FaCompass />
        </div>
        <p className="eyebrow mt-4">Page not found</p>
        <h1 className="mt-3">This page does not exist</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
          The link may be outdated, the page may have moved, or the address may
          be incorrect.
        </p>

        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="btn btn-primary btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FaHome />
            Go to homepage
          </Link>
          <Link
            href="/events"
            className="btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FaArrowLeft />
            Browse events
          </Link>
        </div>
      </div>
    </main>
  );
}
