"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download as FaDownload, Plus as FaPlus, QrCode, Search as FaSearch, Upload as FaUpload, Settings2 } from "lucide-react";
import { TableSkeleton } from "@/components/Skeletons";
import PaginationControls from "@/components/PaginationControls";
import EmptyState from "@/components/EmptyState";
import AppDate from "@/components/common/AppDate";
import AlertBanner from "@/components/ui/AlertBanner";
import TeacherDetailPanel, { describeAssignments } from "@/components/dashboard/TeacherDetailPanel";
import TeacherLoginCardDialog from "@/components/dashboard/TeacherLoginCardDialog";

const FILTERS = [
  { id: "CURRENT", label: "Current", count: (c) => c.ACTIVE + c.INACTIVE },
  { id: "ACTIVE", label: "Active", count: (c) => c.ACTIVE },
  { id: "INACTIVE", label: "Inactive", count: (c) => c.INACTIVE },
  { id: "LEFT", label: "Left", count: (c) => c.LEFT },
];

const STATUS_BADGE = {
  ACTIVE: "badge badge-success",
  INACTIVE: "badge badge-warning",
  LEFT: "badge badge-neutral",
};
const STATUS_LABEL = { ACTIVE: "Active", INACTIVE: "Inactive", LEFT: "Left" };

const initialsFor = (name = "Teacher") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TR";

/**
 * The school's Teacher section: every teacher with a membership here, their
 * responsibilities at a glance, and one "Manage" panel for everything else.
 */
export default function TeacherManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teachers, setTeachers] = useState([]);
  const [counts, setCounts] = useState({ ACTIVE: 0, INACTIVE: 0, LEFT: 0 });
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalTeachers: 0, limit: 20 });
  // Filters and the page are remembered until the page is refreshed.
  const [search, setSearch] = useRememberedState("teachers:search", "");
  const [status, setStatus] = useRememberedState("teachers:status", "CURRENT");
  const [rememberedPage, setRememberedPage] = useRememberedState("teachers:page", 1);
  const initialPageRef = useRef(rememberedPage);
  const [feedback, setFeedback] = useState(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [cardTeacher, setCardTeacher] = useState(null);
  // /school/dashboard?tab=teachers&teacher=<id> opens that teacher straight
  // away — used right after registration to assign classes.
  const openTeacherId = selectedTeacherId || searchParams.get("teacher");

  const fetchTeachers = useCallback(async (page = 1) => {
    setLoading(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams({ page, limit: 20, status, ...(search && { search }) });
      const res = await fetch(`/api/teachers?${params}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load teachers.");
      setTeachers(data.teachers || []);
      setCounts(data.counts || { ACTIVE: 0, INACTIVE: 0, LEFT: 0 });
      setPagination(data.pagination || { page: 1, totalPages: 1, totalTeachers: 0, limit: 20 });
      setRememberedPage(data.pagination?.page || page);
    } catch (error) {
      setTeachers([]);
      setFeedback({
        type: "error",
        title: "Teachers could not be loaded",
        message: error.message || "Please retry after checking your connection.",
        retryPage: page,
      });
    } finally {
      setLoading(false);
    }
  }, [search, status, setRememberedPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const page = initialPageRef.current || 1;
      initialPageRef.current = 1;
      fetchTeachers(page);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchTeachers]);

  const closePanel = () => {
    setSelectedTeacherId(null);
    if (searchParams.get("teacher")) router.replace("/school/dashboard?tab=teachers");
  };

  const handleExportCsv = () => {
    if (teachers.length === 0) {
      setFeedback({ type: "error", title: "No teachers to export", message: "Adjust filters or add teachers before exporting." });
      return;
    }
    const headers = ["Name", "Username", "Email", "Phone", "Designation", "Responsibilities", "Status", "Joined", "Left"];
    const rows = teachers.map((teacher) => [
      teacher.name || "",
      teacher.username || "",
      teacher.email || "",
      teacher.phone || "",
      teacher.designation || "",
      describeAssignments(teacher.assignments).join("; "),
      STATUS_LABEL[teacher.status] || teacher.status,
      teacher.dateOfJoining ? String(teacher.dateOfJoining).slice(0, 10) : "",
      teacher.leftAt ? String(teacher.leftAt).slice(0, 10) : "",
    ]);
    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `teachers-${status.toLowerCase()}-page-${pagination.page || 1}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-semibold text-ink">Teachers</h1>
          <p className="mt-1 text-sm text-muted">
            Register teachers, assign their grades, subjects and class-teacher roles, open exam mark entry, and manage who can sign in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/school/dashboard?tab=register-teacher&mode=bulk" className="btn btn-secondary inline-flex items-center justify-center gap-2">
            <FaUpload /> Import
          </Link>
          <button type="button" onClick={handleExportCsv} className="btn btn-secondary inline-flex items-center justify-center gap-2">
            <FaDownload /> Export CSV
          </button>
          <Link href="/school/dashboard?tab=register-teacher" className="btn btn-primary inline-flex items-center justify-center gap-2">
            <FaPlus /> Add teacher
          </Link>
        </div>
      </div>

      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          action={feedback.retryPage ? <button type="button" onClick={() => fetchTeachers(feedback.retryPage)} className="btn btn-ghost btn-sm">Retry</button> : null}
        />
      )}

      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Teacher status">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={status === filter.id}
              onClick={() => setStatus(filter.id)}
              className={`btn btn-sm ${status === filter.id ? "btn-primary" : "btn-ghost"}`}
            >
              {filter.label} <span className="ml-1 opacity-75">{filter.count(counts)}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:w-80">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search name, username, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full pl-11 pr-4"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm text-ink">
            <thead className="border-b border-line bg-surface text-2xs uppercase text-muted">
              <tr>
                <th className="px-4 py-2.5">Teacher</th>
                <th className="px-4 py-2.5">Login</th>
                <th className="px-4 py-2.5">Teaches</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-line">
              {loading ? (
                <tr><td colSpan="5" className="p-6 text-center text-muted"><TableSkeleton /></td></tr>
              ) : teachers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-muted">
                    <EmptyState
                      title={search ? "No teachers match this search" : status === "LEFT" ? "No teachers have left" : "No teachers here yet"}
                      description={search ? "Try a different name, username, email or phone." : "Add a teacher, then assign their grades and subjects."}
                    />
                  </td>
                </tr>
              ) : (
                teachers.map((teacher) => {
                  const responsibilities = describeAssignments(teacher.status === "LEFT" ? teacher.endedAssignments : teacher.assignments);
                  return (
                    <tr key={teacher._id} className="align-top transition-colors hover:bg-surface">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                            {initialsFor(teacher.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">{teacher.name}</span>
                            <span className="block truncate text-xs text-muted">{teacher.designation || "Teacher"}</span>
                            {teacher.worksElsewhere && <span className="mt-1 inline-block text-xs text-brand-strong">Also at another school</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{teacher.username || <span className="text-muted">No username</span>}</div>
                        <div className="text-xs text-muted">{teacher.email}</div>
                        {teacher.phone && <div className="text-xs text-muted">{teacher.phone}</div>}
                        {teacher.status !== "LEFT" && (
                          <button
                            type="button"
                            onClick={() => setCardTeacher(teacher)}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-strong hover:underline"
                          >
                            <QrCode size={14} aria-hidden /> Login card
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {responsibilities.length === 0 ? (
                          <span className="text-xs text-muted">{teacher.status === "LEFT" ? "—" : "Not assigned yet"}</span>
                        ) : (
                          <ul className={`space-y-1 ${teacher.status === "LEFT" ? "opacity-60" : ""}`}>
                            {responsibilities.map((line, index) => (
                              <li key={`${line}-${index}`}>
                                <span className={line.endsWith("Class Teacher") ? "badge badge-brand text-xs" : "badge badge-neutral text-xs"}>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`${STATUS_BADGE[teacher.status]} text-xs`}>{STATUS_LABEL[teacher.status]}</span>
                        {teacher.status === "LEFT" && (
                          <div className="mt-1 text-xs text-muted">on <AppDate value={teacher.leftAt} fallback="—" /></div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTeacherId(teacher._id)}
                          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
                        >
                          <Settings2 size={14} aria-hidden /> {teacher.status === "LEFT" ? "View" : "Manage"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && teachers.length > 0 && (
          <div className="border-t border-line p-4">
            <PaginationControls
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(page) => fetchTeachers(page)}
              totalItems={pagination.totalTeachers}
              start={pagination.start}
              end={pagination.end}
            />
          </div>
        )}
      </div>

      {cardTeacher && <TeacherLoginCardDialog teacher={cardTeacher} onClose={() => setCardTeacher(null)} />}

      {openTeacherId && (
        <TeacherDetailPanel
          teacherId={openTeacherId}
          onClose={closePanel}
          onChanged={() => fetchTeachers(pagination.page || 1)}
        />
      )}
    </div>
  );
}
