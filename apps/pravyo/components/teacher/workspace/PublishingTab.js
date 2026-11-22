'use client';

import { useMemo } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { BookOpen } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import SchoolMagazineReviewManager from '@/components/school/SchoolMagazineReviewManager';
import MagazineContentTab from './MagazineContentTab';
import { gradeSummaries } from './shared';

/**
 * The class teacher's Publishing Desk: the school's Free Writing tab, limited
 * to the grades they are class teacher of (Teachers page). The server checks
 * the grade again on every read and change (/api/teacher/publishing). The
 * School Magazine stays with the school.
 */
export default function PublishingTab({ workspace }) {
  const classGrades = useMemo(
    () => gradeSummaries(workspace).filter((entry) => entry.classTeacher).map((entry) => entry.grade),
    [workspace],
  );
  const [grade, setGrade] = useRememberedState('teacher-workspace:publishing-grade', 'ALL');
  const [activeDesk, setActiveDesk] = useRememberedState('teacher-workspace:publishing-desk', 'free-writing');
  const activeGrade = classGrades.includes(grade) ? grade : 'ALL';

  if (!classGrades.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="For class teachers"
        description="Class teachers manage their grade's student writing here. Your school makes you a class teacher on its Teachers page."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Publishing desk" className="flex border-b border-line">
        <button type="button" role="tab" aria-selected={activeDesk !== 'magazine'} onClick={() => setActiveDesk('free-writing')}
          className={`relative px-3 py-3 text-sm font-semibold ${activeDesk !== 'magazine' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
          Free Writing
          {activeDesk !== 'magazine' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
        </button>
        <button type="button" role="tab" aria-selected={activeDesk === 'magazine'} onClick={() => setActiveDesk('magazine')}
          className={`relative px-3 py-3 text-sm font-semibold ${activeDesk === 'magazine' ? 'text-brand-strong' : 'text-muted hover:text-ink'}`}>
          Magazine
          {activeDesk === 'magazine' && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
        </button>
      </div>

      {activeDesk === 'magazine' ? (
        <MagazineContentTab workspace={workspace} />
      ) : (
        <SchoolMagazineReviewManager
          listEndpoint="/api/teacher/publishing"
          articleEndpoint="/api/teacher/publishing"
          trackUnread={false}
          providedGradeOptions={classGrades}
          selectedGrade={activeGrade}
          onGradeChange={setGrade}
        />
      )}
    </div>
  );
}
