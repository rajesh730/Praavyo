"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays as FaCalendarAlt, Presentation as FaChalkboardTeacher, TriangleAlert as FaExclamationTriangle, Layers as FaLayerGroup, GraduationCap as FaUserGraduate } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import SchoolAnalytics from "@/components/school/SchoolAnalytics";
import AppDate from "@/components/common/AppDate";
import UpcomingPrograms from "@/components/programs/UpcomingPrograms";

function getCount(map = {}, key) {
  return Number(map?.[key] || 0);
}

function MetricCard({ icon: Icon, value, label, note, tone = "blue" }) {
  const tones = {
    blue: "bg-brand-soft text-brand-strong border-brand-line",
    emerald: "bg-success-soft text-success border-success-line",
    amber: "bg-warning-soft text-warning border-warning-line",
    purple: "bg-brand-soft text-brand-strong border-brand-line",
  };

  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-control border ${tones[tone]}`}>
          <Icon />
        </span>
        <strong className="text-2xl font-semibold text-ink">{value}</strong>
      </div>
      <p className="mt-4 text-sm font-semibold text-ink">{label}</p>
      <p className="mt-1 text-xs font-semibold text-muted">{note}</p>
    </div>
  );
}

function StatusBar({ label, value, total, tone = "blue" }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  const colors = {
    blue: "bg-brand",
    emerald: "bg-success",
    amber: "bg-warning",
    rose: "bg-danger",
    slate: "bg-subtle",
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-semibold text-ink">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${colors[tone]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/school/dashboard/stats", {
        cache: "no-store",
      });

      if (!res.ok) {
        setError("Dashboard numbers could not load.");
        return;
      }

      const data = await res.json();
      setStats(data.data);
      setError(null);
    } catch {
      setError("Dashboard numbers could not load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStats();
  }, []);

  const summary = useMemo(() => {
    const studentStatus = stats?.students?.byStatus || {};
    const teacherStatus = stats?.teachers?.byStatus || {};
    const eventLifecycle = stats?.events?.byLifecycle || {};
    const totalStudents = stats?.students?.total || 0;
    const totalTeachers = stats?.teachers?.total || 0;
    const totalEvents = stats?.events?.total || 0;
    const activeStudents = getCount(studentStatus, "ACTIVE");
    const activeTeachers = getCount(teacherStatus, "ACTIVE");
    const activeEvents = getCount(eventLifecycle, "ACTIVE");
    const gradeCount = stats?.students?.byGrade?.filter((grade) => grade.gradeName).length || 0;

    return {
      totalStudents,
      totalTeachers,
      totalEvents,
      activeStudents,
      inactiveStudents:
        getCount(studentStatus, "INACTIVE") +
        getCount(studentStatus, "SUSPENDED") +
        getCount(studentStatus, "ALUMNI"),
      activeTeachers,
      inactiveTeachers: getCount(teacherStatus, "INACTIVE"),
      activeEvents,
      completedEvents: getCount(eventLifecycle, "COMPLETED"),
      archivedEvents: getCount(eventLifecycle, "ARCHIVED"),
      gradeCount,
    };
  }, [stats]);

  if (loading) {
    return (
      <LoadingState
        title="Preparing overview"
        message="Loading school, student, teacher, and event status."
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Overview unavailable"
        description={error}
        actionLabel="Try again"
        onAction={fetchStats}
      />
    );
  }

  if (!stats) {
    return (
      <EmptyState
        title="No overview yet"
        description="Your school status will appear after students, teachers, or events are added."
      />
    );
  }

  const gradeRows = [...(stats.students?.byGrade || [])]
    .filter((grade) => grade.gradeName)
    .sort((a, b) => String(a.gradeName).localeCompare(String(b.gradeName)))
    .slice(0, 8);
  const recentActivity = stats.recentActivity || [];

  return (
    <section className="space-y-4">
      <UpcomingPrograms manageHref="/school/dashboard?tab=school-events" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FaUserGraduate}
          value={summary.totalStudents}
          label="Students"
          note={`${summary.activeStudents} active, ${summary.inactiveStudents} inactive or alumni`}
          tone="blue"
        />
        <MetricCard
          icon={FaChalkboardTeacher}
          value={summary.totalTeachers}
          label="Teachers"
          note={`${summary.activeTeachers} active mentors`}
          tone="emerald"
        />
        <MetricCard
          icon={FaCalendarAlt}
          value={summary.totalEvents}
          label="Events"
          note={`${summary.activeEvents} active, ${summary.completedEvents} completed`}
          tone="purple"
        />
        <MetricCard
          icon={FaLayerGroup}
          value={summary.gradeCount}
          label="Grades"
          note="Grades with active records"
          tone="amber"
        />
      </div>

      <SchoolAnalytics />

      <div className="card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">
              Student Distribution
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted">
              Grade-level record coverage.
            </p>
          </div>
          <FaUserGraduate className="text-2xl text-brand-strong" />
        </div>

        <div className="mt-5 space-y-3">
          {gradeRows.length === 0 ? (
            <div className="card border-dashed p-4 text-sm font-semibold text-muted">
              No grade distribution available yet.
            </div>
          ) : (
            gradeRows.map((grade) => (
              <StatusBar
                key={grade.gradeName}
                label={grade.gradeName}
                value={grade.count}
                total={summary.totalStudents}
                tone="blue"
              />
            ))
          )}
        </div>
      </div>

      <div className="card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">
              Recent School Activity
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted">
              Latest student, teacher, event, and system updates.
            </p>
          </div>
          <FaExclamationTriangle className="text-xl text-warning" />
        </div>

        <div className="mt-5 divide-line">
          {recentActivity.length === 0 ? (
            <div className="card border-dashed p-4 text-sm font-semibold text-muted">
              No recent activity yet.
            </div>
          ) : (
            recentActivity.slice(0, 8).map((item) => (
              <div key={`${item.type}-${item.id}`} className="grid gap-2 py-3 sm:grid-cols-[160px_minmax(0,1fr)_120px] sm:items-center">
                <span className="text-xs font-semibold uppercase text-muted">
                  {item.type}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="truncate text-xs font-semibold text-muted">
                    {item.description}
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted sm:text-right">
                  <AppDate value={item.createdAt} />
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
