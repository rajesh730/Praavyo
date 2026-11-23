"use client";

import { useCallback, useState } from "react";
import RichWritingEditor from "@/components/writing/RichWritingEditor";
import { WRITING_CATEGORIES, getWritingCategoryLabel } from "@/lib/writingCategories";

/**
 * The school's edit of a student writing: title, type and text. Saved on the
 * writing itself, so the corrected version shows everywhere it appears — the
 * school wall, the magazine, the home page and the student's own portfolio.
 */
export default function WritingEditForm({ article, onSaved, onCancel, endpoint = "/api/school/magazine" }) {
  const [form, setForm] = useState({
    title: article.title || "",
    category: article.category || "BLOG_ARTICLE",
    content: article.content || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const setContent = useCallback((content) => setForm((current) => ({ ...current, content })), []);
  const changed =
    form.title !== (article.title || "") ||
    form.category !== (article.category || "BLOG_ARTICLE") ||
    form.content !== (article.content || "");

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${endpoint}/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EDIT", ...form }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Could not save the changes.");
      onSaved(payload.article || form, payload.message);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-5 space-y-4">
      <p className="rounded-control border border-brand-line bg-brand-soft px-3 py-2 text-sm text-brand-strong">
        Your changes replace the student&apos;s text everywhere: school wall, magazine, home page and their portfolio.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Title</span>
          <input className="input mt-1 w-full" value={form.title} onChange={set("title")} maxLength={180} required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink">Type</span>
          <select className="input mt-1 w-full" value={form.category} onChange={set("category")}>
            {WRITING_CATEGORIES.map((category) => (
              <option key={category} value={category}>{getWritingCategoryLabel(category)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="block">
        <span className="text-sm font-semibold text-ink">Writing</span>
        <div className="mt-1 overflow-hidden rounded-control border border-line-strong bg-surface">
          <RichWritingEditor value={form.content} onChange={setContent} maxLength={50000}
            minHeightClass="min-h-[22rem]" ariaLabel="Writing" placeholder="The writing" />
        </div>
      </div>
      {error && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button type="submit" disabled={saving || !changed || !form.title.trim() || !form.content.trim()} className="btn btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
