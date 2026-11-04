"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send as FaPaperPlane } from "lucide-react";
import { useParentApp } from "./ParentAppContext";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import {
  parentMessagesChannel,
  MESSAGE_EVENTS,
} from "@/lib/messagingChannels";
import {
  formatParentTime,
  formatDuration,
  formatFileSize,
} from "@/lib/parentFormat";
import Glyph from "@/components/ui/Glyph";
import { withDayBreaks } from "@/lib/messageDays";

/**
 * The guardian's conversation with the school — messages and a composer.
 *
 * Now that a guardian has exactly ONE thread per child, a list screen in front
 * of it was a tap that never told anyone anything: open Messages, see one row,
 * tap it, arrive at the chat. So Messages opens straight into the chat, and
 * this component powers both that and the deep-linked thread page.
 *
 * `conversationId` is optional. Without one it shows the guardian's current
 * thread for the selected child, or an empty chat whose first message starts
 * one — no "new message" step to find.
 */
export default function ParentChat({ conversationId = null, onLoaded }) {
  const { t, selectedChildId, selectedChild, parent, refreshBadges } =
    useParentApp();

  const [state, setState] = useState({
    loading: true,
    error: "",
    conversation: null,
    messages: [],
    topics: [],
  });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Scroll the message list itself, never the page (scrollIntoView would).
  const scrollerRef = useRef(null);

  const load = useCallback(async () => {
    if (!selectedChildId) return;

    try {
      // A specific thread (deep link), or whichever one this child has.
      let id = conversationId;
      let topics = [];

      if (!id) {
        const listRes = await fetch(
          `/api/parent/messages?studentId=${encodeURIComponent(selectedChildId)}`,
          { cache: "no-store" }
        );
        const listJson = await listRes.json();
        if (!listRes.ok) {
          throw new Error(listJson.message || t("common.somethingWrong"));
        }
        topics = listJson.data.topics || [];
        // Most recent first — normally the only one.
        id = listJson.data.conversations[0]?.id || null;
      }

      if (!id) {
        // No thread yet. Show an empty chat rather than a dead end.
        setState({
          loading: false,
          error: "",
          conversation: null,
          messages: [],
          topics,
        });
        onLoaded?.(null);
        return;
      }

      const res = await fetch(`/api/parent/messages/${id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || t("common.somethingWrong"));

      setState({
        loading: false,
        error: "",
        conversation: json.data.conversation,
        messages: json.data.messages,
        topics,
      });
      onLoaded?.(json.data);
      refreshBadges();
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  }, [conversationId, selectedChildId, t, onLoaded, refreshBadges]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages.length]);

  // Live: a reply appears without pulling to refresh, and ✓✓ turns on when the
  // school opens the thread.
  useRealtimeChannel(
    parent?.id ? parentMessagesChannel(parent.id) : "",
    (message) => {
      const payload = message?.payload || message;
      if (
        payload?.type === MESSAGE_EVENTS.NEW_MESSAGE ||
        payload?.type === MESSAGE_EVENTS.THREAD_READ
      ) {
        load();
      }
    },
    { enabled: Boolean(parent?.id) }
  );

  const send = async ({ text = "", attachments = [] }) => {
    const body = text.trim();
    if (!body && attachments.length === 0) return;

    setSending(true);
    try {
      if (state.conversation) {
        const res = await fetch(
          `/api/parent/messages/${state.conversation.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: body, attachments }),
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to send");
      } else {
        // First message starts the thread. The topic only decides where it is
        // routed; a school that has not configured routing gets its office
        // inbox either way, so the guardian is never asked to categorise.
        const topic =
          state.topics.find((entry) => entry.configured)?.topic ||
          state.topics[0]?.topic ||
          "OTHER";

        const res = await fetch("/api/parent/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: selectedChildId,
            topic,
            message: body,
            attachments,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to send");
      }

      setDraft("");
      await load();
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    } finally {
      setSending(false);
    }
  };

  if (state.loading) {
    return <div className="h-80 animate-pulse rounded-card bg-surface-2" />;
  }

  // A hard failure (no messaging permission, revoked access) — say so plainly.
  if (state.error && !state.conversation && state.messages.length === 0) {
    return (
      <div className="rounded-card bg-danger-soft px-4 py-4 text-sm text-danger">
        {state.error}
      </div>
    );
  }

  return (
    <div className="-mx-3 flex h-[calc(100dvh-11.5rem)] flex-col overflow-hidden sm:-mx-4 md:mx-0 md:h-[calc(100dvh-10rem)] md:rounded-card md:border md:border-line">
      {/* Who this conversation is with: the school, about this child. */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">
          {(selectedChild?.school?.name || "S").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{selectedChild?.school?.name || t("messages.title")}</p>
          {selectedChild?.name ? (
            <p className="truncate text-xs text-muted">{t("messages.about", { name: selectedChild.name })}</p>
          ) : null}
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface-2 px-3 pb-0 pt-4 sm:px-4 md:pb-4">
        {state.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-2xl">
              <Glyph emoji="💬" />
            </span>
            <p className="mt-3 font-semibold text-ink">
              {t("messages.empty")}
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              {t("messages.startHint")}
            </p>
          </div>
        ) : (
          withDayBreaks(state.messages).map((item) =>
            item.type === "day" ? (
              <div key={item.key} className="flex items-center gap-3 py-1" role="separator" aria-label={item.label}>
                <span className="h-px flex-1 bg-line" />
                <span className="rounded-full bg-surface px-3 py-0.5 text-2xs font-semibold text-muted shadow-card">{item.label}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : (
              <MessageBubble key={item.key} message={item.message} t={t} />
            )
          )
        )}
        {/* A real spacer, rather than only padding, gives scrollIntoView an
            endpoint above the fixed phone composer. This keeps the newest
            bubble from sitting half-hidden behind the message box. */}
        <div className="h-28 shrink-0 md:h-0" aria-hidden="true" />
      </div>

      {state.error ? (
        <p className="bg-danger-soft px-4 py-2 text-xs text-danger">{state.error}</p>
      ) : null}

      <footer className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface md:static md:z-auto">
        <div className="mx-auto flex max-w-2xl items-end gap-2 p-3">
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter makes a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send({ text: draft });
              }
            }}
            placeholder={t("messages.typeMessage")}
            className="input max-h-32 flex-1 resize-none"
          />

          <button
            type="button"
            onClick={() => send({ text: draft })}
            disabled={sending || !draft.trim()}
            aria-label={t("messages.send")}
            className="btn-icon btn-primary flex shrink-0 items-center justify-center"
          >
            <FaPaperPlane aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message, t }) {
  const mine = message.mine;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "min-w-0 max-w-[88%] overflow-hidden rounded-card px-3.5 py-2.5 sm:max-w-[80%]",
          mine
            ? "rounded-br-control bg-brand text-white"
            : "card text-ink",
        ].join(" ")}
      >
        {!mine && message.senderName ? (
          <p className="mb-0.5 text-2xs font-semibold text-brand">
            {message.senderName}
          </p>
        ) : null}

        {/* The school's headline, when this message is an announcement.
            Set apart from the body with weight and a rule rather than only
            size: a guardian skimming a long thread needs to find "Sports day"
            without reading three paragraphs, and §7's status rules mean type
            alone must carry the distinction — it cannot rely on colour. */}
        {message.subject ? (
          <p
            className={[
              "mb-1.5 border-b pb-1 text-base font-semibold leading-snug",
              mine
                ? "border-line"
                : "border-line text-ink",
            ].join(" ")}
          >
            {message.subject}
          </p>
        ) : null}

        {message.attachments?.map((attachment, index) => (
          <Attachment key={index} attachment={attachment} mine={mine} t={t} />
        ))}

        {message.body ? (
          <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
            {message.body}
          </p>
        ) : null}

        <p
          className={[
            "mt-1 text-right text-2xs",
            mine ? "text-white" : "text-muted",
          ].join(" ")}
        >
          {formatParentTime(message.createdAt)}
          {mine ? ` · ${message.readByStaff ? `✓✓ ${t("messages.read")}` : t("messages.sent")}` : ""}
        </p>
      </div>
    </div>
  );
}

function Attachment({ attachment, mine, t }) {
  if (attachment.kind === "VOICE") {
    return (
      <div className="mb-1.5">
        <audio
          controls
          preload="none"
          src={attachment.url}
          className="w-56 max-w-full"
        >
          {t("messages.voiceMessage")}
        </audio>
        {attachment.durationSeconds ? (
          <p
            className={`text-2xs ${mine ? "text-white" : "text-muted"}`}
          >
            {formatDuration(attachment.durationSeconds)}
          </p>
        ) : null}
      </div>
    );
  }

  if (attachment.kind === "IMAGE") {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1.5 block"
      >
        {/* Arbitrary uploaded URL — the image optimiser is not configured for
            these hosts. Same approach as elsewhere in the app. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.thumbnailUrl || attachment.url}
          alt={attachment.name || t("messages.photo")}
          loading="lazy"
          decoding="async"
          className="max-h-56 w-full rounded-card object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "btn btn-ghost mb-1.5 flex items-center gap-2 font-medium",
        mine ? "bg-surface" : "bg-surface-2",
      ].join(" ")}
    >
      <Glyph emoji="📎" />
      <span className="min-w-0 flex-1 truncate">
        {attachment.name || t("messages.document")}
      </span>
      {attachment.sizeBytes ? (
        <span className="shrink-0 text-2xs opacity-70">
          {formatFileSize(attachment.sizeBytes)}
        </span>
      ) : null}
    </a>
  );
}
