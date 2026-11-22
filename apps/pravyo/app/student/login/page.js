"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { signOutAndForgetDevice } from "@pravyo/ui/signOutDevice";
import Link from "next/link";
import AuthShell, { AuthSessionPanel } from "@/components/auth/AuthShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input, { PasswordInput } from "@/components/ui/Input";
import AlertBanner from "@/components/ui/AlertBanner";

const AUTH_LINKS = [
  { href: "/events", label: "Events" },
  // Back to "who is signing in?" rather than straight to the staff form — a
  // student who lands here by mistake is more likely to be a parent.
  { href: "/login", label: "Not a student?" },
];

function destinationForRole(role) {
  const destinations = {
    STUDENT: "/student/dashboard",
    SUPER_ADMIN: "/admin/dashboard",
    SCHOOL_ADMIN: "/school/dashboard",
    TEACHER: "/teacher/dashboard",
  };
  return destinations[role] || "/";
}

export default function StudentLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: session, status } = useSession();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: username.trim(),
        password,
        // Students only: the IEMIS number (or old username) is never tried
        // against staff accounts.
        loginScope: "student",
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        window.location.assign("/student/dashboard");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "authenticated") {
    return (
      <AuthShell
        links={AUTH_LINKS}
        title="Already signed in"
        description="Sign out first to log in as a student on this device, or continue with the current account."
      >
        <AuthSessionPanel
          role={String(session?.user?.role || "").replaceAll("_", " ")}
          name={session?.user?.name}
          email={session?.user?.email}
        />
        <div className="mt-4 space-y-3">
          <ButtonLink
            fullWidth
            href={destinationForRole(session?.user?.role)}
          >
            Continue with this account
          </ButtonLink>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => signOutAndForgetDevice({ callbackUrl: "/login" })}
          >
            Sign out and log in as student
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      links={AUTH_LINKS}
      title="Student portal"
      description="Sign in with your IEMIS number and password. It stays the same if you change school."
      footer={
        <p className="text-center text-sm text-muted">
          Need help? Contact your school administrator for account support.
        </p>
      }
    >
      {error && (
        <div className="mb-4">
          <AlertBanner type="error" title="Login failed" message={error} />
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          label="IEMIS number"
          id="username"
          name="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your IEMIS number"
          required
          disabled={loading}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="iemis-hint"
        />
        <p id="iemis-hint" className="-mt-2 text-xs text-muted">
          It is printed on your report card. Your old username still works for now.
        </p>
        <PasswordInput
          label="Password"
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          placeholder="Enter your password"
          required
          disabled={loading}
          autoComplete="current-password"
        />
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="mt-5 text-center">
        <Link
          href="/login"
          className="text-sm font-semibold text-brand hover:underline"
        >
          School or admin login
        </Link>
      </div>
    </AuthShell>
  );
}
