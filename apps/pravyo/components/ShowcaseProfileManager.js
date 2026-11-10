"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays as FaCalendarAlt, CircleAlert as FaAlert, CircleCheck as FaCheckCircle, SquareCheck as FaCheckSquare, Mail as FaEnvelope, ExternalLink as FaExternalLinkAlt, Globe as FaGlobe, Image as FaImage, Link as FaLink, Phone as FaPhone, Save as FaSave, LoaderCircle as FaSpinner, Star as FaStar, Trophy as FaTrophy, Users as FaUsers } from "lucide-react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaTwitter, FaYoutube } from "react-icons/fa";
import { normalizeImageUrl } from "@/lib/imageUrls";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import AppDate from "@/components/common/AppDate";
import ImageUploadField from "@/components/media/ImageUploadField";

const EMPTY_SOCIAL_LINKS = {
  facebook: "",
  instagram: "",
  linkedin: "",
  tiktok: "",
  youtube: "",
  twitter: "",
};

// Social inputs rendered in the editor, in display order.
const SOCIAL_FIELDS = [
  { key: "facebook", label: "Facebook", icon: FaFacebookF, placeholder: "https://facebook.com/yourschool" },
  { key: "instagram", label: "Instagram", icon: FaInstagram, placeholder: "https://instagram.com/yourschool" },
  { key: "linkedin", label: "LinkedIn", icon: FaLinkedinIn, placeholder: "https://linkedin.com/company/yourschool" },
  { key: "tiktok", label: "TikTok", icon: FaTiktok, placeholder: "https://tiktok.com/@yourschool" },
  { key: "youtube", label: "YouTube", icon: FaYoutube, placeholder: "https://youtube.com/@yourschool" },
  { key: "twitter", label: "X (Twitter)", icon: FaTwitter, placeholder: "https://x.com/yourschool" },
];

const EMPTY_FORM = {
  tagline: "",
  summary: "",
  coverImageUrl: "",
  bannerImageUrl: "",
  websiteUrl: "",
  motto: "",
  contactEmail: "",
  contactPhone: "",
  socialLinks: { ...EMPTY_SOCIAL_LINKS },
  visibility: "PRIVATE",
};

const SCHOOL_STORY_MAX_LENGTH = 2000;

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function MetricRow({ label, value, icon: Icon }) {
  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon className="text-brand-strong" />
        {label}
      </span>
      <strong className="text-lg font-semibold text-ink">{value}</strong>
    </div>
  );
}

export default function ShowcaseProfileManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [profile, setProfile] = useState(EMPTY_FORM);

  // The confirmation sits beside the Save button and fades out on its own, so
  // a later edit is not shown under an old "saved" message.
  useEffect(() => {
    if (!savedMessage) return undefined;
    const timer = setTimeout(() => setSavedMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  const publicSchoolUrl = useMemo(() => {
    if (!profile?.school) return "";
    return `/schools/${profile.school}`;
  }, [profile]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const profileRes = await fetch("/api/school/showcase-profile", { cache: "no-store" });
        const profileJson = await profileRes.json();

        if (!profileRes.ok) {
          throw new Error(profileJson.message || "Failed to load showcase profile");
        }

        const nextProfile = profileJson.data || EMPTY_FORM;
        setProfile({
          tagline: nextProfile.tagline || "",
          summary: nextProfile.summary || "",
          coverImageUrl: nextProfile.coverImageUrl || "",
          bannerImageUrl: nextProfile.bannerImageUrl || "",
          websiteUrl: nextProfile.websiteUrl || "",
          motto: nextProfile.motto || "",
          contactEmail: nextProfile.contactEmail || "",
          contactPhone: nextProfile.contactPhone || "",
          socialLinks: { ...EMPTY_SOCIAL_LINKS, ...(nextProfile.socialLinks || {}) },
          visibility: nextProfile.visibility || "PRIVATE",
          school:
            typeof nextProfile.school === "string"
              ? nextProfile.school
              : nextProfile.school?._id || nextProfile.school?.id || "",
          schoolName: nextProfile.school?.schoolName || nextProfile.school?.name || "",
          highlightMetrics: nextProfile.highlightMetrics || {},
          updatedAt: nextProfile.updatedAt || null,
        });

      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const updateSchoolLogo = async (asset) => {
    const previousUrl = profile.coverImageUrl || "";
    const coverImageUrl = asset?.url || "";
    setProfile((current) => ({ ...current, coverImageUrl }));
    setError("");
    setSavedMessage("");

    try {
      const response = await fetch("/api/school/showcase-profile/logo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageUrl }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update school logo");
      }
      setProfile((current) => ({
        ...current,
        coverImageUrl: data.data?.coverImageUrl || "",
      }));
      setSavedMessage("School logo updated.");
    } catch (logoError) {
      setProfile((current) => ({ ...current, coverImageUrl: previousUrl }));
      setError(logoError.message || "Failed to update school logo");
    }
  };

  // Saved straight away, like the logo — not held until "Save" is pressed.
  const updateSchoolCover = async (asset) => {
    const previousUrl = profile.bannerImageUrl || "";
    const bannerImageUrl = asset?.url || "";
    setProfile((current) => ({ ...current, bannerImageUrl }));
    setError("");
    setSavedMessage("");

    try {
      const response = await fetch("/api/school/showcase-profile/cover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerImageUrl }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update the cover image");
      }
      setProfile((current) => ({
        ...current,
        bannerImageUrl: data.data?.bannerImageUrl || "",
      }));
      setSavedMessage(
        bannerImageUrl
          ? profile.visibility === "PUBLIC"
            ? "Cover image updated. It is on your public page now."
            : "Cover image saved. Set Visibility to Public and save to show your page."
          : "Cover image removed."
      );
    } catch (coverError) {
      setProfile((current) => ({ ...current, bannerImageUrl: previousUrl }));
      setError(coverError.message || "Failed to update the cover image");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedMessage("");

    try {
      const payload = {
        tagline: profile.tagline,
        summary: profile.summary,
        coverImageUrl: profile.coverImageUrl,
        bannerImageUrl: profile.bannerImageUrl,
        websiteUrl: profile.websiteUrl,
        motto: profile.motto,
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        socialLinks: profile.socialLinks,
        visibility: profile.visibility,
      };

      const res = await fetch("/api/school/showcase-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save showcase profile");
      }

      const saved = data.data;
      setProfile((prev) => ({
        ...prev,
        school:
          typeof saved.school === "string" ? saved.school : saved.school?._id || "",
        highlightMetrics: saved.highlightMetrics || prev.highlightMetrics,
        updatedAt: saved.updatedAt || new Date().toISOString(),
      }));
      setSavedMessage("Showcase profile saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-4 sm:p-5 text-muted">
        <FaSpinner className="animate-spin text-brand-strong" />
        Loading public showcase profile...
      </div>
    );
  }

  const schoolName = profile.schoolName || "Your School";
  const tagline = profile.tagline || "Inspiring minds. Building futures.";
  const logoImage = normalizeImageUrl(profile.coverImageUrl);
  const metrics = profile.highlightMetrics || {};

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-ink">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="space-y-4">
          <section className="card p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-2xl text-white">
                  <FaGlobe />
                </span>
                <div>
                  <h1 className="font-semibold text-ink">
                    Public School Showcase
                  </h1>
                  <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-muted">
                    Control how your school appears before login, on public event pages and in featured school sections.
                  </p>
                </div>
              </div>
              {publicSchoolUrl && (
                <Link
                  href={publicSchoolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-2"
                >
                  View Public Page
                  <FaExternalLinkAlt />
                </Link>
              )}
            </div>
          </section>

          <section className="card p-4">
            <div className="grid gap-5 md:grid-cols-2">
              <label>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
                  <FaCalendarAlt className="text-muted" />
                  Tagline
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={profile.tagline}
                    maxLength={120}
                    onChange={(e) =>
                      setProfile((prev) => ({ ...prev, tagline: e.target.value }))
                    }
                    className="input w-full pr-16"
                    placeholder="Inspiring minds. Building futures."
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-semibold text-muted">
                    {(profile.tagline || "").length}/120
                  </span>
                </div>
              </label>

              <label>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
                  <FaGlobe className="text-muted" />
                  Visibility
                </div>
                <select
                  value={profile.visibility}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, visibility: e.target.value }))
                  }
                  className="input w-full"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="PUBLIC">Public</option>
                </select>
                <p className="mt-2 text-xs font-semibold text-muted">
                  Only approved public achievements appear on your public profile.
                </p>
              </label>
            </div>

            <label className="mt-5 block">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
                <FaCheckSquare className="text-muted" />
                School Story
              </div>
              <div className="relative">
                <textarea
                  value={profile.summary}
                  maxLength={SCHOOL_STORY_MAX_LENGTH}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, summary: e.target.value }))
                  }
                  className="input w-full leading-6"
                  placeholder="Explain your school culture, activity strengths, and what families should know."
                />
                <span className="absolute bottom-3 right-3 text-2xs font-semibold text-muted">
                  {wordCount(profile.summary)} words / {(profile.summary || "").length}/{SCHOOL_STORY_MAX_LENGTH}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-muted">
                Public profile shows the first 120 words, with a Read more option.
              </p>
            </label>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink">
                <FaImage className="text-muted" />
                School Logo
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="shrink-0">
                  <p className="mb-2 text-2xs font-semibold uppercase text-muted">
                    Logo preview
                  </p>
                  <SchoolLogoMark
                    imageUrl={logoImage}
                    name={schoolName}
                    className="h-24 w-24"
                    iconClassName="text-2xl"
                    shapeClassName="rounded-card"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <ImageUploadField
                    purpose="SCHOOL_LOGO"
                    value={profile.coverImageUrl ? { url: profile.coverImageUrl } : null}
                    onChange={updateSchoolLogo}
                    label={profile.coverImageUrl ? "Replace school logo" : "Upload school logo"}
                    maxEdge={512}
                    quality={0.72}
                    allowRemove={false}
                  />
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink">
                <FaImage className="text-muted" />
                School Cover Image
              </div>
              <ImageUploadField
                purpose="SCHOOL_COVER"
                value={profile.bannerImageUrl ? { url: profile.bannerImageUrl } : null}
                onChange={updateSchoolCover}
                label={profile.bannerImageUrl ? "Replace cover image" : "Upload cover image"}
                maxEdge={1600}
                quality={0.75}
              />
            </div>

            <label className="card transition-colors hover:border-brand-line hover:bg-surface-2 p-4 md:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink">
                <FaLink className="text-muted" />
                Website URL
              </div>
              <input
                type="url"
                value={profile.websiteUrl}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, websiteUrl: e.target.value }))
                }
                className="input w-full"
                placeholder="https://schoolname.edu.np"
              />
              <p className="mt-2 text-xs font-semibold text-muted">
                This link will be displayed on your public profile.
              </p>
            </label>
          </section>

          <section className="card p-4">
            <div className="mb-4">
              <h2 className="flex items-center gap-2 font-semibold text-ink">
                <FaGlobe className="text-brand-strong" />
                Social Media &amp; Contact
              </h2>
              <p className="mt-1 text-xs font-semibold text-muted">
                Add the channels families can follow you on. Only the ones you fill
                in are shown on your public profile.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {SOCIAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
                <label key={key} className="block">
                  <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold text-ink">
                    <Icon className="text-muted" />
                    {label}
                  </div>
                  <input
                    type="url"
                    value={profile.socialLinks?.[key] || ""}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...prev,
                        socialLinks: { ...prev.socialLinks, [key]: e.target.value },
                      }))
                    }
                    className="input w-full"
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold text-ink">
                  <FaEnvelope className="text-muted" />
                  Public Email
                </div>
                <input
                  type="email"
                  value={profile.contactEmail}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, contactEmail: e.target.value }))
                  }
                  className="input w-full"
                  placeholder="info@yourschool.edu.np"
                />
              </label>
              <label className="block">
                <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold text-ink">
                  <FaPhone className="text-muted" />
                  Public Phone
                </div>
                <input
                  type="tel"
                  value={profile.contactPhone}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, contactPhone: e.target.value }))
                  }
                  className="input w-full"
                  placeholder="+977-..."
                />
              </label>
            </div>

            <label className="mt-4 block">
              <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold text-ink">
                <FaStar className="text-muted" />
                School Motto
              </div>
              <input
                type="text"
                value={profile.motto}
                maxLength={160}
                onChange={(e) =>
                  setProfile((prev) => ({ ...prev, motto: e.target.value }))
                }
                className="input w-full"
                placeholder="e.g. Knowledge, Character, Service"
              />
            </label>
          </section>

        </main>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold text-ink">Profile Preview</h2>
            <div className="card mt-4 overflow-hidden">
              <div className="bg-surface-2 p-4">
                <div className="flex items-start gap-3">
                  <SchoolLogoMark
                    imageUrl={logoImage}
                    name={schoolName}
                    className="h-16 w-16"
                    iconClassName="text-2xl"
                    shapeClassName="rounded-card"
                  />
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-ink">
                      {schoolName}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-muted">
                      {tagline}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Achievements", FaTrophy],
                    ["Students", FaUsers],
                    ["Programs", FaBookIcon],
                  ].map(([label, Icon]) => (
                    <div key={label}>
                      <Icon className="mx-auto text-brand-strong" />
                      <div className="mt-1 text-2xs font-semibold text-muted">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>

                {publicSchoolUrl && (
                  <Link
                    href={publicSchoolUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm mt-4 inline-flex w-full items-center justify-center gap-2"
                  >
                    Visit Public Page
                    <FaExternalLinkAlt />
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section className="card p-4">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <FaChartIcon />
              Public Activity Metrics
            </h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-muted">
              Track how your school is performing on the public platform.
            </p>
            <div className="mt-4 space-y-3">
              <MetricRow label="Events Hosted" value={metrics.eventsHosted || 0} icon={FaCalendarAlt} />
              <MetricRow label="Joined Events" value={metrics.eventsParticipated || 0} icon={FaUsers} />
              <MetricRow label="Awards & Achievements" value={metrics.awardsCount || 0} icon={FaTrophy} />
              <MetricRow
                label="Participation Rate"
                value={`${metrics.studentParticipationRate || 0}%`}
                icon={FaStar}
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary inline-flex w-full items-center justify-center gap-2"
          >
            <FaSave />
            {saving ? "Saving..." : "Save Showcase Profile"}
          </button>

          <div aria-live="polite" role="status">
            {error ? (
              <p className="flex items-start gap-2 rounded-card border border-danger-line bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">
                <FaAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : savedMessage ? (
              <p className="flex items-start gap-2 rounded-card border border-success-line bg-success-soft px-3 py-2.5 text-sm font-semibold text-success">
                <FaCheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{savedMessage}</span>
              </p>
            ) : null}
          </div>

          <p className="text-center text-2xs font-semibold text-muted">
            Last updated:{" "}
            <AppDate value={profile.updatedAt} mode="dateTime" fallback="Not saved yet" />
          </p>
        </aside>
      </div>
    </form>
  );
}

function FaBookIcon(props) {
  return <FaCheckSquare {...props} />;
}

function FaChartIcon() {
  return <span className="text-brand-strong">▮▮▮</span>;
}
