"use client";

import { useEffect, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { Music, Trophy } from "lucide-react";
import EventEditorForm from "./EventEditorForm";
import SchoolOwnedEventsManager from "./SchoolOwnedEventsManager";
import ProgramManager from "@/components/programs/ProgramManager";

// School events come in two kinds: competitions (rounds, scores, winners —
// everything below) and performance programs (Dashain, Tihar: no competition,
// a participation certificate for each student who performs).
const KINDS = [
  { id: "competition", label: "Competition", hint: "Rounds, scores and winners", icon: Trophy },
  { id: "performance", label: "Performance program", hint: "Dashain, Tihar… no competition", icon: Music },
];

const SCHOOL_TABS = [
  { id: "hosted", label: "My School Events" },
  { id: "create", label: "Create School Event" },
];

export default function SchoolEventWorkspace() {
  const [teachers, setTeachers] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSection, setActiveSection] = useState("hosted");
  const [kind, setKind] = useRememberedState("school-events:kind", "competition");
  const tabs = SCHOOL_TABS;
  const selectedSection = tabs.some((tab) => tab.id === activeSection)
    ? activeSection
    : tabs[0].id;

  useEffect(() => {
    const loadDependencies = async () => {
      try {
        const teachersRes = await fetch("/api/teachers?limit=200&status=ACTIVE", {
          cache: "no-store",
        });

        if (teachersRes.ok) {
          const teachersData = await teachersRes.json();
          setTeachers(
            Array.isArray(teachersData.teachers) ? teachersData.teachers : []
          );
        } else {
          setTeachers([]);
        }
      } catch (error) {
        console.error("Failed to load school event dependencies", error);
        setTeachers([]);
      }
    };

    loadDependencies();
  }, []);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Event kind" className="grid gap-2 sm:grid-cols-2">
        {KINDS.map(({ id, label, hint, icon: Icon }) => {
          const on = kind === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setKind(id)}
              className={`flex items-center gap-3 rounded-card border p-3 text-left transition-colors ${on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2"}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-control ${on ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>
                <Icon aria-hidden size={20} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {kind === "performance" && <ProgramManager mode="school" teachers={teachers} />}

      {kind === "competition" && selectedSection === "create" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setActiveSection("hosted")}
            className="btn btn-secondary inline-flex items-center justify-center transition-colors"
          >
            Back to school events
          </button>
          <EventEditorForm
            teachers={teachers}
            ownerMode="school"
            onEventCreated={() => {
              setRefreshKey((value) => value + 1);
              setActiveSection("hosted");
            }}
          />
        </div>
      )}

      {kind === "competition" && selectedSection === "hosted" && (
        <SchoolOwnedEventsManager
          teachers={teachers}
          refreshKey={refreshKey}
          onCreate={() => setActiveSection("create")}
          onChanged={() => setRefreshKey((value) => value + 1)}
        />
      )}
    </div>
  );
}
