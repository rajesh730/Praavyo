"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ImageDown, KeyRound, LoaderCircle, Printer, X } from "lucide-react";
import { cardQrSvg, renderCardImage, shareOrDownloadImage } from "@/lib/cardQr";
import { teacherCardTokenUrl, teacherCardUrl } from "@/lib/teacherCard";
import { printableOrigin } from "@/lib/siteUrl";

/**
 * A teacher's login card on screen, like the Parent Access Card.
 *
 * Scanning the QR signs the teacher straight in (see lib/teacherCard.js); a
 * teacher who also works elsewhere gets a username-only QR. Passwords are
 * stored hashed and never shown again; "Reset password" sets a new one, shows
 * it once, and retires every card printed before.
 */
export default function TeacherLoginCardDialog({ teacher, onClose }) {
  const identifier = teacher.username || teacher.email;
  const [qrSvg, setQrSvg] = useState("");
  // undefined while loading, null for a username-only card.
  const [cardToken, setCardToken] = useState(undefined);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/teachers/${teacher._id}/card`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => active && setCardToken(payload.data.cardToken || null))
      .catch(() => active && setError("The login card could not be loaded. Close and try again."));
    return () => { active = false; };
  }, [teacher._id]);

  const cardUrl = cardToken === undefined || typeof window === "undefined"
    ? ""
    : cardToken
      ? teacherCardTokenUrl(printableOrigin(window.location.origin), cardToken)
      : teacherCardUrl(printableOrigin(window.location.origin), identifier);

  useEffect(() => {
    if (!cardUrl) return undefined;
    let active = true;
    cardQrSvg(cardUrl).then((svg) => active && setQrSvg(svg)).catch(() => {});
    return () => { active = false; };
  }, [cardUrl]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const resetPassword = async () => {
    if (!window.confirm(`Reset ${teacher.name}'s password to password@123?\n\nTheir current password and every printed login card will stop working immediately.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/teachers/${teacher._id}/password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Password could not be reset.");
      setPassword(payload.data.credentials.password);
      if (payload.data.cardToken) setCardToken(payload.data.cardToken);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    const text = [
      "Pravyo teacher login",
      `Username: ${teacher.username || "—"}`,
      `Email: ${teacher.email}`,
      password ? `Password: ${password}` : "Password: the one your school gave you",
      `Sign in: ${printableOrigin(window.location.origin)}/login?as=teacher`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  };

  // A sharp picture of the card for WhatsApp — the password is never on it.
  const sendImage = async () => {
    setImageBusy(true);
    setError("");
    try {
      const blob = await renderCardImage({
        heading: "PRAVYO TEACHER LOGIN",
        title: teacher.name,
        lines: [cardToken ? "Scan with your phone camera to sign in" : "Sign in → Teacher → Take a photo of your login card"],
        qrText: cardUrl,
        codeLabel: "Username",
        code: identifier,
        footer: cardToken ? "Keep this card private: it signs you in." : "You still need your password to sign in.",
      });
      await shareOrDownloadImage(blob, `teacher-login-${identifier}.png`, `${teacher.name} — login card`);
    } catch {
      setError("The card picture could not be made. Use Print card instead.");
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`${teacher.name} login card`}>
      <div className="modal-panel max-w-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{teacher.name}</h2>
            <p className="text-sm text-muted">Teacher login card</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={sendImage} disabled={imageBusy || !qrSvg} className="btn-icon btn-ghost" aria-label="Download card as a picture" title="Download card as a picture">
              {imageBusy ? <LoaderCircle size={16} className="animate-spin" /> : <ImageDown size={16} />}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="btn-icon btn-ghost" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center rounded-card border border-line bg-white p-4 text-black">
          <div
            className="h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
            // Generated locally by the qrcode package from our own URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 text-center text-xs">
            {cardToken ? "Scan with the phone camera to sign in. Keep this card private." : "Sign in → Teacher → Take a photo of your login card"}
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted">Username</dt><dd className="break-all font-mono text-ink">{teacher.username || "—"}</dd>
          <dt className="text-muted">Email</dt><dd className="break-all font-mono text-ink">{teacher.email}</dd>
          <dt className="text-muted">Password</dt>
          <dd className="font-mono text-ink">
            {password ? <span className="break-all">{password}</span> : <span className="font-sans text-xs text-muted">Hidden for security. Reset to issue a new one.</span>}
          </dd>
        </dl>
        {password && <p className="mt-2 rounded-control bg-success-soft px-3 py-2 text-xs text-ink">New password shown only now. Older printed cards no longer work — give {teacher.name} this new card.</p>}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy login"}
          </button>
          <a href={`/school/teachers/card?id=${teacher._id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Printer size={14} /> Print card
          </a>
          {teacher.worksElsewhere ? (
            <p className="w-full text-xs text-muted">This teacher also works at another school, so only they can change their password.</p>
          ) : (
            <button type="button" onClick={resetPassword} disabled={busy} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
              <KeyRound size={14} /> {busy ? "Resetting..." : "Reset password"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
