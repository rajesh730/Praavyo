'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Feather, X } from 'lucide-react';
import AlertBanner from '@/components/ui/AlertBanner';
import EmptyState from '@/components/EmptyState';
import LoadingState from '@/components/ui/LoadingState';
import WritingContent, { WritingPreview } from '@/components/WritingContent';
import { WritingCover, WritingTags } from '@/components/WritingMedia';
import AppDate from '@/components/common/AppDate';
import { getWritingCategoryLabel } from '@/lib/writingCategories';

function IssueCard({ issue, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(issue.id)} className="card group p-4 text-left transition-colors hover:border-brand-line hover:bg-surface-2 hover:shadow-pop">
      <div className="surface-brand relative h-40 overflow-hidden rounded-control">
        <div className="absolute left-5 top-6 h-20 w-14 -rotate-6 rounded-control bg-surface shadow-card" />
        <div className="absolute left-20 top-10 h-20 w-14 rotate-6 rounded-control bg-surface shadow-card" />
        <BookOpen className="absolute right-6 top-8 text-2xl text-white" aria-hidden />
        <Feather className="absolute bottom-6 left-7 text-2xl text-white" aria-hidden />
        <span className="badge badge-neutral absolute bottom-4 right-4">
          {issue.articleCount} {issue.articleCount === 1 ? 'writing' : 'writings'}
        </span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-brand-strong">{issue.monthLabel}</p>
      <h3 className="mt-1 font-semibold text-ink group-hover:text-brand-strong">{issue.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
        {issue.coverArticle?.title ? `Featuring “${issue.coverArticle.title}” and other selected writing.` : 'A curated collection of student writing.'}
      </p>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-strong">Open magazine <ChevronRight size={16} aria-hidden /></span>
    </button>
  );
}

function MagazineReader({ issueId, onBack }) {
  const [issue, setIssue] = useState(null);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/teacher/published-magazines/${issueId}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || 'Failed to load magazine');
      setIssue(payload.issue || null);
      setArticles(Array.isArray(payload.articles) ? payload.articles : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load magazine');
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState title="Opening magazine" message="Loading this published issue." />;
  if (error || !issue) return <AlertBanner type="error" title="Unable to open magazine" message={error || 'Magazine not found.'} />;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-secondary inline-flex w-fit items-center gap-2"><ArrowLeft size={16} aria-hidden /> Back to magazines</button>
      <section className="surface-brand rounded-card p-5 text-white shadow-pop sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide">Published school magazine</p>
        <h2 className="mt-2 text-2xl font-semibold">{issue.title}</h2>
        <p className="mt-3 text-sm font-semibold text-white">{articles.length} selected {articles.length === 1 ? 'writing' : 'writings'} · Published <AppDate value={issue.publishedAt || issue.weekStart} /></p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {articles.map((article, index) => (
          <button key={article.id} type="button" onClick={() => setSelectedArticle(article)} className="card group p-4 text-left transition-colors hover:border-brand-line hover:bg-surface-2 hover:shadow-pop">
            <WritingCover coverImage={article.coverImage} images={article.images} title={article.title} className="mb-4 aspect-[16/9]" />
            <div className="flex items-start justify-between gap-3">
              <span className="badge badge-brand">{getWritingCategoryLabel(article.category)}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">{index + 1}</span>
            </div>
            <h3 className="mt-4 line-clamp-2 font-semibold leading-snug text-ink group-hover:text-brand-strong">{article.title}</h3>
            <WritingPreview content={article.content} maxLength={180} className="mt-3 line-clamp-4 text-sm leading-5 text-muted" />
            <WritingTags tags={article.tags} className="mt-3" />
            <p className="mt-3 text-xs font-semibold text-muted">{article.authorStudent?.name || 'Student'} · {article.authorStudent?.grade || 'Grade'} · <AppDate value={article.publishedAt} /></p>
            <span className="mt-4 inline-flex text-sm font-semibold text-brand-strong">Read full writing</span>
          </button>
        ))}
      </section>

      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card bg-surface p-4 shadow-pop sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-semibold text-ink">{selectedArticle.title}</h3><p className="mt-1 text-sm text-muted">{selectedArticle.authorStudent?.name || 'Student'} · {selectedArticle.authorStudent?.grade || 'Grade'}</p></div>
              <button type="button" onClick={() => setSelectedArticle(null)} className="btn btn-ghost btn-sm" aria-label="Close writing"><X size={16} aria-hidden /></button>
            </div>
            <WritingCover coverImage={selectedArticle.coverImage} images={selectedArticle.images} title={selectedArticle.title} className="mt-5" />
            <WritingTags tags={selectedArticle.tags} className="mt-4" />
            <WritingContent content={selectedArticle.content} className="mt-5 rounded-control border border-line bg-surface-2 p-4 text-sm leading-7 text-ink" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherPublishedMagazineLibrary() {
  const [issues, setIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/teacher/published-magazines', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || 'Failed to load published magazines');
      setIssues(Array.isArray(payload.issues) ? payload.issues : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load published magazines');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (selectedIssueId) return <MagazineReader issueId={selectedIssueId} onBack={() => setSelectedIssueId('')} />;
  if (loading) return <LoadingState title="Opening School Magazine" message="Loading published magazine issues." />;
  if (error) return <AlertBanner type="error" title="Unable to load School Magazine" message={error} />;
  if (!issues.length) return <EmptyState icon={BookOpen} title="No published magazine issues" description="Published school magazines will appear here." />;

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-semibold text-ink">Published magazines</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {issues.map((issue) => <IssueCard key={issue.id} issue={issue} onOpen={setSelectedIssueId} />)}
      </div>
    </section>
  );
}
