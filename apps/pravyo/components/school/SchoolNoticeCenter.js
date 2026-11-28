"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Inbox, Megaphone } from "lucide-react";
import NoticeManager from "@/components/NoticeManager";
import SchoolNoticeBoard from "@/components/school/SchoolNoticeBoard";
import useWorkIndicators from "@/lib/client/useWorkIndicators";

/**
 * Notices — the school's one place for every notice (Dashboard → Notices,
 * `?tab=notices`). It replaced the separate Student Notices, Teacher Notices
 * and Received Notices screens and the event pages' Notices tab:
 *
 *   School notices — write, edit, archive, drafts and publish; send to
 *                    Students, Teachers and/or Parents, everyone in chosen
 *                    grades or only chosen families, with read receipts for
 *                    parents. Event announcements are written here too
 *                    (type "Event"). Same Notice records and API as before.
 *   Received       — what Praavyo, event teams and the magazine desk send to
 *                    the school (read only).
 *
 * Students, teachers and parents still read notices where they always have.
 * Parent Messages (chat and group messages) is a separate channel and was
 * not changed.
 *
 * URL: `section` = school | received; `audience` presets the School notices
 * filter (old Student/Teacher Notices links).
 */
const SECTIONS = [
  { id: "school", label: "School notices", icon: Megaphone },
  { id: "received", label: "Received", icon: Inbox },
];

export default function SchoolNoticeCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams?.get("section") || "";
  const section = SECTIONS.some((item) => item.id === requested) ? requested : "school";
  const audience = ["students", "teachers", "parents"].includes(searchParams?.get("audience"))
    ? searchParams.get("audience")
    : "";
  const { getCount } = useWorkIndicators();
  const unreadReceived = getCount("school.receivedNotices");

  const open = (next) => {
    router.replace(`/school/dashboard?tab=notices&section=${next}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="card p-2">
        <div className="tabs w-full overflow-x-auto" role="tablist" aria-label="Notice sections">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                onClick={() => open(item.id)}
                className="tab whitespace-nowrap"
              >
                <Icon aria-hidden /> {item.label}
                {item.id === "received" && unreadReceived > 0 && (
                  <span className="count-badge">{unreadReceived}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {section === "school" && (
        <NoticeManager
          title="School notices"
          subtitle="Write once and choose who receives it: students, teachers, parents, or all three. Send to everyone in the chosen grades, or only to chosen families."
          initialAudience={audience}
        />
      )}
      {section === "received" && <SchoolNoticeBoard />}
    </div>
  );
}
