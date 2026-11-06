"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Presentation, Trophy } from "lucide-react";
import { useRememberedState } from "@pravyo/ui/rememberedState";

/**
 * Platform Events holds two kinds of Praavyo events: competitions (rounds,
 * results) and trainings (courses Praavyo runs at schools). This switch sits
 * at the top of both the super admin's and the school's Platform Events.
 * `?kind=trainings` in the URL (a training notification's link) opens that kind.
 */
export default function PlatformEventsKindSwitch({ storageKey, competitions, trainings }) {
  const [kind, setKind] = useRememberedState(storageKey, "competitions");
  const linkedKind = useSearchParams().get("kind");

  useEffect(() => {
    if (linkedKind === "trainings" || linkedKind === "competitions") setKind(linkedKind);
  }, [linkedKind, setKind]);

  return (
    <div className="space-y-4">
      <div className="tabs" role="tablist" aria-label="Platform event kind">
        {[
          ["competitions", "Competitions", Trophy],
          ["trainings", "Trainings", Presentation],
        ].map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={kind === value} onClick={() => setKind(value)} className="tab">
            <Icon aria-hidden /> {label}
          </button>
        ))}
      </div>
      {kind === "trainings" ? trainings : competitions}
    </div>
  );
}
