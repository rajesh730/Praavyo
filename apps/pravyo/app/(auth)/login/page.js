"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { signOutAndForgetDevice } from "@pravyo/ui/signOutDevice";
import Link from "next/link";
import AuthShell, { AuthSessionPanel } from "@/components/auth/AuthShell";
import Button, { ButtonLink } from "@/components/ui/Button";
import Input, { PasswordInput } from "@/components/ui/Input";
import AlertBanner from "@/components/ui/AlertBanner";
import RoleChooser from "./RoleChooser";
import QrCardScanner from "@/components/parent/QrCardScanner";
import { readTeacherCard, readTeacherCardToken } from "@/lib/teacherCard";
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
    PARENT: "/parent",
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

  // A Teacher Login Card's QR opens /login?as=teacher&card=<token> and signs
  // the teacher straight in; a photo of the card does the same. Username-only
  // cards (?user=) just fill the field and the password is typed.
  const cardToken = asTeacher ? readTeacherCardToken(searchParams.get("card")) : null;
  const [email, setEmail] = useState(() => searchParams.get("user") || "");
  const passwordRef = useRef(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cardAttempted = useRef(false);
  const { status, data: session } = useSession();

  // A scanned teacher card opens inside the installed app, which on a family
  // phone is usually still signed in as the parent. That session must not
  // swallow the card: drop it unless it is already this card's teacher.
  const cardUser = asTeacher && (searchParams.get("user") || cardToken);
  const sameCardTeacher = session?.user?.role === "TEACHER" &&
    (!cardToken || session.user.id === cardToken.split(".")[0]);
  const staleSession = Boolean(cardUser) && status === "authenticated" && !sameCardTeacher;
  useEffect(() => {
    if (!staleSession) return;
    signOut({ redirect: false }).finally(() => window.location.reload());
  }, [staleSession]);

  // This card's teacher is already signed in on this phone: just go in.
  const alreadyIn = Boolean(cardToken) && status === "authenticated" && sameCardTeacher;
  useEffect(() => {
    if (alreadyIn) window.location.replace(destinationForRole("TEACHER"));
  }, [alreadyIn]);

  const finishSignIn = async (credentials) => {
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await Promise.race([
        signIn("credentials", { ...credentials, redirect: false }),
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

  const handleSubmit = (e) => {
    e.preventDefault();
    finishSignIn({ email: email.trim(), password });
  };

  // Arriving from a scanned sign-in card: no form to fill, just sign in.
  useEffect(() => {
    if (!cardToken || status !== "unauthenticated" || cardAttempted.current) return;
    cardAttempted.current = true;
    finishSignIn({ teacherCard: cardToken });
    // finishSignIn is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardToken, status]);

  const handleCardPhoto = (raw) => {
    const card = readTeacherCard(raw);
    if (!card) {
      setError("That QR code is not a Pravyo teacher card.");
      return;
    }
    if (card.card) {
      finishSignIn({ teacherCard: card.card });
      return;
    }
    setError("");
    setEmail(card.user);
    passwordRef.current?.focus();
  };

  if (staleSession || alreadyIn) return null;

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
            onClick={() => signOutAndForgetDevice({ callbackUrl: "/login" })}
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
          <p className="text-center text-xs text-muted">
            {cardToken && loading ? "Signing you in with your card…" : "Your login card signs you in. Older cards fill in your username for you."}
          </p>
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
