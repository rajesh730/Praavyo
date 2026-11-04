"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { detachCurrentParentPushDevice } from "@/lib/client/parentPushSubscription";
import { useParentApp } from "@/components/parent/ParentAppContext";
import Glyph from "@/components/ui/Glyph";

/**
 * "Connect to Your Child" (§26).
 *
 * What a guardian with no linked child sees — NOT an empty dashboard.
 *
 * There is deliberately no student search on this screen. A parent cannot look
 * up a child by name and attach themselves; the only path is a code the school
 * generated for a specific student. That is the whole safeguarding model, and
 * adding a "find my child" convenience here would undo it.
 */
export default function ParentLinkPage() {
  const { t, reload } = useParentApp();
  const [code, setCode] = useState("");
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: "", success: "" });

    try {
      const res = await fetch("/api/parent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || t("link.invalid"));

      setState({
        loading: false,
        error: "",
        success: t("link.success", { name: json.data.child.name }),
      });

      // Reload the guardian's children, then enter the app.
      await reload();
      window.location.assign("/parent");
    } catch (err) {
      setState({ loading: false, error: err.message, success: "" });
    }
  };

  return (
    <main className="flex min-h-screen flex-col justify-center bg-surface-2 px-5 py-7">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-5 text-center">
          <p className="text-2xl" aria-hidden="true">
            <Glyph emoji="🔗" />
          </p>
          <h1 className="mt-3 font-semibold text-ink">
            {t("link.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t("link.description")}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-semibold text-ink"
            >
              {t("link.codeLabel")}
            </label>
            <input
              id="code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              // Uppercased on entry: the code alphabet is uppercase and the
              // server compares case-insensitively, so this just removes a way
              // for the field to look wrong.
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
              maxLength={12}
              className="input mt-1.5 w-full text-center"
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-card bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            >
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-card bg-success-soft px-4 py-3 text-sm font-medium text-success">
              {state.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={state.loading || !code.trim()}
            className="btn btn-primary w-full"
          >
            {state.loading ? t("common.loading") : t("link.submit")}
          </button>
        </form>

        <div className="card mt-5 p-4 text-center">
          <p className="text-sm font-semibold text-ink">
            {t("link.contactSchool")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Ask the school office to send you a guardian invitation. For your
            child&apos;s safety, only the school can connect a parent account.
          </p>
        </div>

        {/* An escape hatch: a guardian who signed into the wrong account must
            be able to get out without clearing cookies. */}
        <button
          type="button"
          onClick={async () => {
            await detachCurrentParentPushDevice().catch(() => {});
            await signOut({ callbackUrl: "/login" });
          }}
          className="mt-4 min-h-[44px] w-full text-sm font-semibold text-muted"
        >
          {t("settings.signOut")}
        </button>
      </div>
    </main>
  );
}
