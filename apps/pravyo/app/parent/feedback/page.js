"use client";

import { useParentApp } from "@/components/parent/ParentAppContext";
import FeedbackForm from "@/components/feedback/FeedbackForm";

/**
 * A parent's feedback to the school of the child they have selected. The
 * school reads it in its Feedback inbox.
 */
export default function ParentFeedbackPage() {
  const { t, selectedChildId, selectedChild } = useParentApp();
  if (!selectedChildId) return null;

  return (
    <div className="space-y-3">
      <h1 className="font-semibold text-ink">{t("feedback.title")}</h1>
      <p className="text-sm text-muted">
        {t("feedback.about", { name: selectedChild?.name || "", school: selectedChild?.school?.name || "" })}
      </p>
      <FeedbackForm
        key={selectedChildId}
        audience="parent"
        studentId={selectedChildId}
        schoolName={selectedChild?.school?.name || ""}
      />
    </div>
  );
}
