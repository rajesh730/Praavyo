"use client";

import NoticeManager from "@/components/NoticeManager";

/**
 * Notices from the school to its teachers. They land in each teacher's bell
 * and Notices page and ring their devices; with grades chosen, only the
 * teachers of those grades receive them.
 */
export default function TeacherNoticeManager() {
  return (
    <NoticeManager
      title="Teacher Notices"
      subtitle="Create, publish, edit, and manage notices sent from your school to its teachers."
      fixedAudience="teachers"
    />
  );
}
