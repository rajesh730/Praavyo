"use client";

import { signOut } from "next-auth/react";
import { useParentApp } from "@/components/parent/ParentAppContext";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/parentI18n";
import ParentPushNotifications from "@/components/parent/ParentPushNotifications";
import { detachCurrentParentPushDevice } from "@/lib/client/parentPushSubscription";
import Glyph from "@/components/ui/Glyph";

/**
 * Settings — accessibility, language, data (§8, §22, §23).
 *
 * Simple Parent Mode and the language switch are the two most important
 * controls in the whole app for the target audience, so they sit at the top,
 * above the fold, as large toggles rather than buried in a preferences list.
 */
export default function ParentSettingsPage() {
  const { t, parent, preferences, updatePreferences, childList } =
    useParentApp();

  const signOutSecurely = async () => {
    await detachCurrentParentPushDevice().catch(() => {});
    await signOut({ callbackUrl: "/parent/login" });
  };

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-ink">
        {t("settings.title")}
      </h1>

      {/* --- Language: highly visible, per §8 ----------------------------- */}
      <section className="card p-4">
        <h2 className="font-semibold text-ink">
          {t("settings.language")}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {SUPPORTED_LOCALES.map((locale) => {
            const active = preferences.language === locale;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => updatePreferences({ language: locale })}
                aria-pressed={active}
                className={[
                  "btn btn-secondary transition-colors",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink",
                ].join(" ")}
              >
                {LOCALE_LABELS[locale]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <ToggleRow
          emoji="🔤"
          title={t("settings.simpleMode")}
          description={t("settings.simpleModeHelp")}
          checked={preferences.simpleMode}
          onChange={(value) => updatePreferences({ simpleMode: value })}
        />
        <ToggleRow
          emoji="📶"
          title={t("settings.dataSaver")}
          description={t("settings.dataSaverHelp")}
          checked={preferences.dataSaver}
          onChange={(value) => updatePreferences({ dataSaver: value })}
        />
      </section>

      {/* --- Notification channels ---------------------------------------- */}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold text-ink">
          {t("settings.notifications")}
        </h2>
        <div className="space-y-3">
          <ParentPushNotifications />
          <ToggleRow
            emoji="🔔"
            title="In the app"
            checked={preferences.notifications?.inApp !== false}
            onChange={(value) =>
              updatePreferences({
                notifications: { ...preferences.notifications, inApp: value },
              })
            }
          />
          <ToggleRow
            emoji="✉️"
            title="Email"
            checked={preferences.notifications?.email !== false}
            onChange={(value) =>
              updatePreferences({
                notifications: { ...preferences.notifications, email: value },
              })
            }
          />
          {/* SMS is recorded but not yet delivered — see §21. Labelled so a
              guardian is not misled into relying on it. */}
          <ToggleRow
            emoji="💬"
            title="SMS"
            description="Coming soon"
            checked={Boolean(preferences.notifications?.sms)}
            onChange={(value) =>
              updatePreferences({
                notifications: { ...preferences.notifications, sms: value },
              })
            }
          />
        </div>
      </section>

      {/* --- Calendar ------------------------------------------------------ */}
      <section className="card p-4">
        <h2 className="font-semibold text-ink">Calendar</h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {["BS", "AD"].map((calendar) => {
            const active = preferences.calendarPreference === calendar;
            return (
              <button
                key={calendar}
                type="button"
                onClick={() =>
                  updatePreferences({ calendarPreference: calendar })
                }
                aria-pressed={active}
                className={[
                  "btn btn-secondary transition-colors",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-surface text-ink",
                ].join(" ")}
              >
                {calendar === "BS" ? "बिक्रम सम्वत् (BS)" : "AD"}
              </button>
            );
          })}
        </div>
      </section>

      {/* --- Account ------------------------------------------------------- */}
      <section className="card p-4">
        <p className="break-words font-semibold text-ink">{parent?.name}</p>
        <p className="break-all text-sm text-muted">
          {parent?.email || parent?.phone}
        </p>
        <p className="mt-1 text-xs text-muted">
          {childList.length} {childList.length === 1 ? "child" : "children"}{" "}
          connected
        </p>

        <button
          type="button"
          onClick={() => void signOutSecurely()}
          className="btn btn-secondary mt-4 w-full"
        >
          {t("settings.signOut")}
        </button>
      </section>
    </div>
  );
}

/** A large, obviously-tappable switch row. */
function ToggleRow({ emoji, title, description, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center gap-3 text-left"
    >
      {emoji ? (
        <span aria-hidden="true" className="text-xl">
          <Glyph emoji={emoji} />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">
          {title}
        </span>
        {description ? (
          <span className="block text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className={[
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 h-5 w-5 rounded-full bg-surface transition-colors",
            checked ? "left-6" : "left-1",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
