"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import AuthShell, { AuthSessionPanel } from "@/components/auth/AuthShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input, { PasswordInput } from "@/components/ui/Input";
import AlertBanner from "@/components/ui/AlertBanner";
import RoleChooser from "./RoleChooser";
import QrCardScanner from "@/components/parent/QrCardScanner";
import { readTeacherCard } from "@/lib/teacherCard";
import { authErrorMessage } from "@/lib/authErrorMessage";

const AUTH_LINKS = [
  { href: "/events", label: "Events" },
  { href: "/schools", label: "Schools" },
];

function destinationForRole(role) {
  const destinations = {
    SUPER_ADMIN: "/admin/dashboard",
    SCHOOL_ADMIN: "/school/dashboard",
    TEACHER: "/teacher/dashboard",
    STUDENT: "/student/dashboard",
  };
  return destinations[role] || "/school/dashboard";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  // /login shows "who is signing in?" first. ?as=teacher and ?as=school jump
  // straight to the matching form. Both sign in through the same credentials
  // provider; only the wording and the login-card upload differ. Cards printed
  // before the Teacher tile existed link to ?as=school&user=…, so a link that
  // carries a username also opens the teacher form.
  const as = searchParams.get("as");
  const asTeacher = as === "teacher" || (as === "school" && Boolean(searchParams.get("user")));
  const showStaffForm = asTeacher || as === "school";

  // A Teacher Login Card's QR opens /login?as=teacher&user=<username>, and a
  // photo of the card fills the same field. The password is always typed.
  const [email, setEmail] = useState(() => searchParams.get("user") || "");
  const passwordRef = useRef(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { status, data: session } = useSession();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await Promise.race([
        signIn("credentials", {
          email: email.trim(),
          password,
          redirect: false,
        }),
        new Promise((_, reject) =>
          window.setTimeout(
            () => reject(new Error("AUTH_REQUEST_TIMEOUT")),
            20000,
          ),
        ),
      ]);

      if (res.error) {
        setError(authErrorMessage(res.error));
        return;
      }

      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();

      if (sessionData?.user) {
        window.location.assign(destinationForRole(sessionData.user.role));
      } else {
        window.location.assign("/school/dashboard");
      }
    } catch {
      setError("Sign-in is taking too long. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCardPhoto = (raw) => {
    const identifier = readTeacherCard(raw);
    if (!identifier) {
      setError("That QR code is not a Pravyo teacher card.");
      return;
    }
    setError("");
    setEmail(identifier);
    passwordRef.current?.focus();
  };

  if (status === "authenticated") {
    return (
      <AuthShell
        links={AUTH_LINKS}
        title="Already signed in"
        description="This browser already has an active session. Sign out first to use another account, or continue with the current one."
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
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out and use another account
          </Button>
        </div>
      </AuthShell>
    );
  }

  // Everyone lands here first. Sending a parent straight to an email/password
  // form they can never complete was the single biggest sign-in dead end.
  if (!showStaffForm) {
    return (
      <AuthShell
        links={AUTH_LINKS}
        title="Sign in to Praavyo"
        description="Choose how you use Praavyo."
        footer={
          <p className="text-center text-sm text-muted">
            New school?{" "}
            <Link
              href="/register"
              className="font-semibold text-brand hover:underline"
            >
              Register your school
            </Link>
          </p>
        }
      >
        <RoleChooser />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      links={AUTH_LINKS}
      title={asTeacher ? "Teacher sign in" : "School sign in"}
      description={asTeacher ? "Sign in with the username or email your school gave you." : "For school administrators."}
      footer={
        <div className="space-y-3 text-center text-sm text-muted">
          {asTeacher ? (
            <p>Forgot your password? Ask your school office.</p>
          ) : (
            <p>
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-semibold text-brand hover:underline">
                Register your school
              </Link>
            </p>
          )}
          <p>
            <Link href="/login" className="font-semibold text-brand hover:underline">
              ← {asTeacher ? "Not a teacher?" : "Not a school?"} Choose again
            </Link>
          </p>
        </div>
      }
    >
      {error && (
        <div className="mb-4">
          <AlertBanner type="error" message={error} />
        </div>
      )}

      {asTeacher && (
        <div className="mb-4 space-y-2">
          <QrCardScanner
            onDetected={handleCardPhoto}
            cameraLabel="Take a photo of your login card"
            label="Choose a photo of your login card"
            fallbackHint="type your username below"
          />
          <p className="text-center text-xs text-muted">The card fills in your username. You still enter your password.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email or username"
          id="email"
          name="email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter email or username"
          required
          disabled={loading}
          autoComplete="username"
          // Phone keyboards capitalise and "correct" usernames otherwise.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <PasswordInput
          label="Password"
          id="password"
          name="password"
          ref={passwordRef}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          showPassword={showPassword}
          onToggleShow={() => setShowPassword((v) => !v)}
          required
          disabled={loading}
          autoComplete="current-password"
          // Arriving from a scanned card, the password is the only thing left.
          autoFocus={Boolean(searchParams.get("user"))}
        />
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
