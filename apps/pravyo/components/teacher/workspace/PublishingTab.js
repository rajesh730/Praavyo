'use client';

import { useMemo } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { BookOpen } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import SchoolMagazineReviewManager from '@/components/school/SchoolMagazineReviewManager';
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
    <SchoolMagazineReviewManager
      listEndpoint="/api/teacher/publishing"
      articleEndpoint="/api/teacher/publishing"
      trackUnread={false}
      providedGradeOptions={classGrades}
      selectedGrade={activeGrade}
      onGradeChange={setGrade}
    />
  );
}
