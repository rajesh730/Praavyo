"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

/**
 * Guardian account creation (§27, step 2).
 *
 * The account grants nothing on its own — after signing in the guardian lands
 * on /parent/link and stays there until they redeem a school-issued code (§26).
 */
export default function ParentRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/parent/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not create account");

      // Sign straight in — asking a guardian to re-type credentials they just
      // chose is a needless drop-off point.
      const result = await signIn("credentials", {
        email: form.email.trim() || form.phone.trim(),
        password: form.password,
        loginScope: "parent",
        redirect: false,
      });

      if (result?.error) {
        window.location.assign("/parent/login");
        return;
      }
      window.location.assign("/parent/link");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-surface-2 px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-7">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-semibold text-ink">
          Create your parent account
        </h1>
        <p className="mt-1 text-sm text-muted">
          You will need an invitation code from your school to see your child.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field
            id="name"
            label="Your full name"
            value={form.name}
            onChange={update("name")}
            required
            autoComplete="name"
          />
          <Field
            id="email"
            label="Email address"
            type="email"
            value={form.email}
            onChange={update("email")}
            autoComplete="email"
          />
          <Field
            id="phone"
            label="Phone number"
            type="tel"
            value={form.phone}
            onChange={update("phone")}
            autoComplete="tel"
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={update("password")}
            required
            autoComplete="new-password"
          />

          {error ? (
            <p
              role="alert"
              className="rounded-card bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/parent/login"
            className="font-semibold text-brand"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({ id, label, ...props }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold text-ink"
      >
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="input mt-1.5 w-full"
      />
    </div>
  );
}
