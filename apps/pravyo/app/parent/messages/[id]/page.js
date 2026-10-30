"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft as FaArrowLeft } from "lucide-react";
import { useParentApp } from "@/components/parent/ParentAppContext";
import ParentChat from "@/components/parent/ParentChat";

/**
 * A specific conversation, reached from a notification deep link.
 *
 * Same chat as the Messages tab — only the back button differs, because the
 * guardian arrived here from somewhere else and needs a way home.
 */
export default function ParentConversationPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, selectedChild } = useParentApp();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/parent/messages")}
          aria-label={t("common.back")}
          className="btn-icon btn-ghost flex items-center justify-center"
        >
          <FaArrowLeft aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-ink">
            {t("messages.title")}
          </h1>
          <p className="truncate text-xs text-muted">
            {selectedChild?.school?.name}
          </p>
        </div>
      </div>

      <ParentChat conversationId={id} />
    </div>
  );
}
