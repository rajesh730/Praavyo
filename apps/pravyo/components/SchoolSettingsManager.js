"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { signOutAndForgetDevice } from "@pravyo/ui/signOutDevice";
import { CircleAlert as FiAlertCircle, BookOpen as FiBookOpen, CircleCheck as FiCheckCircle, Lock as FiLock, Mail as FiMail, RotateCcw as FiRotateCcw, Save as FiSave, Settings as FiSettings } from "lucide-react";
import AcademicYearManager from "@/components/school/AcademicYearManager";
import CalendarToggle from "@/components/common/CalendarToggle";
import WebsiteApiKeysPanel from "@/components/settings/WebsiteApiKeysPanel";
import ReportCardImagesPanel from "@/components/settings/ReportCardImagesPanel";
import IemisSettingsPanel from "@/components/settings/IemisSettingsPanel";
import SchoolMapField from "@/components/settings/SchoolMapField";
import DevicePushBanner from "@/components/notifications/DevicePushBanner";
import { parseGoogleMapEmbed } from "@/lib/googleMapEmbed";

const defaultConfig = {
  schoolName: "",
  schoolCode: "",
  iemisNumber: "",
  email: "",
  phone: "",
  principalPhone: "",
  address: "",
  mapEmbedUrl: "",
  city: "",
  state: "",
  pincode: "",
  principalName: "",
  website: "",
  establishedYear: "",
  totalStudents: 0,
  totalTeachers: 0,
  totalGrades: 0,
  grades: [],
};

function StatCard({ label, value, description }) {
  return (
    <div className="rounded-card border border-line-strong bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

const SETTINGS_TABS = [
  { id: "profile", label: "School Profile" },
  { id: "academic", label: "Academic Setup" },
  { id: "security", label: "Security" },
];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function getSanitizedConfig(config) {
  return {
    ...config,
    schoolName: String(config.schoolName || "").trim(),
    schoolCode: String(config.schoolCode || "").trim(),
    iemisNumber: String(config.iemisNumber || "").trim().toUpperCase(),
    email: String(config.email || "").trim().toLowerCase(),
    phone: String(config.phone || "").trim(),
    principalPhone: String(config.principalPhone || "").trim(),
    address: String(config.address || "").trim(),
    mapEmbedUrl: String(config.mapEmbedUrl || "").trim(),
    city: String(config.city || "").trim(),
    state: String(config.state || "").trim(),
    pincode: String(config.pincode || "").trim(),
    principalName: String(config.principalName || "").trim(),
    website: String(config.website || "").trim(),
    establishedYear: String(config.establishedYear || "").trim(),
  };
}

function hasChanged(current, saved, field) {
  return JSON.stringify(current[field]) !== JSON.stringify(saved[field]);
}

function buildSettingsPatch(current, saved) {
  const identity = {};
  const config = {};
  const identityFields = [
    "schoolName",
    "principalName",
    "principalPhone",
    "email",
    "phone",
    "address",
    "mapEmbedUrl",
    "website",
    "establishedYear",
  ];
  // The IEMIS number is edited and saved in its own section
  // (IemisSettingsPanel), never through this form.
  const configFields = [
    "schoolCode",
    "city",
    "state",
    "pincode",
  ];

  identityFields.forEach((field) => {
    if (hasChanged(current, saved, field)) identity[field] = current[field];
  });
  configFields.forEach((field) => {
    if (hasChanged(current, saved, field)) config[field] = current[field];
  });

  return { identity, config };
}

export default function SchoolSettingsManager() {
  const { update: updateSession } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [passwordMessage, setPasswordMessage] = useState({ type: "", text: "" });
  const [config, setConfig] = useState(defaultConfig);
  const [savedConfig, setSavedConfig] = useState(defaultConfig);
  const [activeSettingsTab, setActiveSettingsTab] = useState("profile");
  const [reportCard, setReportCard] = useState({ logoUrl: "", imageUrl: "" });
  const [isDirty, setIsDirty] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetchSchoolConfig();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const fetchSchoolConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/school/settings", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load settings");
      }

      const payload = data.data || {};
      const identity = payload.identity || {};
      const settingsConfig = payload.config || {};
      const stats = payload.stats || {};
      setReportCard({
        logoUrl: payload.reportCard?.logoUrl || "",
        imageUrl: payload.reportCard?.imageUrl || "",
      });
      setConfig({
        schoolName: identity.schoolName || "",
        schoolCode: settingsConfig.schoolCode || "",
        iemisNumber: settingsConfig.iemisNumber || "",
        email: identity.email || "",
        phone: identity.phone || "",
        principalPhone: identity.principalPhone || "",
        address: identity.address || "",
        mapEmbedUrl: identity.mapEmbedUrl || "",
        city: settingsConfig.city || "",
        state: settingsConfig.state || "",
        pincode: settingsConfig.pincode || "",
        principalName: identity.principalName || "",
        website: identity.website || "",
        establishedYear: identity.establishedYear || "",
        totalStudents: stats.totalStudents || 0,
        totalTeachers: stats.totalTeachers || 0,
        totalGrades: stats.totalGrades || 0,
        grades: settingsConfig.grades || [],
      });
      setSavedConfig({
        schoolName: identity.schoolName || "",
        schoolCode: settingsConfig.schoolCode || "",
        iemisNumber: settingsConfig.iemisNumber || "",
        email: identity.email || "",
        phone: identity.phone || "",
        principalPhone: identity.principalPhone || "",
        address: identity.address || "",
        mapEmbedUrl: identity.mapEmbedUrl || "",
        city: settingsConfig.city || "",
        state: settingsConfig.state || "",
        pincode: settingsConfig.pincode || "",
        principalName: identity.principalName || "",
        website: identity.website || "",
        establishedYear: identity.establishedYear || "",
        totalStudents: stats.totalStudents || 0,
        totalTeachers: stats.totalTeachers || 0,
        totalGrades: stats.totalGrades || 0,
        grades: settingsConfig.grades || [],
      });
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to fetch school config:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setIsDirty(true);
    setConfig((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const updatePasswordForm = (name, value) => {
    setPasswordMessage({ type: "", text: "" });
    setPasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const discardChanges = async () => {
    if (!window.confirm("Discard your unsaved changes?")) return;
    try {
      setLoading(true);
      setMessage({ type: "", text: "" });
      await fetchSchoolConfig();
    } catch (error) {
      console.error("Failed to discard school settings changes:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const sanitizedConfig = getSanitizedConfig(config);

      const sanitizedSavedConfig = getSanitizedConfig(savedConfig);
      const payload = buildSettingsPatch(
        sanitizedConfig,
        sanitizedSavedConfig
      );

      if (
        payload.identity.schoolName !== undefined &&
        !payload.identity.schoolName
      ) {
        setMessage({ type: "error", text: "School name is required." });
        setSaving(false);
        return;
      }

      if (
        payload.identity.email !== undefined &&
        !isValidEmail(payload.identity.email)
      ) {
        setMessage({
          type: "error",
          text: "Official email must be a valid email address.",
        });
        setSaving(false);
        return;
      }

      if (
        payload.identity.website &&
        !isValidUrl(payload.identity.website)
      ) {
        setMessage({
          type: "error",
          text: "Website must start with http:// or https://",
        });
        setSaving(false);
        return;
      }

      if (payload.identity.mapEmbedUrl !== undefined) {
        const { url, error: mapError } = parseGoogleMapEmbed(
          payload.identity.mapEmbedUrl
        );
        if (mapError) {
          setMessage({ type: "error", text: mapError });
          setSaving(false);
          return;
        }
        payload.identity.mapEmbedUrl = url;
      }

      if (payload.identity.establishedYear) {
        const year = Number(payload.identity.establishedYear);
        const currentYear = new Date().getFullYear();
        if (!Number.isInteger(year) || year < 1800 || year > currentYear) {
          setMessage({
            type: "error",
            text: "Established year must be a valid year.",
          });
          setSaving(false);
          return;
        }
      }

      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save settings");
      }

      const savedIdentity = data.data?.identity || {};
      const savedSettings = data.data?.config || {};
      const persistedConfig = {
        ...sanitizedConfig,
        email: savedIdentity.email ?? sanitizedConfig.email,
        mapEmbedUrl: savedIdentity.mapEmbedUrl ?? sanitizedConfig.mapEmbedUrl,
        establishedYear:
          savedIdentity.establishedYear ?? sanitizedConfig.establishedYear,
        schoolCode: savedSettings.schoolCode ?? sanitizedConfig.schoolCode,
        iemisNumber: savedSettings.iemisNumber ?? sanitizedConfig.iemisNumber,
        city: savedSettings.city ?? sanitizedConfig.city,
        state: savedSettings.state ?? sanitizedConfig.state,
        pincode: savedSettings.pincode ?? sanitizedConfig.pincode,
      };

      const changedSections = [];
      if (
        JSON.stringify({
          schoolName: savedConfig.schoolName,
          principalName: savedConfig.principalName,
          principalPhone: savedConfig.principalPhone,
          email: savedConfig.email,
          website: savedConfig.website,
          establishedYear: savedConfig.establishedYear,
          schoolCode: savedConfig.schoolCode,
          iemisNumber: savedConfig.iemisNumber,
        }) !==
        JSON.stringify({
          schoolName: sanitizedConfig.schoolName,
          principalName: sanitizedConfig.principalName,
          principalPhone: sanitizedConfig.principalPhone,
          email: sanitizedConfig.email,
          website: sanitizedConfig.website,
          establishedYear: sanitizedConfig.establishedYear,
          schoolCode: sanitizedConfig.schoolCode,
          iemisNumber: sanitizedConfig.iemisNumber,
        })
      ) {
        changedSections.push("School Profile");
      }
      if (
        JSON.stringify({
          phone: savedConfig.phone,
          address: savedConfig.address,
          mapEmbedUrl: savedConfig.mapEmbedUrl,
          city: savedConfig.city,
          state: savedConfig.state,
          pincode: savedConfig.pincode,
        }) !==
        JSON.stringify({
          phone: sanitizedConfig.phone,
          address: sanitizedConfig.address,
          mapEmbedUrl: sanitizedConfig.mapEmbedUrl,
          city: sanitizedConfig.city,
          state: sanitizedConfig.state,
          pincode: sanitizedConfig.pincode,
        })
      ) {
        changedSections.push("Contact & Location");
      }

      setConfig(persistedConfig);
      setSavedConfig({
        ...savedConfig,
        ...persistedConfig,
      });
      setIsDirty(false);
      setMessage({
        type: "success",
        text:
          changedSections.length > 0
            ? `${changedSections.join(", ")} saved successfully.`
            : "School settings saved successfully.",
      });
      if (
        payload.identity.schoolName !== undefined ||
        payload.identity.email !== undefined
      ) {
        await updateSession();
      }
    } catch (error) {
      console.error("Error saving school config:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const currentPassword = String(passwordForm.currentPassword || "");
      const newPassword = String(passwordForm.newPassword || "");
      const confirmPassword = String(passwordForm.confirmPassword || "");

      if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordMessage({
          type: "error",
          text: "Current password, new password, and confirmation are required.",
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordMessage({
          type: "error",
          text: "New password and confirmation do not match.",
        });
        return;
      }

      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
        setPasswordMessage({
          type: "error",
          text: "New password must be at least 8 characters and include a letter and a number.",
        });
        return;
      }

      setPasswordSaving(true);
      setPasswordMessage({ type: "", text: "" });

      const res = await fetch("/api/school/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to change password");
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordMessage({
        type: "success",
        text: "Password updated. Signing you out to protect the account.",
      });

      setTimeout(() => {
        signOutAndForgetDevice({ callbackUrl: "/login" });
      }, 900);
    } catch (error) {
      console.error("Failed to change school password:", error);
      setPasswordMessage({ type: "error", text: error.message });
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-subtle">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
        <h1 className="flex items-center gap-3 font-semibold text-ink">
          <FiSettings className="text-brand" />
          School Settings
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-subtle">
          School identity, contact information and academic setup. Teachers and
          their responsibilities are managed in the Teachers section.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="School settings sections"
        className="flex gap-2 overflow-x-auto rounded-card border border-line-strong bg-surface p-2"
      >
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeSettingsTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            onClick={() => setActiveSettingsTab(tab.id)}
            className={`btn whitespace-nowrap font-semibold ${
              activeSettingsTab === tab.id
                ? "btn-primary"
                : "btn-secondary border-line bg-surface text-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSettingsTab === "academic" && (
      <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Date display</h2>
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          Choose how dates appear across your account. Nepali shows every date
          in Bikram Sambat, fully in Nepali — month and weekday names and
          Nepali digits — and calendars open on the Nepali month with Saturday
          marked as the holiday. Applies only to what you see; report cards
          keep their printed format.
        </p>
        <CalendarToggle variant="cards" className="mt-4 max-w-2xl" />
      </div>
      )}

      {activeSettingsTab === "academic" && (
        <div className="max-w-3xl">
          {/* Turn on, check, or test phone/laptop notifications. */}
          <DevicePushBanner role="SCHOOL_ADMIN" variant="card" />
        </div>
      )}

      {message.text && (
        <div
          className={`flex items-center gap-3 rounded-card border p-4 text-sm ${
            message.type === "success"
              ? "border-success-line bg-success-soft text-success"
              : "border-danger-line bg-danger-soft text-danger"
          }`}
        >
          {message.type === "success" ? <FiCheckCircle /> : <FiAlertCircle />}
          <span>{message.text}</span>
        </div>
      )}

      {isDirty && (
        <div className="rounded-card border border-warning-line bg-warning-soft p-4 text-sm text-warning">
          You have unsaved changes. Leaving or refreshing the page now will
          discard your school settings edits.
        </div>
      )}

      {activeSettingsTab === "profile" && (
        <IemisSettingsPanel
          value={savedConfig.iemisNumber}
          onSaved={(iemisNumber) => {
            setConfig((current) => ({ ...current, iemisNumber }));
            setSavedConfig((current) => ({ ...current, iemisNumber }));
          }}
        />
      )}

      {activeSettingsTab === "profile" && (
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Students"
          value={config.totalStudents}
          description="Managed student records in this school workspace."
        />
        <StatCard
          label="Teachers"
          value={config.totalTeachers}
          description="Current teachers at this school (active and inactive)."
        />
        <StatCard
          label="Grades"
          value={config.totalGrades}
          description="Grade bands derived from the school registration profile."
        />
      </div>
      )}

      {activeSettingsTab === "academic" && <AcademicYearManager />}

      <div className="space-y-4">
        {activeSettingsTab === "profile" && (
        <section id="settings-panel-profile" role="tabpanel" aria-labelledby="settings-tab-profile" className="space-y-4">
          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiBookOpen className="text-brand" />
              School Profile
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  School name
                </label>
                <input
                  type="text"
                  name="schoolName"
                  value={config.schoolName}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  School code
                </label>
                <input
                  type="text"
                  name="schoolCode"
                  value={config.schoolCode}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Principal name
                </label>
                <input
                  type="text"
                  name="principalName"
                  value={config.principalName}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Principal phone
                </label>
                <input
                  type="tel"
                  name="principalPhone"
                  value={config.principalPhone}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Official email
                </label>
                <input
                  type="email"
                  name="email"
                  value={config.email}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Website
                </label>
                <input
                  type="text"
                  name="website"
                  value={config.website}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Established year
                </label>
                <input
                  type="number"
                  name="establishedYear"
                  value={config.establishedYear}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          <ReportCardImagesPanel logoUrl={reportCard.logoUrl} imageUrl={reportCard.imageUrl} />

          <div id="settings-panel-academic" role="tabpanel" aria-labelledby="settings-tab-academic" className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiMail className="text-warning" />
              Contact & Location
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={config.phone}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Pin code
                </label>
                <input
                  type="text"
                  name="pincode"
                  value={config.pincode}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={config.address}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div className="md:col-span-2">
                <SchoolMapField
                  value={config.mapEmbedUrl}
                  onChange={(value) => {
                    setIsDirty(true);
                    setConfig((prev) => ({ ...prev, mapEmbedUrl: value }));
                  }}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  City
                </label>
                <input
                  type="text"
                  name="city"
                  value={config.city}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  State
                </label>
                <input
                  type="text"
                  name="state"
                  value={config.state}
                  onChange={handleChange}
                  className="input w-full"
                />
              </div>
            </div>
          </div>
        </section>
        )}

        <section className="space-y-4">
          {activeSettingsTab === "academic" && (
          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-4 font-semibold text-ink">
              Academic Snapshot
            </h2>
            {config.grades.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.grades.map((grade) => (
                  <span
                    key={grade}
                    className="badge badge-neutral text-xs"
                  >
                    {grade}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No grade structure is available yet from registration data.
              </p>
            )}
          </div>
          )}

          {activeSettingsTab === "security" && (
          <>
            <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiLock className="text-brand" />
              Change Password
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      updatePasswordForm("currentPassword", event.target.value)
                    }
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">
                    New password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      updatePasswordForm("newPassword", event.target.value)
                    }
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      updatePasswordForm("confirmPassword", event.target.value)
                    }
                    className="input w-full"
                  />
                </div>
              </div>

              <p className="text-xs text-muted">
                Use at least 8 characters with at least one letter and one
                number. After changing your password, the current session will
                be closed and you will sign in again with the new password.
              </p>

              {passwordMessage.text ? (
                <div
                  className={`rounded-card border px-4 py-3 text-sm ${
                    passwordMessage.type === "success"
                      ? "border-success-line bg-success-soft text-success"
                      : "border-danger-line bg-danger-soft text-danger"
                  }`}
                >
                  {passwordMessage.text}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={passwordSaving}
                  className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
                >
                  <FiLock className="h-5 w-5" />
                  {passwordSaving ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>
            </div>
            <WebsiteApiKeysPanel />
          </>
          )}
        </section>
      </div>

      <div className="flex justify-end">
        {isDirty && (
          <button
            type="button"
            onClick={discardChanges}
            className="btn btn-primary mr-3 inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FiRotateCcw className="h-5 w-5" />
            Discard changes
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
        >
          <FiSave className="h-5 w-5" />
          {saving ? "Saving..." : "Save school settings"}
        </button>
      </div>
    </div>
  );
}
