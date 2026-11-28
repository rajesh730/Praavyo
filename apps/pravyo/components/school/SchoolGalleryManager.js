"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  ImagePlus,
  Images,
  LoaderCircle,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate } from "@/lib/nepaliDate";
import { compressImage } from "@/lib/client/compressImage";

const MAX_PHOTOS = 60;
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

async function readJson(res, fallback) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || fallback);
  return json.data || {};
}

/**
 * Gallery — the school's photo albums. Public albums appear on the school's
 * own website (Website API /gallery); drafts stay here.
 * Photos are compressed to WebP in the browser first.
 */
export default function SchoolGalleryManager() {
  const [albums, setAlbums] = useState([]);
  const [state, setState] = useState({ loading: true, error: "" });
  const [openId, setOpenId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await readJson(await fetch("/api/school/gallery", { cache: "no-store" }), "The gallery could not be loaded.");
      setAlbums(data.albums || []);
      setState({ loading: false, error: "" });
    } catch (error) {
      setState({ loading: false, error: error.message });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const replace = (album) => setAlbums((current) => current.map((row) => (row.id === album.id ? album : row)));
  const open = albums.find((album) => album.id === openId);

  if (open) {
    return (
      <AlbumEditor
        album={open}
        onBack={() => setOpenId("")}
        onSaved={replace}
        onDeleted={(id) => {
          setAlbums((current) => current.filter((row) => row.id !== id));
          setOpenId("");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
            <Images aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Gallery</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              Photo albums of school life. Public albums appear in the Gallery of your connected website
              (Settings → Website); drafts stay here.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus aria-hidden /> New album
        </button>
      </div>

      {creating && (
        <NewAlbumForm
          onCancel={() => setCreating(false)}
          onCreated={(album) => {
            setAlbums((current) => [album, ...current]);
            setCreating(false);
            setOpenId(album.id);
          }}
        />
      )}

      {state.error && <AlertBanner type="error" title="Something went wrong" message={state.error} />}

      {state.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="card overflow-hidden">
              <div className="skeleton aspect-[16/10] w-full" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : albums.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No albums yet"
          description="Create an album for an event or a school day, add photos, then make it public."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} onOpen={() => setOpenId(album.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumCard({ album, onOpen }) {
  const { calendar } = useCalendarPreference();
  const cover = album.photos[0]?.url;
  return (
    <button type="button" onClick={onOpen} className="card group overflow-hidden text-left transition-shadow hover:shadow-pop">
      <div className="relative aspect-[16/10] w-full bg-surface-2">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full w-full place-items-center text-3xl text-subtle">
            <Images aria-hidden />
          </span>
        )}
        <span className={`badge absolute left-3 top-3 ${album.status === "PUBLIC" ? "badge-success" : "badge-neutral"}`}>
          {album.status === "PUBLIC" ? "Public" : "Draft"}
        </span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 font-semibold text-ink group-hover:text-brand-strong">{album.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {album.photos.length} photo{album.photos.length === 1 ? "" : "s"}
          {album.takenOn ? ` · ${formatDate(album.takenOn, calendar)}` : ""}
        </p>
      </div>
    </button>
  );
}

function NewAlbumForm({ onCancel, onCreated }) {
  const [form, setForm] = useState({ title: "", takenOn: "", description: "" });
  const [state, setState] = useState({ saving: false, error: "" });
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setState({ saving: true, error: "" });
    try {
      const data = await readJson(
        await fetch("/api/school/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, takenOn: form.takenOn || null }),
        }),
        "The album could not be created."
      );
      onCreated(data.album);
    } catch (error) {
      setState({ saving: false, error: error.message });
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
      <h3 className="font-semibold text-ink">New album</h3>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="album-title" className="label">Title</label>
          <input id="album-title" value={form.title} onChange={set("title")} required minLength={2} maxLength={120} placeholder="e.g. Sports Day 2083" className="input w-full" />
        </div>
        <div>
          <label htmlFor="album-date" className="label">Date <span className="font-normal text-muted">(optional)</span></label>
          <input id="album-date" type="date" value={form.takenOn} onChange={set("takenOn")} className="input w-full" />
        </div>
      </div>
      <div>
        <label htmlFor="album-description" className="label">Description <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="album-description" rows={2} value={form.description} onChange={set("description")} maxLength={1000} className="input w-full" />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button type="submit" disabled={state.saving} className="btn btn-primary">
          <Plus aria-hidden /> {state.saving ? "Creating…" : "Create and add photos"}
        </button>
      </div>
    </form>
  );
}

function AlbumEditor({ album, onBack, onSaved, onDeleted }) {
  const inputRef = useRef(null);
  const [details, setDetails] = useState({
    title: album.title,
    description: album.description,
    takenOn: toInputDate(album.takenOn),
  });
  const [photos, setPhotos] = useState(album.photos);
  const [upload, setUpload] = useState({ active: false, done: 0, total: 0, failed: 0 });
  const [state, setState] = useState({ saving: false, error: "", notice: "" });

  const photosChanged =
    photos.length !== album.photos.length ||
    photos.some((photo, index) => photo.asset !== album.photos[index]?.asset || photo.caption !== album.photos[index]?.caption);
  const detailsChanged =
    details.title !== album.title ||
    details.description !== album.description ||
    details.takenOn !== toInputDate(album.takenOn);

  async function patch(body, notice) {
    setState({ saving: true, error: "", notice: "" });
    try {
      const data = await readJson(
        await fetch(`/api/school/gallery/${album.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        "The album could not be saved."
      );
      onSaved(data.album);
      setPhotos(data.album.photos);
      setState({ saving: false, error: "", notice });
      return data.album;
    } catch (error) {
      setState({ saving: false, error: error.message, notice: "" });
      return null;
    }
  }

  const photoList = (list) => list.map((photo) => ({ asset: photo.asset, caption: photo.caption || "" }));

  async function addPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    // New uploads are saved straight away; unsaved removals must not ride along unconfirmed.
    if (photosChanged) {
      setState({ saving: false, error: "Save or undo your photo changes before adding more photos.", notice: "" });
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setState({ saving: false, error: `An album holds up to ${MAX_PHOTOS} photos. Start another album.`, notice: "" });
      return;
    }
    const chosen = files.slice(0, room);
    setUpload({ active: true, done: 0, total: chosen.length, failed: 0 });
    const uploaded = [];
    let failed = 0;
    for (const file of chosen) {
      try {
        const compressed = await compressImage(file, { maxEdge: 1600, quality: 0.75, maxBytes: 1_200_000 });
        const form = new FormData();
        form.append("file", compressed.file);
        form.append("purpose", "GALLERY_IMAGE");
        form.append("width", String(compressed.width));
        form.append("height", String(compressed.height));
        form.append("originalName", file.name);
        const data = await readJson(await fetch("/api/media/upload", { method: "POST", body: form }), "Upload failed.");
        uploaded.push({ asset: data.asset.id, caption: "" });
      } catch {
        failed += 1;
      }
      setUpload((current) => ({ ...current, done: current.done + 1, failed }));
    }
    setUpload({ active: false, done: 0, total: 0, failed: 0 });
    if (uploaded.length) {
      await patch(
        { photos: [...photoList(photos), ...uploaded] },
        `${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added${failed ? `, ${failed} could not be uploaded` : ""}${files.length > chosen.length ? `. Only ${room} fit in this album` : ""}.`
      );
    } else if (failed) {
      setState({ saving: false, error: "The photos could not be uploaded. Check your connection and try again.", notice: "" });
    }
  }

  const move = (index, by) =>
    setPhotos((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const makeCover = (index) => setPhotos((current) => [current[index], ...current.filter((_, i) => i !== index)]);
  const remove = (index) => setPhotos((current) => current.filter((_, i) => i !== index));
  const caption = (index, value) =>
    setPhotos((current) => current.map((photo, i) => (i === index ? { ...photo, caption: value } : photo)));

  async function saveAll() {
    const body = {};
    if (detailsChanged) Object.assign(body, { ...details, takenOn: details.takenOn || null });
    if (photosChanged) body.photos = photoList(photos);
    const removed = album.photos.length - photos.filter((photo) => album.photos.some((old) => old.asset === photo.asset)).length;
    if (removed && !window.confirm(`Delete ${removed} removed photo${removed === 1 ? "" : "s"} for good?`)) return;
    await patch(body, "Album saved.");
  }

  async function setStatus(status) {
    if (photosChanged || detailsChanged) {
      setState({ saving: false, error: "Save your changes first.", notice: "" });
      return;
    }
    await patch(
      { status },
      status === "PUBLIC" ? "Album is public. It now shows in your website's Gallery." : "Album moved to drafts. It no longer shows on your website."
    );
  }

  async function deleteAlbum() {
    if (!window.confirm(`Delete "${album.title}" and all ${album.photos.length} photos? This cannot be undone.`)) return;
    setState({ saving: true, error: "", notice: "" });
    try {
      await readJson(await fetch(`/api/school/gallery/${album.id}`, { method: "DELETE" }), "The album could not be deleted.");
      onDeleted(album.id);
    } catch (error) {
      setState({ saving: false, error: error.message, notice: "" });
    }
  }

  const isPublic = album.status === "PUBLIC";
  const busy = state.saving || upload.active;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="btn-icon btn-ghost" aria-label="Back to all albums">
            <ChevronLeft aria-hidden />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-ink">{album.title}</h2>
              <span className={`badge ${isPublic ? "badge-success" : "badge-neutral"}`}>{isPublic ? "Public" : "Draft"}</span>
            </div>
            <p className="text-xs text-muted">{album.photos.length} of {MAX_PHOTOS} photos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isPublic ? (
            <button type="button" disabled={busy} onClick={() => setStatus("DRAFT")} className="btn btn-secondary">
              <EyeOff aria-hidden /> Move to drafts
            </button>
          ) : (
            <button type="button" disabled={busy || album.photos.length === 0} onClick={() => setStatus("PUBLIC")} className="btn btn-primary" title={album.photos.length ? "" : "Add photos first"}>
              <Eye aria-hidden /> Make public
            </button>
          )}
          <button type="button" disabled={busy} onClick={deleteAlbum} className="btn btn-soft-danger">
            <Trash2 aria-hidden /> Delete
          </button>
        </div>
      </div>

      {state.error && <AlertBanner type="error" title="Something went wrong" message={state.error} />}
      {state.notice && !state.error && <AlertBanner type="success" title="Done" message={state.notice} />}

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="edit-title" className="label">Title</label>
            <input id="edit-title" value={details.title} onChange={(e) => setDetails((d) => ({ ...d, title: e.target.value }))} maxLength={120} className="input w-full" />
          </div>
          <div>
            <label htmlFor="edit-date" className="label">Date</label>
            <input id="edit-date" type="date" value={details.takenOn} onChange={(e) => setDetails((d) => ({ ...d, takenOn: e.target.value }))} className="input w-full" />
          </div>
        </div>
        <div>
          <label htmlFor="edit-description" className="label">Description</label>
          <textarea id="edit-description" rows={2} value={details.description} onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))} maxLength={1000} className="input w-full" />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-ink">Photos</h3>
            <p className="text-xs text-muted">The first photo is the album cover. Photos are resized and compressed before upload.</p>
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} className="sr-only" />
          <button type="button" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => inputRef.current?.click()} className="btn btn-secondary">
            {upload.active ? <LoaderCircle className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
            {upload.active ? `Uploading ${upload.done} of ${upload.total}…` : "Add photos"}
          </button>
        </div>

        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="grid w-full place-items-center gap-2 rounded-card border border-dashed border-line-strong p-10 text-sm text-muted hover:bg-surface-2"
          >
            <ImagePlus className="text-2xl" aria-hidden />
            Choose photos from your phone or computer
          </button>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={photo.asset} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="relative aspect-square bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.caption || ""} className="h-full w-full object-cover" loading="lazy" />
                  {index === 0 && <span className="badge badge-brand absolute left-2 top-2">Cover</span>}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="btn-icon btn-sm absolute right-2 top-2 bg-surface/90"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X aria-hidden />
                  </button>
                </div>
                <div className="space-y-2 p-2">
                  <input
                    value={photo.caption || ""}
                    onChange={(event) => caption(index, event.target.value)}
                    maxLength={200}
                    placeholder="Caption (optional)"
                    aria-label={`Caption for photo ${index + 1}`}
                    className="input w-full text-sm"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="btn-icon btn-ghost btn-sm" aria-label="Move earlier">
                        <ArrowLeft aria-hidden />
                      </button>
                      <button type="button" disabled={index === photos.length - 1} onClick={() => move(index, 1)} className="btn-icon btn-ghost btn-sm" aria-label="Move later">
                        <ArrowRight aria-hidden />
                      </button>
                    </div>
                    {index !== 0 && (
                      <button type="button" onClick={() => makeCover(index)} className="btn btn-ghost btn-sm">
                        <Star aria-hidden /> Cover
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(photosChanged || detailsChanged) && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-card border border-warning-line bg-warning-soft p-3 shadow-pop">
          <p className="text-sm text-warning">You have unsaved changes.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPhotos(album.photos);
                setDetails({ title: album.title, description: album.description, takenOn: toInputDate(album.takenOn) });
              }}
              className="btn btn-ghost btn-sm"
            >
              Undo
            </button>
            <button type="button" disabled={busy} onClick={saveAll} className="btn btn-primary btn-sm">
              <Save aria-hidden /> {state.saving ? "Saving…" : "Save album"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
