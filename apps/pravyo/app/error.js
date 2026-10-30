"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert as FaExclamationTriangle, House as FaHome, RotateCw as FaRedo } from "lucide-react";
import Button from "@/components/ui/Button";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("App error boundary caught an error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-7">
      <div className="card mx-auto max-w-lg border-danger-line p-6 sm:p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-card bg-danger-soft text-2xl text-danger">
          <FaExclamationTriangle />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-danger">
          Something went wrong
        </p>
        <h1 className="mt-3">This screen could not load</h1>
        <p className="mt-4 text-sm leading-6 text-muted">
          The app hit an unexpected problem. You can try again, or return to
          the homepage and continue from there.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset} className="inline-flex gap-2">
            <FaRedo />
            Try again
          </Button>
          <Link
            href="/"
            className="btn btn-secondary btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold no-underline transition-colors"
          >
            <FaHome />
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
