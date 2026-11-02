"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Users } from "lucide-react";
import QrCardScanner, { readParentCard } from "@/components/parent/QrCardScanner";

/**
 * Parent sign-in — the only door into the Parent App.
 *
 * Two ways through it, and nothing else:
 *
 *   🖼️ **Take or choose a photo of the card** — nothing typed.
 *   🔑 **Type the Parent ID** — one field, then Continue.
 *
 * There is no PIN to create, no PIN to remember, no separate "activate your
 * card" journey, and no first-run wizard. The first sign-in and the hundredth
 * are the same three seconds. A guardian who has been handed a card should
 * never be asked to invent a secret before they can see their own child.
 *
 * What that costs is real and is documented in lib/parentCredentials.js: the
 * card is now a key, and whoever holds it can sign in. The school kills a lost
 * one by issuing a new card, which changes the Parent ID.
 *
 * The old email/password form stays behind "Other ways to sign in" — guardians
 * who registered that way are not forced to migrate (§57).
 */
export default function ParentLoginPage() {
  return (
    <Suspense fallback={<Centred text="Loading…" />}>
      <ParentLogin />
    </Suspense>
  );
}

const TEXT = {
  en: {
    welcome: "Welcome",
    intro: "Use the Parent Card your school gave you.",
    parentId: "Parent ID",
    idHint: "The code on your card",
    or: "OR",
    continue: "Continue",
    working: "Please wait…",
    shared: "This phone is shared with others",
    otherWays: "Other ways to sign in",
    backToCard: "Use my Parent Card",
    noCard: "No card yet?",
    askSchool: "Please ask your school office for your Parent Card.",
    notACard: "That code is not a Praavyo Parent Card.",
    failed: "Something went wrong. Please try again.",
    slow: "This is taking too long. Check your internet and try again.",
    takePhoto: "Take a photo of my card",
    choosePhoto: "Choose a photo of my card",
    typeInstead: "type your Parent ID below",
  },
  ne: {
    welcome: "स्वागत छ",
    intro: "विद्यालयले दिएको अभिभावक कार्ड प्रयोग गर्नुहोस्।",
    parentId: "अभिभावक आईडी",
    idHint: "तपाईंको कार्डमा भएको कोड",
    or: "अथवा",
    continue: "अगाडि बढ्नुहोस्",
    working: "कृपया पर्खनुहोस्…",
    shared: "यो फोन अरूसँग साझा छ",
    otherWays: "अन्य तरिकाले साइन इन गर्नुहोस्",
    backToCard: "मेरो अभिभावक कार्ड प्रयोग गर्ने",
    noCard: "कार्ड छैन?",
    askSchool: "कृपया विद्यालयको कार्यालयमा अभिभावक कार्ड माग्नुहोस्।",
    notACard: "यो कोड प्राव्यो अभिभावक कार्ड होइन।",
    failed: "केही गडबड भयो। कृपया फेरि प्रयास गर्नुहोस्।",
    slow: "धेरै समय लाग्यो। इन्टरनेट जाँच गरेर फेरि प्रयास गर्नुहोस्।",
    takePhoto: "कार्डको फोटो खिच्नुहोस्",
    choosePhoto: "कार्डको फोटो छान्नुहोस्",
    typeInstead: "तल अभिभावक आईडी टाइप गर्नुहोस्",
  },
};

function ParentLogin() {
  const searchParams = useSearchParams();
  // A scanned card lands here as a query parameter: `?id=` from a current
  // card, `?t=` from a legacy one redirected via /parent/activate.
  const scannedId = searchParams.get("id");
  const scannedToken = searchParams.get("t");

  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState("CARD");
  const [parentId, setParentId] = useState("");
  const [sharedDevice, setSharedDevice] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = TEXT[language];

  const enter = useCallback(
    async (credentials) => {
      setError("");
      setLoading(true);
      try {
        // Mobile data drops mid-request; without a deadline the button sat on
        // "Please wait…" forever with no way to retry.
        const result = await Promise.race([
          signIn("credentials", {
            loginScope: "parent",
            language,
            deviceMode: sharedDevice ? "SHARED" : "PERSONAL",
            redirect: false,
            ...credentials,
          }),
          new Promise((_, reject) =>
            window.setTimeout(() => reject(new Error("TIMEOUT")), 20000)
          ),
        ]);
        if (result?.error) {
          setError(parentErrorMessage(result.error, TEXT[language]));
          setLoading(false);
          return;
        }
        window.location.assign("/parent");
      } catch (reason) {
        setError(
          reason?.message === "TIMEOUT" ? TEXT[language].slow : TEXT[language].failed
        );
        setLoading(false);
      }
    },
    [language, sharedDevice]
  );

  // A card scanned with the phone's own camera app opens this page directly.
  // Sign the guardian in rather than making them retype what they just scanned.
  // Guarded by a ref so React's double-invoked effects cannot fire two logins.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current) return;
    if (!scannedId && !scannedToken) return;
    autoSubmitted.current = true;

    // Inside an async callback rather than the effect body: signing in is work
    // to be started, not state to be synchronised, and calling it synchronously
    // here would cascade renders.
    (async () => {
      if (scannedToken) {
        await enter({ cardToken: scannedToken });
        return;
      }
      // Fill the field too, so a failure leaves the guardian looking at the ID
      // that did not work rather than an empty box.
      setParentId(scannedId.toUpperCase());
      await enter({ parentId: scannedId });
    })();
  }, [scannedId, scannedToken, enter]);

  const submitCard = (event) => {
    event.preventDefault();
    enter({ parentId: parentId.trim() });
  };

  const submitLegacy = (event) => {
    event.preventDefault();
    enter({ email: identifier.trim(), password });
  };

  const handleScan = (raw) => {
    const card = readParentCard(raw);
    if (!card) {
      setError(t.notACard);
      return;
    }
    if (card.parentId) setParentId(card.parentId);
    enter(card);
  };

  return (
    // `min-h-[100dvh]`, NOT `min-h-screen`. 100vh on a phone is the viewport
    // with the browser chrome HIDDEN — taller than what is actually on screen.
    // With `justify-center` that pushed Continue underneath the address bar,
    // and because the container was exactly one viewport tall there was nothing
    // to scroll to, so the button was unreachable. `dvh` tracks the visible
    // height, so the page fits or scrolls.
    <main className="flex min-h-[100dvh] flex-col justify-center overflow-x-hidden bg-surface-2 px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-7 sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-sm">
        {/* Language first and always visible. A guardian who cannot read the
            screen cannot be asked to choose a language further in. */}
        <div className="mb-4 flex justify-center gap-2">
          {[
            { code: "en", label: "English" },
            { code: "ne", label: "नेपाली" },
          ].map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => setLanguage(option.code)}
              aria-pressed={language === option.code}
              className={[
                "btn btn-ghost transition-colors",
                language === option.code
                  ? "bg-brand text-white"
                  : "border border-line bg-surface text-muted",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mb-7 text-center">
          <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-brand-soft text-2xl text-brand">
            <Users />
          </span>
          <h1 className="mt-3 font-semibold text-ink">
            {t.welcome}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t.intro}
          </p>
        </div>

        {mode === "CARD" ? (
          <>
            <QrCardScanner
              onDetected={handleScan}
              cameraLabel={t.takePhoto}
              label={t.choosePhoto}
              fallbackHint={t.typeInstead}
            />

            <p className="py-4 text-center text-sm font-semibold text-muted">
              {t.or}
            </p>

            <form onSubmit={submitCard} className="space-y-4">
              <div>
                <label
                  htmlFor="parentId"
                  className="block text-base font-semibold text-ink"
                >
                  {t.parentId}
                </label>
                <p className="text-sm text-muted">
                  {t.idHint} — PRV-P-XXXXXX
                </p>
                {/* No autoFocus: on Android it opens the keyboard on arrival,
                    which covers the photo buttons most guardians need. */}
                <input
                  id="parentId"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  maxLength={20}
                  value={parentId}
                  onChange={(event) =>
                    setParentId(event.target.value.toUpperCase())
                  }
                  required
                  placeholder="PRV-P-XXXXXX"
                  className="input mt-2 w-full text-center"
                />
              </div>

              <label className="flex min-h-[48px] items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={sharedDevice}
                  onChange={(event) => setSharedDevice(event.target.checked)}
                  className="h-5 w-5"
                />
                {t.shared}
              </label>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <button
                type="submit"
                disabled={loading || !parentId.trim()}
                className="btn btn-primary w-full"
              >
                {loading ? t.working : t.continue}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={submitLegacy} className="space-y-4">
            <p className="rounded-card bg-brand-soft px-4 py-3 text-sm text-brand-strong">
              For guardians who signed up with an email address or phone number.
            </p>
            <div>
              <label
                htmlFor="identifier"
                className="block text-sm font-semibold text-ink"
              >
                Email or phone number
              </label>
              <input
                id="identifier"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
                className="input mt-1.5 w-full"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-ink"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="input mt-1.5 w-full"
              />
            </div>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? t.working : "Sign in"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "CARD" ? "LEGACY" : "CARD");
            setError("");
          }}
          className="mt-4 min-h-[48px] w-full text-sm font-semibold text-brand"
        >
          {mode === "CARD" ? t.otherWays : t.backToCard}
        </button>

        <div className="card mt-4 p-4 text-center">
          <p className="text-sm font-semibold text-ink">
            {t.noCard}
          </p>
          <p className="mt-1 text-sm text-muted">{t.askSchool}</p>
        </div>
      </div>
    </main>
  );
}

// Server messages that are already written for guardians pass through; codes
// and unexpected failures become a plain "try again".
function parentErrorMessage(code, t) {
  const value = String(code || "");
  if (!value || value === "CredentialsSignin" || /^[A-Z_]+$/.test(value)) return t.failed;
  return value;
}

function ErrorNote({ children }) {
  return (
    <p
      role="alert"
      className="rounded-card bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
    >
      {children}
    </p>
  );
}

function Centred({ text }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-2">
      <p className="text-sm text-muted">{text}</p>
    </main>
  );
}
