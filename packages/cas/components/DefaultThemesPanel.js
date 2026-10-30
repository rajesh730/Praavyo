'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Library, RefreshCw } from 'lucide-react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { useCasQuery, useCasMutation } from '../lib/client/useCas.js';
import { Card, Button, Alert, Spinner, Badge } from './ui/Kit.js';

const STATUS = {
  // Either new in the library or skipped earlier; the school can add it any time.
  NOT_ADDED: { en: 'New · not added', ne: 'नयाँ · थपिएको छैन', tone: 'info' },
  UP_TO_DATE: { en: 'Added', ne: 'थपिएको', tone: 'success' },
  UPDATE_AVAILABLE: { en: 'Update available', ne: 'अद्यावधिक उपलब्ध', tone: 'warning' },
};

/**
 * Default themes for one school subject.
 *
 * The school links its own registered subject (e.g. its "English") to the
 * matching subject in the platform's default library, then adds all or only
 * the ticked default themes. Each added theme is the school's own copy. When
 * the library changes a theme, the school sees "Update available", previews
 * the change, and decides whether to apply it. Themes the school created
 * itself are never touched.
 */
export default function DefaultThemesPanel({ subjectId, t, onChanged }) {
  const path = subjectId ? `/api/cas/library?subject=${subjectId}` : null;
  const { data, loading, error, reload } = useCasQuery(path);
  const { run, pending, error: actionError, success } = useCasMutation();
  const [picked, setPicked] = useState(() => new Set());
  const [preview, setPreview] = useState(null); // { themeKey, data }
  // Collapsed by default; the header summary still shows new themes and updates.
  const [open, setOpen] = useRememberedState('cas-default-themes:open', false);

  if (!subjectId) return null;
  if (loading) return <Card><Spinner label={t('Loading default themes...', 'पूर्वनिर्धारित थिम लोड हुँदैछ...')} /></Card>;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data || data.library) return null;

  const refresh = () => { setPicked(new Set()); setPreview(null); reload(); onChanged?.(); };

  const link = async (librarySubject) => {
    const result = await run('/api/cas/library', { method: 'POST', body: { action: 'link', subject: subjectId, librarySubject: librarySubject || null } },
      { successMessage: librarySubject ? t('Linked to the default subject', 'पूर्वनिर्धारित विषयसँग जोडियो') : t('Link removed', 'जडान हटाइयो') });
    if (result.ok) refresh();
  };

  const add = async (themeKeys) => {
    const result = await run('/api/cas/library', { method: 'POST', body: { action: 'add', subject: subjectId, themeKeys } },
      { successMessage: t('Default themes added to this subject', 'पूर्वनिर्धारित थिम थपियो') });
    if (result.ok) refresh();
  };

  const openPreview = async (themeKey) => {
    const result = await run('/api/cas/library', { method: 'POST', body: { action: 'preview', subject: subjectId, themeKey } });
    if (result.ok) setPreview({ themeKey, data: result.data });
  };

  const applyUpdate = async () => {
    const message = preview.data.edited
      ? t('This school edited this theme. Applying the update replaces those edits with the default version. Themes your school created itself are not affected. Continue?',
        'यो विद्यालयले यो थिम सम्पादन गरेको छ। अद्यावधिकले ती परिवर्तन बदल्छ। विद्यालयले आफैं बनाएका थिम असर पर्दैनन्। जारी राख्ने?')
      : t('Apply the updated default version of this theme? Published results do not change.',
        'यो थिमको अद्यावधिक संस्करण लागू गर्ने? प्रकाशित नतिजा परिवर्तन हुँदैन।');
    if (!window.confirm(message)) return;
    const result = await run('/api/cas/library', { method: 'POST', body: { action: 'update', subject: subjectId, themeKey: preview.themeKey } },
      { successMessage: t('Theme updated to the default version', 'थिम अद्यावधिक भयो') });
    if (result.ok) refresh();
  };

  const notAdded = data.themes.filter((theme) => theme.status === 'NOT_ADDED');
  const toggle = (key) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const counts = {
    added: data.themes.filter((theme) => theme.status !== 'NOT_ADDED').length,
    available: notAdded.length,
    updates: data.themes.filter((theme) => theme.status === 'UPDATE_AVAILABLE').length,
    removed: (data.removedFromLibrary || []).length,
  };
  const summary = !data.linked
    ? t('Not linked to a default subject', 'पूर्वनिर्धारित विषयसँग जोडिएको छैन')
    : [
      `${counts.added} ${t('added', 'थपिएको')}`,
      counts.available ? `${counts.available} ${t('new', 'नयाँ')}` : null,
      counts.updates ? `${counts.updates} ${t(counts.updates === 1 ? 'update' : 'updates', 'अद्यावधिक')}` : null,
    ].filter(Boolean).join(' · ');

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
        <Library size={18} aria-hidden />
        <span className="font-semibold text-ink">{t('Default themes', 'पूर्वनिर्धारित थिम')}</span>
        <span className="ml-auto flex flex-wrap justify-end gap-1.5 text-xs">
          <span className="text-muted">{summary}</span>
          {counts.available > 0 && <Badge tone="info">{counts.available} {t('new', 'नयाँ')}</Badge>}
          {counts.updates > 0 && <Badge tone="warning">{counts.updates} {t('to review', 'हेर्नुपर्ने')}</Badge>}
        </span>
      </button>

      {open && (
      <div className="mt-4">
      {actionError && <Alert tone="danger">{actionError}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      {!data.linked ? (
        data.candidates.length === 0 ? (
          <p className="text-sm text-muted">{t('The default library has no subjects for this grade yet. You can create your own themes.', 'यो कक्षाका लागि पूर्वनिर्धारित विषय छैनन्। आफ्नै थिम बनाउन सक्नुहुन्छ।')}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">{t('Connect this subject to the matching default subject to use its themes.', 'यस विषयलाई मिल्दो पूर्वनिर्धारित विषयसँग जोड्नुहोस्।')}</p>
            <div className="flex flex-wrap gap-2">
              {data.candidates.map((candidate) => (
                <Button key={candidate.id} variant="secondary" disabled={pending} onClick={() => link(candidate.id)}>
                  {t(`Use default ${candidate.titleEn}`, `पूर्वनिर्धारित ${candidate.titleNe || candidate.titleEn}`)}
                </Button>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted">
              {t('Linked to default', 'जोडिएको')} <strong className="text-ink">{t(data.linked.titleEn, data.linked.titleNe)}</strong>
              {data.ownThemeCount ? ` · ${data.ownThemeCount} ${t('of your own themes', 'आफ्नै थिम')}` : ''}
            </p>
            <button type="button" className="text-xs font-semibold text-muted hover:text-danger" disabled={pending}
              onClick={() => window.confirm(t('Disconnect from the default subject? Themes already added stay in this subject.', 'जडान हटाउने? थपिएका थिम रहन्छन्।')) && link(null)}>
              {t('Disconnect', 'जडान हटाउनुहोस्')}
            </button>
          </div>

          <ul className="divide-y divide-line rounded-control border border-line">
            {data.themes.map((theme) => {
              const status = STATUS[theme.status];
              return (
                <li key={theme.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  {theme.status === 'NOT_ADDED' ? (
                    <input type="checkbox" checked={picked.has(theme.key)} onChange={() => toggle(theme.key)} aria-label={theme.titleEn} />
                  ) : <span className="w-[13px]" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{t(theme.titleEn, theme.titleNe)}</span>
                    <span className="text-xs text-muted">{theme.outcomeCount} {t('learning outcomes', 'सिकाइ उपलब्धि')}{theme.edited ? ` · ${t('edited by your school', 'तपाईंको विद्यालयले सम्पादन गरेको')}` : ''}</span>
                  </span>
                  <Badge tone={status.tone}>{t(status.en, status.ne)}</Badge>
                  {theme.status === 'UPDATE_AVAILABLE' && (
                    <Button variant="secondary" disabled={pending} onClick={() => openPreview(theme.key)}>
                      <RefreshCw size={14} aria-hidden /> {t('Preview update', 'अद्यावधिक हेर्नुहोस्')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {counts.removed > 0 && (
            <div className="rounded-control border border-line bg-surface-2 p-3 text-sm">
              <p className="font-medium text-ink">{t('No longer in the default library', 'पूर्वनिर्धारित सङ्ग्रहमा अब छैन')}</p>
              <p className="mt-0.5 text-xs text-muted">{t('These themes stay in your curriculum as they are. You can keep using them, edit them, or remove them yourself.', 'यी थिम तपाईंको पाठ्यक्रममा जस्ताको तस्तै रहन्छन्।')}</p>
              <ul className="mt-2 list-inside list-disc text-xs text-ink">
                {data.removedFromLibrary.map((theme) => (
                  <li key={theme.key}>{t(theme.titleEn, theme.titleNe)} · {theme.outcomeCount} {t('learning outcomes', 'सिकाइ उपलब्धि')}</li>
                ))}
              </ul>
            </div>
          )}

          {notAdded.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || picked.size === 0} onClick={() => add([...picked])}>
                {t(`Add ${picked.size || ''} selected`, `छानिएका ${picked.size || ''} थप्नुहोस्`)}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => add(notAdded.map((theme) => theme.key))}>
                {t(`Add all ${notAdded.length}`, `सबै ${notAdded.length} थप्नुहोस्`)}
              </Button>
            </div>
          )}

          {preview && (
            <div className="space-y-2 rounded-control border border-warning-line bg-warning-soft p-3 text-sm text-ink">
              <p className="font-semibold">{t('What this update changes', 'यो अद्यावधिकले के परिवर्तन गर्छ')}: {t(preview.data.theme.titleEn, preview.data.theme.titleNe)}</p>
              {preview.data.renamed && <p>{t('Renamed to', 'नयाँ नाम')}: {t(preview.data.renamed.titleEn, preview.data.renamed.titleNe)}</p>}
              {preview.data.workingHours !== undefined && <p>{t('Working hours', 'कार्य घण्टा')}: {preview.data.workingHours ?? '—'}</p>}
              <PreviewList label={t('Added outcomes', 'थपिने उपलब्धि')} rows={preview.data.added} t={t} />
              <PreviewList label={t('Changed outcomes', 'परिवर्तन हुने उपलब्धि')} rows={preview.data.changed} t={t} />
              <PreviewList label={t('Removed outcomes', 'हटाइने उपलब्धि')} rows={preview.data.removed} t={t}
                note={(row) => (row.hasMarks ? t('has marks — kept in history', 'अङ्क छ — इतिहासमा राखिन्छ') : '')} />
              {!preview.data.renamed && preview.data.workingHours === undefined && !preview.data.added.length && !preview.data.changed.length && !preview.data.removed.length && (
                <p>{t('Only formatting differs from your copy.', 'तपाईंको प्रतिभन्दा ढाँचा मात्र फरक छ।')}</p>
              )}
              {preview.data.edited && <p className="font-semibold text-warning">{t('Your school edited this theme. Applying the update replaces those edits.', 'तपाईंको विद्यालयले यो थिम सम्पादन गरेको छ। अद्यावधिकले ती परिवर्तन बदल्छ।')}</p>}
              <p className="text-xs text-muted">{t('Published results stay as they were. Curriculum, assessment and unpublished results use the updated theme.', 'प्रकाशित नतिजा जस्ताको तस्तै रहन्छ।')}</p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={applyUpdate}>{t('Apply update', 'अद्यावधिक लागू गर्नुहोस्')}</Button>
                <Button variant="secondary" onClick={() => setPreview(null)}>{t('Not now', 'अहिले होइन')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </Card>
  );
}

function PreviewList({ label, rows, t, note }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="font-medium">{label} ({rows.length})</p>
      <ul className="ml-4 list-disc text-xs">
        {rows.slice(0, 12).map((row) => (
          <li key={row.code}>{row.code} — {t(row.titleEn, row.titleNe)}{note?.(row) ? ` (${note(row)})` : ''}</li>
        ))}
        {rows.length > 12 && <li>… {rows.length - 12} {t('more', 'थप')}</li>}
      </ul>
    </div>
  );
}
