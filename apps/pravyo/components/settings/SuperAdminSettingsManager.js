"use client";

import { useEffect, useState } from "react";
import { CircleAlert as FiAlertCircle, CircleCheck as FiCheckCircle, Globe as FiGlobe, Layers as FiLayers, Lock as FiLock, RotateCcw as FiRotateCcw, Save as FiSave, Settings as FiSettings, Shield as FiShield, UserPlus as FiUserPlus, UserX as FiUserX } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Spinner from "@/components/ui/Spinner";
import AppDate from "@/components/common/AppDate";

const defaultConfig = {
  general: {
    platformName: "Praavyo",
    supportEmail: "",
    supportPhone: "",
    defaultTimezone: "Asia/Kathmandu",
    defaultCountry: "Nepal",
    statusPageUrl: "",
    maintenanceMessage: "",
  },
  governance: {
    schoolOnboardingMode: "APPROVAL_REQUIRED",
    eventPublishingMode: "SUPER_ADMIN_REVIEW",
    defaultPublicResults: true,
    allowSchoolShowcases: true,
  },
  defaults: {
    pendingSchoolRestrictions: true,
    allowFeedbackForm: true,
  },
};

function getRiskWarnings(nextConfig, currentConfig) {
  const warnings = [];

  if (
    currentConfig.governance.schoolOnboardingMode !== "AUTO_APPROVE" &&
    nextConfig.governance.schoolOnboardingMode === "AUTO_APPROVE"
  ) {
    warnings.push(
      "School onboarding will switch to auto-approve for future school registrations."
    );
  }

  if (
    currentConfig.governance.eventPublishingMode !== "OWNER_DIRECT" &&
    nextConfig.governance.eventPublishingMode === "OWNER_DIRECT"
  ) {
    warnings.push(
      "Platform event publishing will allow direct owner publishing without super admin review."
    );
  }

  if (
    currentConfig.governance.allowSchoolShowcases &&
    !nextConfig.governance.allowSchoolShowcases
  ) {
    warnings.push(
      "Schools will no longer be able to publish showcase pages going forward."
    );
  }

  if (
    currentConfig.governance.defaultPublicResults &&
    !nextConfig.governance.defaultPublicResults
  ) {
    warnings.push(
      "New platform events will no longer default to public results."
    );
  }

  return warnings;
}

function normalizeDefaults(defaults = {}) {
  const nextDefaults = { ...defaultConfig.defaults, ...defaults };
  if (
    typeof nextDefaults.allowFeedbackForm !== "boolean" &&
    typeof defaults.allowSupportTickets === "boolean"
  ) {
    nextDefaults.allowFeedbackForm = defaults.allowSupportTickets;
  }
  delete nextDefaults.allowSupportTickets;
  return nextDefaults;
}

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

function ToggleField({ checked, onChange, label, description }) {
  return (
    <label className="btn btn-primary flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded-control border-line-strong bg-surface text-brand"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-1 block text-sm text-subtle">{description}</span>
      </span>
    </label>
  );
}

export default function SuperAdminSettingsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [config, setConfig] = useState(defaultConfig);
  const [savedConfig, setSavedConfig] = useState(defaultConfig);
  const [isDirty, setIsDirty] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsSaving, setAdminsSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState({ type: "", text: "" });
  const [adminUsers, setAdminUsers] = useState([]);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    password: "",
    currentPassword: "",
  });
  const [adminActionPassword, setAdminActionPassword] = useState("");
  const [pendingRiskSave, setPendingRiskSave] = useState(null);
  const [pendingAdminAction, setPendingAdminAction] = useState(null);
  const activeAdminCount = adminUsers.filter(
    (admin) => admin.status !== "UNSUBSCRIBED"
  ).length;

  const fetchAdminUsers = async () => {
    try {
      setAdminsLoading(true);
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to load admin users");
      }
      setAdminUsers(data.data?.admins || []);
      setCurrentAdminId(String(data.data?.currentAdminId || ""));
    } catch (error) {
      console.error("Failed to load admin users:", error);
      setAdminMessage({ type: "error", text: error.message });
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => {
    async function fetchSettings() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Failed to load platform settings");
        }

        const payload = data.data || {};
        const normalizedDefaults = normalizeDefaults(payload.defaults);
        setConfig({
          general: { ...defaultConfig.general, ...(payload.general || {}) },
          governance: {
            ...defaultConfig.governance,
            ...(payload.governance || {}),
          },
          defaults: normalizedDefaults,
        });
        setSavedConfig({
          general: { ...defaultConfig.general, ...(payload.general || {}) },
          governance: {
            ...defaultConfig.governance,
            ...(payload.governance || {}),
          },
          defaults: normalizedDefaults,
        });
        setIsDirty(false);
      } catch (error) {
        console.error("Failed to load platform settings:", error);
        setMessage({ type: "error", text: error.message });
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
    fetchAdminUsers();
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

  const discardChanges = async () => {
    if (!window.confirm("Discard your unsaved changes?")) return;
    try {
      setLoading(true);
      setMessage({ type: "", text: "" });
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to reload platform settings");
      }

      const payload = data.data || {};
      const normalizedDefaults = normalizeDefaults(payload.defaults);
      setConfig({
        general: { ...defaultConfig.general, ...(payload.general || {}) },
        governance: {
          ...defaultConfig.governance,
          ...(payload.governance || {}),
        },
        defaults: normalizedDefaults,
      });
      setSavedConfig({
        general: { ...defaultConfig.general, ...(payload.general || {}) },
        governance: {
          ...defaultConfig.governance,
          ...(payload.governance || {}),
        },
        defaults: normalizedDefaults,
      });
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to discard changes:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const updateSection = (section, field, value) => {
    setIsDirty(true);
    setConfig((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  };

  const updateAdminForm = (field, value) => {
      setAdminForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (skipRiskConfirm = false) => {
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      const bypassRiskConfirm = skipRiskConfirm === true;

      const platformName = String(config.general.platformName || "").trim();
      const supportEmail = String(config.general.supportEmail || "").trim();
      const statusPageUrl = String(config.general.statusPageUrl || "").trim();
      const supportPhone = String(config.general.supportPhone || "").trim();

      if (!platformName) {
        setMessage({
          type: "error",
          text: "Platform name is required.",
        });
        setSaving(false);
        return;
      }

      if (supportEmail && !isValidEmail(supportEmail)) {
        setMessage({
          type: "error",
          text: "Contact email must be a valid email address.",
        });
        setSaving(false);
        return;
      }

      if (statusPageUrl && !isValidUrl(statusPageUrl)) {
        setMessage({
          type: "error",
          text: "Status page URL must start with http:// or https://",
        });
        setSaving(false);
        return;
      }

      const sanitizedConfig = {
        ...config,
        general: {
          ...config.general,
          platformName,
          supportEmail,
          supportPhone,
          statusPageUrl,
        },
      };

      const riskWarnings = getRiskWarnings(sanitizedConfig, savedConfig);
      if (riskWarnings.length > 0 && !bypassRiskConfirm) {
        setPendingRiskSave({ warnings: riskWarnings });
        setSaving(false);
        return;
      }

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizedConfig),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save platform settings");
      }

      const changedSections = [];
      if (
        JSON.stringify(savedConfig.general) !==
        JSON.stringify(sanitizedConfig.general)
      ) {
        changedSections.push("General");
      }
      if (
        JSON.stringify(savedConfig.governance) !==
        JSON.stringify(sanitizedConfig.governance)
      ) {
        changedSections.push("Approval & Publishing");
      }
      if (
        JSON.stringify(savedConfig.defaults) !==
        JSON.stringify(sanitizedConfig.defaults)
      ) {
        changedSections.push("Contact");
      }

      setMessage({
        type: "success",
        text:
          changedSections.length > 0
            ? `${changedSections.join(", ")} settings saved successfully.`
            : "Platform settings saved successfully.",
      });
      setConfig(sanitizedConfig);
      setSavedConfig(sanitizedConfig);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to save platform settings:", error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAdmin = async () => {
    try {
      setAdminsSaving(true);
      setAdminMessage({ type: "", text: "" });

      const name = String(adminForm.name || "").trim();
      const email = String(adminForm.email || "").trim().toLowerCase();
      const password = String(adminForm.password || "");
      const currentPassword = String(adminForm.currentPassword || "");

      if (!name || !email || !password || !currentPassword) {
        setAdminMessage({
          type: "error",
          text: "Admin name, email, new admin password, and your current password are required.",
        });
        return;
      }

      if (!isValidEmail(email)) {
        setAdminMessage({
          type: "error",
          text: "Admin email must be a valid email address.",
        });
        return;
      }

      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
        setAdminMessage({
          type: "error",
          text: "Admin password must be at least 8 characters and include a letter and a number.",
        });
        return;
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, currentPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAdminMessage({
          type: "error",
          text:
            data.message ||
            "Failed to create super admin. Confirm your own current password and try again.",
        });
        return;
      }

      setAdminMessage({
        type: "success",
        text: `${name} was added as a super admin.`,
      });
      setAdminForm({ name: "", email: "", password: "", currentPassword: "" });
      await fetchAdminUsers();
    } catch (error) {
      console.error("Failed to create super admin:", error);
      setAdminMessage({
        type: "error",
        text: "Failed to create super admin. Please try again.",
      });
    } finally {
      setAdminsSaving(false);
    }
  };

  const handleAdminStatusChange = async (admin, action, skipConfirm = false) => {
    try {
      setAdminMessage({ type: "", text: "" });

      const currentPassword = String(adminActionPassword || "");
      if (!currentPassword) {
        setAdminMessage({
          type: "error",
          text: "Enter your current password before changing another admin account.",
        });
        return;
      }

      const label = action === "deactivate" ? "deactivate" : "reactivate";
      if (skipConfirm !== true) {
        setPendingAdminAction({ admin, action, label });
        return;
      }

      setAdminsSaving(true);
      const res = await fetch(`/api/admin/users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, currentPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAdminMessage({
          type: "error",
          text:
            data.message ||
            "Failed to update admin access. Confirm your own current password and try again.",
        });
        return;
      }

      setAdminMessage({
        type: "success",
        text:
          action === "deactivate"
            ? `${admin.name || admin.email} was deactivated.`
            : `${admin.name || admin.email} was reactivated.`,
      });
      await fetchAdminUsers();
    } catch (error) {
      console.error("Failed to update admin status:", error);
      setAdminMessage({
        type: "error",
        text: "Failed to update admin access. Please try again.",
      });
    } finally {
      setAdminsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5 text-ink">
        Loading platform settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-semibold text-ink">
              <FiSettings className="text-brand" />
              Platform Settings
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-subtle">
              This surface should only hold platform-wide defaults, governance,
              and operational policy. School-specific branding and contact data
              belongs in school settings.
            </p>
          </div>
          <div className="rounded-card border border-brand-line bg-brand-soft px-4 py-3 text-sm text-brand">
            Global defaults apply across the platform unless a lower school
            scope explicitly overrides them.
          </div>
        </div>
      </div>

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
          You have unsaved changes. They are only stored after you click `Save
          platform settings`. Leaving or refreshing the page now will discard
          your edits.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiShield className="text-brand" />
              Admin Access
            </h2>
            <p className="mb-4 text-sm text-subtle">
              Use separate named super-admin accounts for real people. Avoid
              shared logins so ownership, recovery, and future audit trails stay
              clear.
            </p>

            {adminMessage.text && (
              <div
                className={`mb-4 flex items-center gap-3 rounded-card border p-4 text-sm ${
                  adminMessage.type === "success"
                    ? "border-success-line bg-success-soft text-success"
                    : "border-danger-line bg-danger-soft text-danger"
                }`}
              >
                {adminMessage.type === "success" ? (
                  <FiCheckCircle />
                ) : (
                  <FiAlertCircle />
                )}
                <span>{adminMessage.text}</span>
              </div>
            )}

            <div className="mb-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-card border border-line-strong bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Super Admins
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {adminUsers.length}
                </p>
                <p className="mt-2 text-sm text-subtle">
                  Separate named accounts with full platform control.
                </p>
              </div>
              <div className="rounded-card border border-line-strong bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Active
                </p>
                <p className="mt-3 text-2xl font-semibold text-ink">
                  {activeAdminCount}
                </p>
                <p className="mt-2 text-sm text-subtle">
                  Accounts that can currently access platform administration.
                </p>
              </div>
              <div className="rounded-card border border-line-strong bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Governance Note
                </p>
                <p className="mt-3 text-sm text-ink">
                  Keep at least two active super admins so the platform is not
                  blocked if one person loses access.
                </p>
                {activeAdminCount < 2 && (
                  <p className="mt-2 text-sm text-warning">
                    Warning: only one super admin is configured right now.
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-card border border-line-strong">
              <div className="grid grid-cols-[1.1fr_1.3fr_0.8fr_0.8fr_1fr] gap-4 border-b border-line-strong bg-surface px-4 py-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                <span>Admin</span>
                <span>Email</span>
                <span>Status</span>
                <span>Origin</span>
                <span>Action</span>
              </div>
              {adminsLoading ? (
                <div className="px-4 py-6 text-sm text-subtle">
                  Loading admin access...
                </div>
              ) : adminUsers.length === 0 ? (
                <div className="px-4 py-6 text-sm text-subtle">
                  No super admins found.
                </div>
              ) : (
                adminUsers.map((admin) => (
                  <div
                    key={admin.id}
                    className="grid grid-cols-[1.1fr_1.3fr_0.8fr_0.8fr_1fr] gap-4 border-t border-line-strong px-4 py-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-ink">{admin.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        Added <AppDate value={admin.createdAt} />
                      </p>
                    </div>
                    <div className="text-ink">{admin.email}</div>
                    <div>
                      <span
                        className={`badge badge-neutral inline-flex text-xs font-semibold ${
                          admin.status === "UNSUBSCRIBED"
                            ? "border-line-strong bg-surface text-ink"
                            : "border-success-line bg-success-soft text-success"
                        }`}
                      >
                        {admin.status}
                      </span>
                    </div>
                    <div className="text-ink">
                      {admin.isDefaultAdmin ? "Bootstrap" : "Managed"}
                    </div>
                    <div>
                      {admin.id === currentAdminId ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            disabled
                            className="btn btn-primary btn-sm inline-flex items-center gap-2 font-semibold opacity-80"
                            title="You cannot deactivate the super admin account you are currently using."
                          >
                            <FiUserX />
                            Current account
                          </button>
                          <p className="text-xs text-muted">
                            You cannot deactivate the account you are signed in
                            with.
                          </p>
                        </div>
                      ) : admin.status === "UNSUBSCRIBED" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleAdminStatusChange(admin, "reactivate")
                          }
                          disabled={adminsSaving}
                          className="btn btn-primary btn-sm inline-flex items-center gap-2 font-semibold transition-colors"
                        >
                          <FiCheckCircle />
                          Reactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleAdminStatusChange(admin, "deactivate")
                          }
                          disabled={adminsSaving}
                          className="btn btn-danger btn-sm inline-flex items-center gap-2 font-semibold transition-colors"
                        >
                          <FiUserX />
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Confirm with your current password
                </label>
                <input
                  type="password"
                  value={adminActionPassword}
                  onChange={(event) => setAdminActionPassword(event.target.value)}
                  className="input w-full"
                  placeholder="Required for add, deactivate, or reactivate"
                />
                <p className="mt-2 text-xs text-muted">
                  Sensitive admin access changes require your current password.
                </p>
              </div>
              <div className="rounded-card border border-line-strong bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-muted">
                  Safety Rules
                </p>
                <div className="mt-3 space-y-2 text-sm text-ink">
                  <p>You cannot deactivate yourself from this screen.</p>
                  <p>The last active super admin cannot be deactivated.</p>
                  <p>Use deactivation instead of deleting privileged accounts.</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
              <div className="flex flex-col">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Admin name
                </label>
                <input
                  value={adminForm.name}
                  onChange={(event) =>
                    updateAdminForm("name", event.target.value)
                  }
                  className="input w-full"
                  placeholder="Full name"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Admin email
                </label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(event) =>
                    updateAdminForm("email", event.target.value)
                  }
                  className="input w-full"
                  placeholder="admin@yourdomain.com"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Temporary password
                </label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(event) =>
                    updateAdminForm("password", event.target.value)
                  }
                  className="input w-full"
                  placeholder="At least 8 chars with letter + number"
                />
              </div>
              <div className="flex flex-col">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Your current password
                </label>
                <input
                  type="password"
                  value={adminForm.currentPassword}
                  onChange={(event) =>
                    updateAdminForm("currentPassword", event.target.value)
                  }
                  className="input w-full"
                  placeholder="Confirms this creation"
                />
              </div>
              <div className="flex flex-col xl:justify-end">
                <span className="mb-2 hidden text-sm font-medium text-transparent xl:block">
                  Action
                </span>
                <button
                  type="button"
                  onClick={handleCreateAdmin}
                  disabled={adminsSaving}
                  aria-busy={adminsSaving}
                  className="btn btn-primary inline-flex items-center justify-center gap-2 font-semibold transition-colors"
                >
                  {adminsSaving ? <Spinner /> : <FiUserPlus />}
                  {adminsSaving ? "Creating..." : "Add admin"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Create one named login per person. Do not share a common admin
              password across the organization.
            </p>
          </div>

          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiGlobe className="text-brand" />
              General
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Platform name
                </label>
                <input
                  value={config.general.platformName}
                  onChange={(event) =>
                    updateSection("general", "platformName", event.target.value)
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Contact email
                </label>
                <input
                  type="email"
                  value={config.general.supportEmail}
                  onChange={(event) =>
                    updateSection("general", "supportEmail", event.target.value)
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Contact phone
                </label>
                <input
                  value={config.general.supportPhone}
                  onChange={(event) =>
                    updateSection("general", "supportPhone", event.target.value)
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Default timezone
                </label>
                <input
                  value={config.general.defaultTimezone}
                  onChange={(event) =>
                    updateSection(
                      "general",
                      "defaultTimezone",
                      event.target.value
                    )
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Default country
                </label>
                <input
                  value={config.general.defaultCountry}
                  onChange={(event) =>
                    updateSection(
                      "general",
                      "defaultCountry",
                      event.target.value
                    )
                  }
                  className="input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Status page URL
                </label>
                <input
                  value={config.general.statusPageUrl}
                  onChange={(event) =>
                    updateSection("general", "statusPageUrl", event.target.value)
                  }
                  className="input w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-ink">
                  Maintenance notice
                </label>
                <textarea
                  rows={4}
                  value={config.general.maintenanceMessage}
                  onChange={(event) =>
                    updateSection(
                      "general",
                      "maintenanceMessage",
                      event.target.value
                    )
                  }
                  className="input w-full"
                  placeholder="Optional message shown when you need to communicate platform-wide maintenance."
                />
              </div>
            </div>
          </div>

          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiLock className="text-warning" />
              Approval & Publishing
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  School onboarding
                </label>
                <select
                  value={config.governance.schoolOnboardingMode}
                  onChange={(event) =>
                    updateSection(
                      "governance",
                      "schoolOnboardingMode",
                      event.target.value
                    )
                  }
                  className="input w-full"
                >
                  <option value="APPROVAL_REQUIRED">Approval required</option>
                  <option value="AUTO_APPROVE">Auto approve</option>
                </select>
                <p className="mt-2 text-xs text-muted">
                  Controls how newly registered schools are admitted to the
                  platform. This affects new registrations going forward.
                </p>
                <p className="mt-1 text-xs text-brand">
                  Scope: new schools only. Existing approved schools are not
                  changed automatically.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">
                  Platform event publishing
                </label>
                <select
                  value={config.governance.eventPublishingMode}
                  onChange={(event) =>
                    updateSection(
                      "governance",
                      "eventPublishingMode",
                      event.target.value
                    )
                  }
                  className="input w-full"
                >
                  <option value="SUPER_ADMIN_REVIEW">Super admin review</option>
                  <option value="OWNER_DIRECT">Owner can publish directly</option>
                </select>
                <p className="mt-2 text-xs text-muted">
                  Controls whether platform events need super admin review before
                  they can be published.
                </p>
                <p className="mt-1 text-xs text-brand">
                  Scope: affects future platform event publishing decisions, not
                  already published events.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiGlobe className="text-success" />
              Public Visibility
            </h2>
            <div className="grid gap-4">
              <ToggleField
                checked={config.governance.defaultPublicResults}
                onChange={(value) =>
                  updateSection("governance", "defaultPublicResults", value)
                }
                label="Enable public results by default"
                description="Used as the starting value for newly created platform events. Existing events keep their own result visibility settings."
              />
              <p className="text-xs text-brand">
                Scope: applies to newly created platform events only.
              </p>
              <ToggleField
                checked={config.governance.allowSchoolShowcases}
                onChange={(value) =>
                  updateSection("governance", "allowSchoolShowcases", value)
                }
                label="Allow school showcase publishing"
                description="Lets schools publish public showcase pages. Turning this off affects future school showcase visibility and editing."
              />
              <p className="text-xs text-brand">
                Scope: affects school showcase publishing and visibility policy
                going forward.
              </p>
            </div>
          </div>

        </section>

        <section className="space-y-4">
          <div className="rounded-card border border-line-strong bg-surface p-4 sm:p-5">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
              <FiLayers className="text-success" />
              Access and feedback
            </h2>
            <div className="space-y-4">
              <ToggleField
                checked={config.defaults.pendingSchoolRestrictions}
                onChange={(value) =>
                  updateSection("defaults", "pendingSchoolRestrictions", value)
                }
                label="Restrict pending school accounts"
                description="Pending schools should only access a minimal account surface until approved. This reduces accidental access before review."
              />
              <p className="text-xs text-brand">
                Scope: affects school accounts that are still pending approval.
              </p>
              <ToggleField
                checked={config.defaults.allowFeedbackForm}
                onChange={(value) =>
                  updateSection("defaults", "allowFeedbackForm", value)
                }
                label="Enable feedback form"
                description="Allows students and schools to send feedback to the super admin inbox."
              />
              <p className="text-xs text-brand">
                Scope: affects feedback submission availability for school and
                student workspaces.
              </p>
            </div>
          </div>

        </section>
      </div>

      <div className="flex justify-end">
        {isDirty && (
          <button
            type="button"
            onClick={discardChanges}
            className="btn btn-primary mr-3 inline-flex items-center gap-2 font-semibold transition-colors"
          >
            <FiRotateCcw />
            Discard changes
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving}
          className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
        >
          {saving ? <Spinner /> : <FiSave />}
          {saving ? "Saving..." : "Save platform settings"}
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRiskSave)}
        title="Confirm platform policy changes"
        message={
          pendingRiskSave?.warnings?.length
            ? pendingRiskSave.warnings.join(" ")
            : ""
        }
        confirmLabel="Save changes"
        tone="warning"
        busy={saving}
        onClose={() => setPendingRiskSave(null)}
        onConfirm={() => {
          setPendingRiskSave(null);
          handleSave(true);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAdminAction)}
        title={
          pendingAdminAction
            ? `${pendingAdminAction.label === "deactivate" ? "Deactivate" : "Reactivate"} admin?`
            : "Update admin?"
        }
        message={
          pendingAdminAction
            ? `${pendingAdminAction.admin.name || pendingAdminAction.admin.email} access will be updated.`
            : ""
        }
        confirmLabel={
          pendingAdminAction?.label === "deactivate"
            ? "Deactivate admin"
            : "Reactivate admin"
        }
        tone={pendingAdminAction?.label === "deactivate" ? "danger" : "info"}
        busy={adminsSaving}
        onClose={() => setPendingAdminAction(null)}
        onConfirm={() => {
          if (pendingAdminAction) {
            const { admin, action } = pendingAdminAction;
            setPendingAdminAction(null);
            handleAdminStatusChange(admin, action, true);
          }
        }}
      />
    </div>
  );
}
