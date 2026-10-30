"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, KeyRound, Printer, X } from "lucide-react";
import { teacherCardUrl } from "@/lib/teacherCard";

/**
 * A teacher's login card on screen, like the Parent Access Card.
 *
 * The QR carries only the username (or email), so it fills the sign-in form
 * and the teacher still types a password. Passwords are stored hashed and can
 * never be shown again; "Reset password" issues a new one and shows it once.
 */
export default function TeacherLoginCardDialog({ teacher, onClose }) {
  const identifier = teacher.username || teacher.email;
  const [qrSvg, setQrSvg] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toString(teacherCardUrl(window.location.origin, identifier), {
      type: "svg", errorCorrectionLevel: "M", margin: 1, width: 220,
      color: { dark: "#000000", light: "#ffffff" },
    }).then((svg) => active && setQrSvg(svg)).catch(() => {});
    return () => { active = false; };
  }, [identifier]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const resetPassword = async () => {
    if (!window.confirm(`Reset ${teacher.name}'s password?\n\nTheir current password will stop working immediately.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/teachers/${teacher._id}/password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Password could not be reset.");
      setPassword(payload.data.credentials.password);
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
      `Sign in: ${window.location.origin}/login?as=teacher`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`${teacher.name} login card`}>
      <div className="modal-panel max-w-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{teacher.name}</h2>
            <p className="text-sm text-muted">Teacher login card</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="btn-icon btn-ghost" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="mt-4 flex flex-col items-center rounded-card border border-line bg-white p-4 text-black">
          <div
            className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full"
            // Generated locally by the qrcode package from our own URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 text-center text-xs">Sign in → Teacher → Upload a photo of your login card</p>
        </div>

        <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted">Username</dt><dd className="break-all font-mono text-ink">{teacher.username || "—"}</dd>
          <dt className="text-muted">Email</dt><dd className="break-all font-mono text-ink">{teacher.email}</dd>
          <dt className="text-muted">Password</dt>
          <dd className="font-mono text-ink">
            {password ? <span className="break-all">{password}</span> : <span className="font-sans text-xs text-muted">Hidden for security. Reset to issue a new one.</span>}
          </dd>
        </dl>
        {password && <p className="mt-2 rounded-control bg-success-soft px-3 py-2 text-xs text-ink">New password shown only now. Copy it and give it to {teacher.name}.</p>}
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
