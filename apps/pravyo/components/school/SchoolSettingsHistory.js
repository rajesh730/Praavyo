"use client";

import { useEffect, useState } from "react";
import { Clock as FiClock } from "lucide-react";
import SettingsAuditPanel from "@/components/settings/SettingsAuditPanel";

export default function SchoolSettingsHistory() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/school/settings/audit", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to load settings history");
        }
        if (active) setEntries(data.data || []);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Failed to load settings history");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line-strong bg-ink p-4 sm:p-5">
        <h1 className="flex items-center gap-3 font-semibold text-white">
          <FiClock className="text-brand" />
          History
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-subtle">
          Review changes made to your school profile, contact information, and
          settings.
        </p>
      </div>

      {error ? (
        <div className="rounded-card border border-danger-line bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      ) : (
        <SettingsAuditPanel
          title="Recent Changes"
          description="Recent school settings updates help you track profile and configuration changes."
          entries={entries}
          loading={loading}
        />
      )}
    </div>
  );
}
