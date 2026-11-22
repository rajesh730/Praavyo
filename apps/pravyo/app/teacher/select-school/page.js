"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { signOutAndForgetDevice } from "@pravyo/ui/signOutDevice";
import { useRouter } from "next/navigation";
import { ChevronRight, School } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";

/**
 * Shown after sign-in to a teacher who works at more than one school, and from
 * the dashboard's "Switch school". The choice is written into the session; the
 * server accepts it only for a school where the teacher is still ACTIVE.
 */
export default function SelectSchoolPage() {
  const { update } = useSession();
  const router = useRouter();
  const [schools, setSchools] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/teacher/schools", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "Your schools could not be loaded.");
        setSchools(payload.data.schools);
        setCurrentId(payload.data.currentSchoolId);
      })
      .catch((reason) => setError(reason.message));
  }, []);

  const choose = async (school) => {
    setBusyId(school.id);
    setError("");
    const next = await update({ schoolId: school.id });
    if (next?.user?.schoolId === school.id) {
      router.replace("/teacher/dashboard");
      router.refresh();
    } else {
      setBusyId(null);
      setError(`You no longer have access to ${school.name}.`);
    }
  };

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-ink sm:py-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold">Choose your school</h1>
        <p className="mt-1 text-sm text-muted">You teach at more than one school. Pick the one you want to work in now. You can switch any time from your dashboard.</p>

        {error && <div className="mt-4"><AlertBanner type="error" title="Could not open school" message={error} /></div>}

        {!schools && !error && <LoadingState title="Loading your schools" message="Checking where you teach." />}

        {schools && schools.length === 0 && (
          <p className="card mt-4 p-4 text-sm text-muted">You are not active at any school right now. Contact your school office.</p>
        )}

        {schools && schools.length > 0 && (
          <ul className="mt-5 space-y-2">
            {schools.map((school) => (
              <li key={school.id}>
                <button
                  type="button"
                  onClick={() => choose(school)}
                  disabled={Boolean(busyId)}
                  className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong"><School aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{school.name}</span>
                    {school.id === currentId && <span className="text-xs text-muted">Current school</span>}
                  </span>
                  <span className="text-sm text-muted">{busyId === school.id ? "Opening…" : <ChevronRight aria-hidden />}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={() => signOutAndForgetDevice({ callbackUrl: "/login" })} className="btn btn-ghost btn-sm mt-6">Sign out</button>
      </div>
    </main>
  );
}
