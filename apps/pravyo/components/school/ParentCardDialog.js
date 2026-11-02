"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { printableOrigin } from "@/lib/siteUrl";
import { cardQrSvg, parentCardUrl, renderCardImage, shareOrDownloadImage } from "@/lib/cardQr";
import { X as FaTimes, Copy as FaCopy, Share2 as FaShareAlt, Printer as FaPrint, Check as FaCheck, ImageDown, LoaderCircle } from "lucide-react";

/**
 * Show a guardian's Parent Access Card on screen.
 *
 * Printing is one option, not the only one. A guardian who lives an hour from
 * the school is not going to collect a piece of paper — the realistic path is a
 * screenshot sent over WhatsApp, so the card is shown large enough to
 * photograph and the Parent ID is one tap from the clipboard.
 *
 * The QR is rendered here rather than fetched, so it can be scanned straight
 * off the screen: hold the parent's phone up to the office monitor and it works.
 *
 * Unlike the version this replaces, nothing here is "shown once" — the card
 * carries only the Parent ID, which is stored in readable form, so staff can
 * reopen this dialog whenever a family mislays their copy. What IS worth saying
 * out loud is that the ID is the whole credential: sending it to the wrong
 * number hands over the child's record.
 */
export default function ParentCardDialog({
  parentIdentifier,
  linkId,
  schoolName,
  studentName,
  guardianName,
  rotated = false,
  onClose,
}) {
  const [qrSvg, setQrSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const usableParentId =
    typeof parentIdentifier === "string" &&
    /^PRV-P-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(parentIdentifier);

  // Whether this device has a native share sheet. Read as external state
  // rather than via an effect — it never changes, and a server snapshot of
  // false keeps hydration stable.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => Boolean(navigator.share),
    () => false
  );

  const siteUrl = typeof window !== "undefined" ? printableOrigin(window.location.origin) : "";
  const loginUrl = parentCardUrl(siteUrl, parentIdentifier);

  useEffect(() => {
    if (!usableParentId) {
      return undefined;
    }

    let active = true;

    cardQrSvg(loginUrl)
      .then((svg) => active && setQrSvg(svg))
      .catch(() => {
        // The ID below is the same credential typed out, so a missing QR is
        // survivable rather than fatal.
      });

    return () => {
      active = false;
    };
  }, [loginUrl, usableParentId]);

  /**
   * Plain text a parent can actually act on, written for a WhatsApp message
   * rather than for a developer. Includes the link so a tap is enough on a
   * phone, and the ID so it still works if the link is stripped.
   */
  const shareText = [
    `${schoolName} — Praavyo Parent Access`,
    "",
    `Child: ${studentName}`,
    `Guardian: ${guardianName}`,
    "",
    `Parent ID: ${parentIdentifier}`,
    "",
    "Open this link to sign in:",
    loginUrl,
    "",
    "Keep this private — it opens your child's record.",
  ].join("\n");

  const copy = async () => {
    if (!usableParentId) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard is blocked in some embedded browsers; the text is on screen
      // and selectable regardless.
    }
  };

  const share = async () => {
    if (!usableParentId) return;
    try {
      await navigator.share({
        title: `Praavyo Parent Access — ${studentName}`,
        text: shareText,
      });
    } catch {
      // The user dismissed the share sheet. Nothing to report.
    }
  };

  /**
   * The card as a sharp picture. A guardian forwarded a photo of a monitor
   * often cannot get the QR to read; a generated image always does, and it is
   * what they will use to sign in on their own phone.
   */
  const sendImage = async () => {
    if (!usableParentId) return;
    setImageBusy(true);
    setImageError("");
    try {
      const blob = await renderCardImage({
        heading: `${schoolName} — PRAVYO PARENT ACCESS`,
        title: studentName,
        lines: [`Guardian: ${guardianName}`],
        qrText: loginUrl,
        codeLabel: "Parent ID / अभिभावक आईडी",
        code: parentIdentifier,
        footer: "Keep this private — it opens your child's record.",
      });
      await shareOrDownloadImage(blob, `parent-card-${parentIdentifier}.png`, `Praavyo Parent Access — ${studentName}`);
    } catch {
      setImageError("The card picture could not be made. Use Copy or Print instead.");
    } finally {
      setImageBusy(false);
    }
  };

  const print = () => {
    window.open(
      `/school/guardians/card?link=${encodeURIComponent(linkId)}`,
      "_blank",
      "noopener"
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Parent access card"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4"
    >
      <div className="mt-5 w-full max-w-md rounded-card bg-surface shadow-pop">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="flex-1 font-semibold text-ink">
            Parent Access — {studentName}
          </h2>
          <button
            type="button"
            onClick={sendImage}
            disabled={!usableParentId || imageBusy || !qrSvg}
            aria-label="Download card as a picture"
            title="Download card as a picture"
            className="btn-icon btn-ghost flex items-center justify-center"
          >
            {imageBusy ? <LoaderCircle className="animate-spin" /> : <ImageDown />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-icon btn-ghost flex items-center justify-center"
          >
            <FaTimes />
          </button>
        </header>

        <div className="px-5 py-5">
          {imageError ? <p role="alert" className="mb-3 text-sm text-danger">{imageError}</p> : null}
          {!usableParentId ? (
            <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              This guardian does not have a valid Parent ID. Close this window
              and try again.
            </p>
          ) : null}

          {rotated ? (
            <p className="rounded-card bg-warning-soft px-4 py-3 text-xs font-semibold text-warning">
              This is a new Parent ID. {guardianName}&apos;s old card no longer
              works and they have been signed out — send them this one.
            </p>
          ) : (
            <p className="rounded-card bg-success-soft px-4 py-3 text-xs font-semibold text-success">
              Send this to {guardianName} — share it, print it, or let them scan
              the code off this screen. You can open this again at any time.
            </p>
          )}

          {/* Big enough to scan straight off the screen, or photograph. */}
          <div className="card mt-4 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {schoolName}
            </p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {studentName}
            </p>
            <p className="text-sm text-muted">Guardian: {guardianName}</p>

            <div
              className="mt-3 flex justify-center [&_svg]:h-52 [&_svg]:w-52"
              dangerouslySetInnerHTML={{
                __html: usableParentId ? qrSvg : "",
              }}
            />

            <div className="card mt-3 px-3 py-2">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                Parent ID
              </p>
              {/* Selectable, so it can be copied by hand if the clipboard
                  API is blocked. */}
              <p className="select-all font-mono text-xl font-semibold text-ink">
                {usableParentId ? parentIdentifier : "Unavailable"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!usableParentId}
              className="btn btn-primary flex items-center justify-center gap-2"
            >
              {copied ? <FaCheck /> : <FaCopy />}
              {copied ? "Copied — paste into WhatsApp" : "Copy for WhatsApp / SMS"}
            </button>

            <div className="grid grid-cols-2 gap-2">
              {/* Only offered where the device actually has a share sheet —
                  a dead button is worse than no button. */}
              {canShare ? (
                <button
                  type="button"
                  onClick={share}
                  disabled={!usableParentId}
                  className="btn btn-secondary flex items-center justify-center gap-2"
                >
                  <FaShareAlt />
                  Share
                </button>
              ) : null}

              <button
                type="button"
                onClick={print}
                className={`btn btn-secondary flex items-center justify-center gap-2 ${
                  canShare ? "" : "col-span-2"
                }`}
              >
                <FaPrint />
                Print
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-2xs leading-relaxed text-muted">
            The Parent ID is the whole sign-in — treat it like a key. Send it
            only to the guardian named above, and check the number first.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost mt-3 w-full"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
