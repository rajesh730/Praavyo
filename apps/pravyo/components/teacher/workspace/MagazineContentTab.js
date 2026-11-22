'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import AlertBanner from '@/components/ui/AlertBanner';
import LoadingState from '@/components/ui/LoadingState';
import WritingContent from '@/components/WritingContent';
import { WritingCover, WritingGallery, WritingTags } from '@/components/WritingMedia';
import WritingEditForm from '@/components/school/WritingEditForm';
import PublishingTable, { PlacementSwitch } from '@/components/school/PublishingTable';

function issueId(issue) {
  return issue?.id || '';
}

/** Class teachers curate their own students' work only while writing is open. */
export default function MagazineContentTab() {
  const [issues, setIssues] = useState([]);
  const [articles, setArticles] = useState([]);
  const [curationView, setCurationView] = useState('review');
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [issueRes, articleRes] = await Promise.all([
        fetch('/api/teacher/magazine-issues', { cache: 'no-store' }),
        fetch('/api/teacher/magazine', { cache: 'no-store' }),
      ]);
      const [issuePayload, articlePayload] = await Promise.all([
        issueRes.json().catch(() => ({})),
        articleRes.json().catch(() => ({})),
      ]);
      if (!issueRes.ok) throw new Error(issuePayload.message || 'Failed to load school magazines');
      if (!articleRes.ok) throw new Error(articlePayload.message || 'Failed to load magazine writing');
      setIssues(Array.isArray(issuePayload.issues) ? issuePayload.issues : []);
      setArticles(Array.isArray(articlePayload.articles) ? articlePayload.articles : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load magazine content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openIssues = useMemo(
    () => issues.filter((issue) => issue.status === 'DRAFT' && issue.acceptingSubmissions),
    [issues],
  );
  // The chosen magazine, or the first open one when none is chosen or it closed.
  const activeIssueId = openIssues.some((issue) => issue.id === selectedIssueId)
    ? selectedIssueId
    : openIssues[0]?.id || '';
  const chooseIssue = (id) => {
    setSelectedIssueId(id);
    setCurationView('review');
  };

  const selectedIssue = openIssues.find((issue) => issue.id === activeIssueId) || null;
  const sentWriting = articles.filter((article) =>
    issueId(article.requestedIssue) === activeIssueId && !article.isMagazinePublished,
  );
  const selectedWriting = sentWriting.filter((article) => Boolean(article.classTeacherSelectedAt));
  const writingToReview = sentWriting.filter((article) => !article.classTeacherSelectedAt);
  const visibleWriting = curationView === 'selected' ? selectedWriting : writingToReview;

  const updateSelection = async (article, action) => {
    if (!selectedIssue || !selectedIssue.acceptingSubmissions) return;
    try {
      setBusyId(article.id);
      setError('');
      setSuccess('');
      const res = await fetch(`/api/teacher/magazine/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || 'Failed to update magazine writing');
      setSuccess(payload.message || 'Class selection updated');
      const selectedAt = payload.article?.classTeacherSelectedAt ?? null;
      setSelectedArticle((current) => (current?.id === article.id ? { ...current, classTeacherSelectedAt: selectedAt } : current));
      await load();
    } catch (updateError) {
      setError(updateError.message || 'Failed to update magazine writing');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      {error && <AlertBanner type="error" title="Magazine content unavailable" message={error} />}
      {success && <AlertBanner type="success" title="Magazine content updated" message={success} />}

      {loading ? <LoadingState title="Loading magazine content" message="Preparing your class submissions." /> : <>
        <section className="card p-3 sm:p-4">
          <label className="block text-sm font-semibold text-ink" htmlFor="teacher-magazine-issue">Open magazine</label>
          <select id="teacher-magazine-issue" value={activeIssueId} onChange={(event) => chooseIssue(event.target.value)} className="input mt-2 w-full sm:max-w-lg">
            <option value="">Choose a magazine</option>
            {openIssues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
          </select>
          {!openIssues.length && <p className="mt-3 text-sm text-muted">There are no magazines open for student writing right now.</p>}
        </section>

        {selectedIssue && <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-ink">Student writing ({sentWriting.length})</h3>
          </div>
          <div role="tablist" aria-label="Class writing selection" className="mb-3 flex border-b border-line">
            <button type="button" role="tab" aria-selected={curationView === 'review'} onClick={() => setCurationView('review')}
              className={`relative px-3 py-3 text-sm font-semibold ${curationView === 'review' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
              To review ({writingToReview.length})
              {curationView === 'review' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
            <button type="button" role="tab" aria-selected={curationView === 'selected'} onClick={() => setCurationView('selected')}
              className={`relative px-3 py-3 text-sm font-semibold ${curationView === 'selected' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
              Selected ({selectedWriting.length})
              {curationView === 'selected' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
          </div>
          {visibleWriting.length ? <PublishingTable
            rows={visibleWriting}
            statusHeader="School review"
            onOpen={(item) => { setSelectedArticle(item); setEditing(false); }}
            renderStatus={(article) => {
              const selected = Boolean(article.classTeacherSelectedAt);
              return <PlacementSwitch on={selected} busy={busyId === article.id} label={`School review selection for ${article.title}`} onText="Selected" offText="Select" onToggle={() => updateSelection(article, selected ? 'UNSELECT_FOR_SCHOOL' : 'SELECT_FOR_SCHOOL')} />;
            }}
          /> : <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">{curationView === 'selected' ? 'No writing from your class has been selected yet.' : 'No writing from your class is waiting for review.'}</p>}
        </section>}
      </>}

      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card bg-surface p-4 shadow-pop sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold text-ink">{selectedArticle.title}</h3><p className="mt-1 text-sm text-muted">{selectedArticle.authorStudent?.name} · {selectedArticle.authorStudent?.grade}</p></div>
              <div className="flex items-center gap-2">
                {!editing && selectedIssue?.acceptingSubmissions && !selectedArticle.isMagazinePublished && <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary btn-sm"><Pencil size={15} aria-hidden /> Edit</button>}
                <button type="button" onClick={() => { setSelectedArticle(null); setEditing(false); }} className="btn btn-ghost btn-sm" aria-label="Close writing"><X size={16} aria-hidden /></button>
              </div>
            </div>
            {editing ? <WritingEditForm article={selectedArticle} endpoint="/api/teacher/magazine" onCancel={() => setEditing(false)} onSaved={(saved, message) => { setSelectedArticle((current) => ({ ...current, ...saved })); setEditing(false); setSuccess(message || 'Changes saved'); void load(); }} /> : <>
              <WritingCover coverImage={selectedArticle.coverImage} images={selectedArticle.images} title={selectedArticle.title} className="mt-5 border border-line" imageClassName="h-auto max-h-[26rem] w-full object-contain" showCaption />
              <WritingTags tags={selectedArticle.tags} className="mt-4" />
              <WritingContent content={selectedArticle.content} className="mt-5 rounded-control border border-line bg-surface-2 p-4 text-sm leading-7 text-ink" />
              <WritingGallery images={selectedArticle.images} coverImage={selectedArticle.coverImage} title={selectedArticle.title} className="mt-5" />
              {selectedIssue?.acceptingSubmissions && !selectedArticle.isMagazinePublished && <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4 text-sm font-semibold text-ink">
                School review
                <PlacementSwitch on={Boolean(selectedArticle.classTeacherSelectedAt)} busy={busyId === selectedArticle.id} label={`School review selection for ${selectedArticle.title}`} onText="Selected" offText="Select" onToggle={() => updateSelection(selectedArticle, selectedArticle.classTeacherSelectedAt ? 'UNSELECT_FOR_SCHOOL' : 'SELECT_FOR_SCHOOL')} />
              </div>}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
