'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Pencil, X } from 'lucide-react';
import AlertBanner from '@/components/ui/AlertBanner';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/ui/LoadingState';
import WritingContent from '@/components/WritingContent';
import WritingEditForm from '@/components/school/WritingEditForm';
import PublishingTable, { PlacementSwitch } from '@/components/school/PublishingTable';
import { gradeSummaries } from './shared';

function issueId(issue) {
  return issue?.id || '';
}

/**
 * A class teacher works only in a magazine while it is open for writing.
 * Published magazines remain visible for reference, but are strictly read-only
 * here; the school dashboard owns creation, final selection and publication.
 */
export default function MagazineContentTab({ workspace }) {
  const classGrades = useMemo(
    () => gradeSummaries(workspace)
      .filter((entry) => entry?.classTeacher)
      .map((entry) => entry.grade)
      .filter(Boolean),
    [workspace],
  );
  const [issues, setIssues] = useState([]);
  const [articles, setArticles] = useState([]);
  const [issueView, setIssueView] = useState('open');
  const [curationView, setCurationView] = useState('review');
  const [publishedWritingView, setPublishedWritingView] = useState('published');
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

  useEffect(() => { void load(); }, [load]);

  const openIssues = useMemo(
    () => issues.filter((issue) => issue.status === 'DRAFT' && issue.acceptingSubmissions),
    [issues],
  );
  const publishedIssues = useMemo(
    () => issues.filter((issue) => issue.status === 'PUBLISHED'),
    [issues],
  );
  const visibleIssues = issueView === 'open' ? openIssues : publishedIssues;

  useEffect(() => {
    setSelectedIssueId((current) => visibleIssues.some((issue) => issue.id === current)
      ? current
      : visibleIssues[0]?.id || '');
  }, [visibleIssues]);

  useEffect(() => {
    setCurationView('review');
    setPublishedWritingView('published');
  }, [selectedIssueId]);

  const selectedIssue = visibleIssues.find((issue) => issue.id === selectedIssueId) || null;
  const unpublishedWriting = articles.filter((article) =>
    issueId(article.requestedIssue) === selectedIssueId && !article.isMagazinePublished,
  );
  const publishedWriting = articles.filter((article) =>
    issueId(article.magazineIssue) === selectedIssueId && article.isMagazinePublished,
  );
  const selectedWriting = unpublishedWriting.filter((article) => Boolean(article.classTeacherSelectedAt));
  const writingToReview = unpublishedWriting.filter((article) => !article.classTeacherSelectedAt);
  const visibleCurationWriting = curationView === 'selected' ? selectedWriting : writingToReview;

  const updateSelection = async (article, action) => {
    if (!selectedIssue || selectedIssue.status !== 'DRAFT' || !selectedIssue.acceptingSubmissions) return;
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
      await load();
    } catch (updateError) {
      setError(updateError.message || 'Failed to update magazine writing');
    } finally {
      setBusyId('');
    }
  };

  if (!classGrades.length) {
    return <EmptyState icon={BookOpen} title="For class teachers" description="Only class teachers can curate writing for the school magazine." />;
  }

  return (
    <div className="space-y-4">
      {error && <AlertBanner type="error" title="Magazine content unavailable" message={error} />}
      {success && <AlertBanner type="success" title="Magazine content updated" message={success} />}

      {loading ? <LoadingState title="Loading magazine content" message="Preparing your class submissions." /> : (
        <>
          <div role="tablist" aria-label="Magazine status" className="flex border-b border-line">
            <button type="button" role="tab" aria-selected={issueView === 'open'} onClick={() => setIssueView('open')}
              className={`relative px-3 py-3 text-sm font-semibold ${issueView === 'open' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
              Open to write ({openIssues.length})
              {issueView === 'open' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
            <button type="button" role="tab" aria-selected={issueView === 'published'} onClick={() => setIssueView('published')}
              className={`relative px-3 py-3 text-sm font-semibold ${issueView === 'published' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
              Published magazines ({publishedIssues.length})
              {issueView === 'published' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
          </div>

          <section className="card p-3 sm:p-4">
            <label className="block text-sm font-semibold text-ink" htmlFor="teacher-magazine-issue">
              {issueView === 'open' ? 'Open magazine' : 'Published magazine'}
            </label>
            <select id="teacher-magazine-issue" value={selectedIssueId} onChange={(event) => setSelectedIssueId(event.target.value)} className="input mt-2 w-full sm:max-w-lg">
              <option value="">Choose a magazine</option>
              {visibleIssues.map((issue) => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
            </select>
            {!issues.length && <p className="mt-3 text-sm text-muted">The school has not created a magazine yet.</p>}
            {issues.length > 0 && !visibleIssues.length && <p className="mt-3 text-sm text-muted">{issueView === 'open' ? 'There are no magazines open for student writing right now.' : 'No magazines have been published yet.'}</p>}
          </section>

          {selectedIssue && (
            <>
              {selectedIssue.status === 'DRAFT' ? <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-ink">Student writing ({unpublishedWriting.length})</h3>
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
                {visibleCurationWriting.length ? <PublishingTable
                  rows={visibleCurationWriting}
                  statusHeader="School review"
                  onOpen={(item) => { setSelectedArticle(item); setEditing(false); }}
                  renderStatus={(article) => {
                    const selected = Boolean(article.classTeacherSelectedAt);
                    return <PlacementSwitch
                      on={selected}
                      busy={busyId === article.id}
                      label={`School review selection for ${article.title}`}
                      onText="Selected"
                      offText="Select"
                      onToggle={() => updateSelection(article, selected ? 'UNSELECT_FOR_SCHOOL' : 'SELECT_FOR_SCHOOL')}
                    />;
                  }}
                /> : <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">{curationView === 'selected' ? 'No writing from your class has been selected yet.' : 'No writing from your class is waiting for review.'}</p>}
              </section> : <section>
                <div role="tablist" aria-label="Published magazine writing" className="mb-3 flex border-b border-line">
                  <button type="button" role="tab" aria-selected={publishedWritingView === 'published'} onClick={() => setPublishedWritingView('published')}
                    className={`relative px-3 py-3 text-sm font-semibold ${publishedWritingView === 'published' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
                    Published writing for this magazine ({publishedWriting.length})
                    {publishedWritingView === 'published' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
                  </button>
                  <button type="button" role="tab" aria-selected={publishedWritingView === 'not-published'} onClick={() => setPublishedWritingView('not-published')}
                    className={`relative px-3 py-3 text-sm font-semibold ${publishedWritingView === 'not-published' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
                    Writing not published in this magazine ({unpublishedWriting.length})
                    {publishedWritingView === 'not-published' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
                  </button>
                </div>
                {publishedWritingView === 'published' ? (
                  publishedWriting.length ? <PublishingTable rows={publishedWriting} statusHeader="Magazine status" renderStatus={() => 'Published'} onOpen={(item) => { setSelectedArticle(item); setEditing(false); }} /> : <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">No writing from your class was published in this magazine.</p>
                ) : (
                  unpublishedWriting.length ? <PublishingTable rows={unpublishedWriting} statusHeader="Magazine status" renderStatus={() => 'Not published'} onOpen={(item) => { setSelectedArticle(item); setEditing(false); }} /> : <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-muted">No other writing from your class was sent to this magazine.</p>
                )}
              </section>}
            </>
          )}
        </>
      )}

      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card bg-surface p-4 shadow-pop sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold text-ink">{selectedArticle.title}</h3><p className="mt-1 text-sm text-muted">{selectedArticle.authorStudent?.name} · {selectedArticle.authorStudent?.grade}</p></div>
              <div className="flex items-center gap-2">
                {!editing && selectedIssue?.status === 'DRAFT' && selectedIssue.acceptingSubmissions && !selectedArticle.isMagazinePublished && <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary btn-sm"><Pencil size={15} aria-hidden /> Edit</button>}
                <button type="button" onClick={() => { setSelectedArticle(null); setEditing(false); }} className="btn btn-ghost btn-sm" aria-label="Close writing"><X size={16} aria-hidden /></button>
              </div>
            </div>
            {editing ? <WritingEditForm article={selectedArticle} endpoint="/api/teacher/magazine" onCancel={() => setEditing(false)} onSaved={(saved, message) => { setSelectedArticle((current) => ({ ...current, ...saved })); setEditing(false); setSuccess(message || 'Changes saved'); void load(); }} /> : <WritingContent content={selectedArticle.content} className="mt-5 rounded-control border border-line bg-surface-2 p-4 text-sm leading-7 text-ink" />}
          </div>
        </div>
      )}
    </div>
  );
}
