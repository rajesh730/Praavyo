"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PrintButton from "@/components/school/PrintButton";
import Glyph from "@/components/ui/Glyph";

/**
 * The printable Parent Summary (§23).
 *
 * A one-page paper snapshot for families who cannot check the app regularly.
 * Deliberately narrow in content: what the child has done this term, the most
 * recent achievement, and anything currently needing the guardian's attention.
 *
 * Nothing private is printed. No Parent ID, no PIN, no contact details, no
 * other guardian's information — a sheet that travels home in a school bag is
 * read by whoever picks it up (§23).
 */
export default function ParentSummaryPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/school/students/${id}/summary`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!active) return;
        if (!res.ok) throw new Error(json.message || "Could not load summary");
        setState({ loading: false, data: json.data, error: "" });
      } catch (err) {
        if (active) setState({ loading: false, data: null, error: err.message });
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  if (state.loading) {
    return (
      <main className="">
        <div className="">
          <div className="h-80 animate-pulse rounded-card bg-line" />
        </div>
      </main>
    );
  }

  if (!state.data) {
    return (
      <main className="">
        <div className="">
          <p className="">Summary not available</p>
          <p className="">{state.error}</p>
        </div>
      </main>
    );
  }

  const { child, counts, recentAchievement, recentWritings, importantNotice } =
    state.data;

  return (
    <main className="">
      <div className="no-print">
        <div>
          <h1 className="">Parent Summary</h1>
          <p className="" style={{ color: "var(--brand-muted)" }}>
            Print and send home with {child.name.split(" ")[0]}.
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="">
        <article className="">
          <header className="">
            <p className="">{child.name}</p>
            <p className="">{child.grade}</p>
            <p className="">{child.schoolName}</p>
          </header>

          <h2 className="">This Term</h2>
          <div className="">
            <div className="">
              🏆 <strong>{counts.achievements}</strong> Achievements
            </div>
            <div className="">
              ✍️ <strong>{counts.writings}</strong> Writings
            </div>
            <div className="">
              🔬 <strong>{counts.research}</strong> Research
            </div>
            <div className="">
              📅 <strong>{counts.events}</strong> Activities
            </div>
          </div>

          {recentAchievement ? (
            <>
              <h2 className="">Recent Achievement</h2>
              <div className="">
                <p className="">
                  <Glyph emoji={recentAchievement.emoji} className="mr-1 inline align-[-2px]" /> {recentAchievement.title}
                </p>
                {recentAchievement.eventTitle ? (
                  <p className="">
                    {recentAchievement.eventTitle}
                  </p>
                ) : null}
                <p className="">
                  {formatDate(recentAchievement.date)}
                </p>
              </div>
            </>
          ) : null}

          {recentWritings.length > 0 ? (
            <>
              <h2 className="">Published Writing</h2>
              {recentWritings.map((writing, index) => (
                <div key={index} className="">
                  <p className="">✍️ {writing.title}</p>
                  <p className="">{formatDate(writing.date)}</p>
                </div>
              ))}
            </>
          ) : null}

          {importantNotice ? (
            <>
              <h2 className="">Important Notice</h2>
              <div className="">
                <p className="">{importantNotice.title}</p>
                <p className="">{importantNotice.preview}</p>
                {importantNotice.actionDeadline ? (
                  <p className="">
                    <strong>By {formatDate(importantNotice.actionDeadline)}</strong>
                  </p>
                ) : null}
                {importantNotice.requiresConsent ? (
                  <p className="">
                    <strong>
                      This needs your permission. Please reply to the school.
                    </strong>
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          <footer className="">
            <p>
              You can see everything about {child.name.split(" ")[0]} in Praavyo.
              If you do not have a Parent Card, please ask the school office.
            </p>
            <p>
              पravyo मा सबै विवरण हेर्न सकिन्छ। कार्ड नभएमा विद्यालयमा
              सम्पर्क गर्नुहोस्।
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
