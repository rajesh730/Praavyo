"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import Link from "next/link";
import { LineChart as FaChartLine, CircleCheck as FaCheckCircle, Copy as FaCopy, Download as FaDownload, SquarePen as FaEdit, ListFilter as FaFilter, GraduationCap as FaGraduationCap, KeyRound as FaKey, Plus as FaPlus, Search as FaSearch, Trash2 as FaTrash, Upload as FaUpload, GraduationCap as FaUserGraduate, UserX as FaUserSlash } from "lucide-react";
import { normalizeGradeValue } from "@/lib/schoolGrades";
import { TableSkeleton } from "@/components/Skeletons";
import PaginationControls from "@/components/PaginationControls";
import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import CredentialsModal from "@/components/CredentialsModal";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function StudentManager({ initialGrade, hideGradeFilter = false }) {
  // Data State
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalStudents: 0,
    limit: 10,
  });

  // Filter State
  const [grades, setGrades] = useState([]);
  const [sectionsByGrade, setSectionsByGrade] = useState({});
  // Filters and the page are remembered until the page is refreshed.
  const memoryKey = `students:${initialGrade || "all"}`;
  const [selectedGrade, setSelectedGrade] = useRememberedState(`${memoryKey}:grade`, initialGrade || "");
  const [selectedSection, setSelectedSection] = useRememberedState(`${memoryKey}:section`, "ALL");
  const [selectedStatus, setSelectedStatus] = useRememberedState(`${memoryKey}:status`, "ALL");
  const [search, setSearch] = useRememberedState(`${memoryKey}:search`, "");
  const [rememberedPage, setRememberedPage] = useRememberedState(`${memoryKey}:page`, 1);
  // Returning to this screen reopens the remembered page; a filter change
  // afterwards starts again from page 1.
  const initialPageRef = useRef(rememberedPage);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [bulkSection, setBulkSection] = useState("");
  const [savingSectionIds, setSavingSectionIds] = useState([]);
  const [studentStats, setStudentStats] = useState(null);

  // Edit State
  const [editingStudent, setEditingStudent] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState({
    isOpen: false,
    credentials: null,
  });
  const [feedback, setFeedback] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const sectionsForGrade = (grade) => {
    const normalized = normalizeGradeValue(grade);
    return sectionsByGrade[normalized] || sectionsByGrade[grade] || [];
  };
  
  useEffect(() => {
    if (initialGrade) {
      setSelectedGrade(initialGrade);
    }
  }, [initialGrade, setSelectedGrade]);

  // Fetch Grades
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const res = await fetch("/api/school/grade-structure");
        if (res.ok) {
          const data = await res.json();
          setGrades(data.grades || []);
        }
      } catch (error) {
        console.error("Error fetching grades:", error);
      }
    };
    fetchGrades();
  }, []);

  useEffect(() => {
    fetch("/api/school/sections", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setSectionsByGrade(Object.fromEntries((data?.sections || []).map((row) => [row.grade, row.sections || []]))))
      .catch(() => setSectionsByGrade({}));
  }, []);

  const fetchStudentStats = useCallback(async () => {
    try {
      const res = await fetch("/api/school/dashboard/stats", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setStudentStats(data.data?.students || null);
      }
    } catch (error) {
      console.error("Error fetching student stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchStudentStats();
  }, [fetchStudentStats]);

  // Fetch Students
  const fetchStudents = useCallback(
    async (page = 1) => {
      setLoading(true);
      setFeedback(null);
      try {
        const params = new URLSearchParams({
          page,
          limit: 10,
          status: selectedStatus,
          ...(search.trim() && { search: search.trim() }),
          ...(selectedGrade && { grade: selectedGrade }),
          ...(selectedSection !== "ALL" && { section: selectedSection }),
        });

        const res = await fetch(`/api/students?${params}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || "Failed to load students.");
        }

        const nextStudents = Array.isArray(data.students) ? data.students : [];
        setStudents(nextStudents);
        setRememberedPage(data.pagination?.currentPage || page);
        if (data.pagination) {
          setPagination({
            page: data.pagination.currentPage,
            totalPages: data.pagination.totalPages,
            totalStudents: data.pagination.totalStudents,
            limit: data.pagination.limit,
            start: data.pagination.start,
            end: data.pagination.end,
          });
        } else {
          setPagination({
            page: 1,
            totalPages: 1,
            totalStudents: nextStudents.length,
            limit: nextStudents.length,
          });
        }
      } catch (error) {
        console.error("Error fetching students:", error);
        setStudents([]);
        setFeedback({
          type: "error",
          title: "Students could not be loaded",
          message:
            error.message ||
            "Please retry. If it continues, check your connection and server logs.",
          retry: () => fetchStudents(page),
        });
      } finally {
        setLoading(false);
      }
    },
    [search, selectedGrade, selectedSection, selectedStatus, setRememberedPage]
  );

  const handleSectionAssignment = async (studentIds, grade, section) => {
    if (!grade || !studentIds.length) return;
    setSavingSectionIds((current) => [...new Set([...current, ...studentIds])]);
    setFeedback(null);
    try {
      const response = await fetch("/api/students/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, studentIds, section }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not assign section.");
      setStudents((current) => current.map((student) =>
        studentIds.includes(String(student._id)) ? { ...student, section: section || "" } : student,
      ));
      setSelectedStudentIds([]);
      setFeedback({
        type: "success",
        title: "Section assignment saved",
        message: `${data.updatedCount || studentIds.length} student${studentIds.length === 1 ? "" : "s"} updated${section ? ` to ${section}` : " to no section"}.`,
      });
    } catch (error) {
      setFeedback({ type: "error", title: "Section was not assigned", message: error.message });
    } finally {
      setSavingSectionIds((current) => current.filter((id) => !studentIds.includes(id)));
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const page = initialPageRef.current || 1;
      initialPageRef.current = 1;
      fetchStudents(page);
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchStudents]);

  // Page Change Handlers
  const handlePageChange = (newPage) => {
    fetchStudents(newPage);
  };

  const handleEdit = (student) => {
    setEditingStudent({ ...student });
    setIsEditModalOpen(true);
  };

  const handleCopyLogin = async (student) => {
    if (!student.username) return;
    try {
      await navigator.clipboard.writeText(student.username);
      setFeedback({
        type: "success",
        title: "Login ID copied",
        message: `${student.username} is ready to share with ${student.name}.`,
      });
    } catch (error) {
      console.error("Could not copy login ID:", error);
      setFeedback({
        type: "error",
        title: "Login ID was not copied",
        message: "Please copy it manually from the student row.",
      });
    }
  };

  const handleExportCsv = () => {
    if (students.length === 0) {
      setFeedback({
        type: "error",
        title: "No students to export",
        message: "Adjust filters or add students before exporting.",
      });
      return;
    }

    const headers = [
      "Name",
      "Student ID",
      "Grade",
      "Roll Number",
      "Registration Number",
      "Login ID",
      "Status",
      "Parent Name",
      "Parent Contact",
      "Email",
      "Phone",
    ];
    const rows = students.map((student) => [
      student.name || "",
      student.platformStudentId || "",
      student.grade || "",
      student.rollNumber || "",
      student.registrationNumber || "",
      student.username || "",
      student.status || "",
      student.parentName || "",
      student.parentContactNumber || student.parentPhone || "",
      student.email || "",
      student.phone || "",
    ]);

    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `students-page-${pagination.page || 1}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const requestDelete = (student) => {
    setConfirmState({
      type: "archive",
      student,
      title: "Archive this student?",
      message: `${student.name} will be removed from active student lists, but their record will stay safely archived for reporting and history.`,
      confirmLabel: "Archive student",
      tone: "danger",
      busy: false,
    });
  };

  const executeDelete = async (student) => {
    try {
      setConfirmState((current) => ({ ...current, busy: true }));
      const res = await fetch(`/api/students/${student._id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to archive student.");
      }

      setConfirmState(null);
      setFeedback({
        type: "success",
        title: "Student archived",
        message: `${student.name} is no longer shown in active student records.`,
      });
      await fetchStudents(pagination.page);
      await fetchStudentStats();
    } catch (error) {
      console.error("Error deleting student:", error);
      setConfirmState(null);
      setFeedback({
        type: "error",
        title: "Student was not archived",
        message: error.message || "Please retry after checking the connection.",
      });
    }
  };

  const requestResetPassword = (student) => {
    setConfirmState({
      type: "reset-password",
      student,
      title: "Reset student password?",
      message: `${student.name}'s password will go back to password@123. They sign in with their IEMIS number and can then choose a new password.`,
      confirmLabel: "Reset password",
      tone: "warning",
      busy: false,
    });
  };

  const executeResetPassword = async (student) => {
    try {
      setConfirmState((current) => ({ ...current, busy: true }));
      const res = await fetch(`/api/students/${student._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setConfirmState(null);
      setFeedback({
        type: "success",
        title: "Password reset",
        message: `${student.name}'s password is now password@123.`,
      });

      if (data.credentials) {
        setCredentialsModal({
          isOpen: true,
          credentials: data.credentials,
        });
      }
    } catch (error) {
      console.error("Error resetting student password:", error);
      setConfirmState(null);
      setFeedback({
        type: "error",
        title: "Password was not reset",
        message: error.message || "Failed to reset student password",
      });
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`/api/students/${editingStudent._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingStudent),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to update student.");
      }

      await fetchStudents(pagination.page);
      await fetchStudentStats();
      setIsEditModalOpen(false);
      setEditingStudent(null);
      setFeedback({
        type: "success",
        title: "Student updated",
        message: `${data.name || editingStudent.name} has been saved successfully.`,
      });
    } catch (error) {
      console.error("Error updating student:", error);
      setFeedback({
        type: "error",
        title: "Student was not updated",
        message: error.message || "Please retry after checking the details.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const statusCounts = studentStats?.byStatus || {};
  const totalStudentCount =
    typeof studentStats?.total === "number"
      ? studentStats.total
      : pagination.totalStudents || students.length;
  const activeStudentCount = Number(statusCounts.ACTIVE || 0);
  const inactiveStudentCount =
    Number(statusCounts.INACTIVE || 0) + Number(statusCounts.SUSPENDED || 0);
  const alumniStudentCount = Number(statusCounts.ALUMNI || 0);
  const participationReady =
    totalStudentCount > 0
      ? Math.round((activeStudentCount / totalStudentCount) * 100)
      : 0;

  const metricCards = [
    {
      label: "Total Students",
      value: totalStudentCount,
      note: `${activeStudentCount} active`,
      icon: FaUserGraduate,
      tone: "purple",
    },
    {
      label: "Active Students",
      value: activeStudentCount,
      note: "Ready for events",
      icon: FaCheckCircle,
      tone: "emerald",
    },
    {
      label: "Inactive Records",
      value: inactiveStudentCount,
      note: "Not active now",
      icon: FaUserSlash,
      tone: "amber",
    },
    {
      label: "Participation Ready",
      value: `${participationReady}%`,
      note: `${activeStudentCount} of ${totalStudentCount || 0} students`,
      icon: FaChartLine,
      tone: "blue",
    },
    {
      label: "Graduated",
      value: alumniStudentCount,
      note: "Alumni records",
      icon: FaGraduationCap,
      tone: "violet",
    },
  ];

  const toneClasses = {
    purple: "border-brand-line bg-brand-soft text-brand-strong",
    emerald: "border-success-line bg-success-soft text-success",
    amber: "border-warning-line bg-warning-soft text-warning",
    blue: "border-brand-line bg-brand-soft text-brand-strong",
    violet: "border-brand-line bg-brand-soft text-brand-strong",
  };

  const initialsFor = (name = "Student") =>
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "ST";

  return (
    <div className="space-y-4">
      {!hideGradeFilter && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-semibold text-ink">Students</h1>
            <p className="mt-1 text-sm text-muted">
              Manage student accounts, login IDs, participation, and access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/school/dashboard?tab=sections"
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              Manage Sections
            </Link>
            <Link
              href="/school/dashboard?tab=register-student"
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaUpload />
              Import Students
            </Link>
            <button
              type="button"
              onClick={handleExportCsv}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaDownload />
              Export CSV
            </button>
            <Link
              href="/school/dashboard?tab=register-student"
              className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaPlus />
              Add Student
            </Link>
          </div>
        </div>
      )}

      {!hideGradeFilter && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-card border border-line-strong bg-surface p-3 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-control border text-lg sm:flex ${
                      toneClasses[card.tone]
                    }`}
                  >
                    <Icon />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-2xl font-semibold text-ink">
                      {card.value}
                    </strong>
                    <span className="block truncate text-sm font-semibold text-ink">
                      {card.label}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-muted">
                      {card.note}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          action={
            feedback.retry ? (
              <button
                type="button"
                onClick={feedback.retry}
                className="btn btn-ghost btn-sm transition-colors"
              >
                Retry
              </button>
            ) : null
          }
        />
      )}

      {/* Filters */}
      <div className="rounded-card border border-line-strong bg-surface p-3 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto]">
          <div className="relative">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedStudentIds([]);
              }}
              placeholder="Search by name, roll, login ID, or parent..."
              className="input w-full pl-11 pr-4 transition-colors"
            />
          </div>
          {!hideGradeFilter && (
            <select
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedSection("ALL");
                setSelectedStudentIds([]);
                setBulkSection("");
              }}
              className="input transition-colors"
            >
              <option value="">All Grades</option>
              {grades.map((g) => (
                <option key={g._id} value={g.originalValue || g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedSection}
            onChange={(event) => {
              setSelectedSection(event.target.value);
              setSelectedStudentIds([]);
            }}
            className="input transition-colors"
            aria-label="Filter by section"
          >
            <option value="ALL">All Sections</option>
            <option value="__UNASSIGNED__">Unassigned</option>
            {(selectedGrade
              ? sectionsForGrade(selectedGrade)
              : [...new Set(Object.values(sectionsByGrade).flat())].sort((a, b) => a.localeCompare(b))
            ).map((section) => <option key={section} value={section}>{section}</option>)}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setSelectedStudentIds([]);
            }}
            className="input transition-colors"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Students</option>
            <option value="ALUMNI">Alumni (Graduated)</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelectedStatus("ALL");
              setSelectedGrade(initialGrade || "");
              setSelectedSection("ALL");
              setSelectedStudentIds([]);
            }}
            className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
          >
            <FaFilter />
            Clear Filters
          </button>
        </div>
      </div>

      {selectedGrade && selectedStudentIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line-strong bg-surface p-4">
          <span className="text-sm font-semibold text-ink">
            {selectedStudentIds.length} selected in {selectedGrade}
          </span>
          <select
            value={bulkSection}
            onChange={(event) => setBulkSection(event.target.value)}
            className="input min-w-44"
            aria-label="Section to assign"
          >
            <option value="">No section</option>
            {sectionsForGrade(selectedGrade).map((section) => (
              <option key={section} value={section}>{section}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={savingSectionIds.length > 0}
            onClick={() => handleSectionAssignment(selectedStudentIds, selectedGrade, bulkSection)}
            className="btn btn-primary"
          >
            Assign to selected
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-line-strong bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm text-ink">
            <thead className="border-b border-line-strong bg-surface text-2xs uppercase text-muted">
              <tr>
                <th className="w-12 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedGrade) && students.length > 0 && students.every((student) => selectedStudentIds.includes(String(student._id)))}
                    disabled={!selectedGrade || students.length === 0}
                    onChange={(event) => setSelectedStudentIds((current) => {
                      const visibleIds = students.map((student) => String(student._id));
                      return event.target.checked
                        ? [...new Set([...current, ...visibleIds])]
                        : current.filter((id) => !visibleIds.includes(id));
                    })}
                    aria-label="Select students on this page"
                    className="h-4 w-4 rounded-control border-line-strong"
                  />
                </th>
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Grade & Roll</th>
                <th className="px-4 py-2.5">Assign Section</th>
                <th className="px-4 py-2.5">Login ID</th>
                <th className="px-4 py-2.5">Parent / Contact</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-line-strong">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-muted">
                    <TableSkeleton />
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-muted">
                    <EmptyState
                      title={search ? "No students match this search" : "No students added yet"}
                      description={
                        search
                          ? "Try a different name, roll number, username, or student ID."
                          : "Add students manually or upload a CSV so they can access events, notices, writing, and magazine content."
                      }
                    />
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student._id} className="transition-colors hover:bg-surface">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(String(student._id))}
                        disabled={!selectedGrade}
                        onChange={(event) => setSelectedStudentIds((current) => event.target.checked
                          ? [...new Set([...current, String(student._id)])]
                          : current.filter((id) => id !== String(student._id)))}
                        aria-label={`Select ${student.name}`}
                        className="h-4 w-4 rounded-control border-line-strong"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
                          {initialsFor(student.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">
                            {student.name}
                          </span>
                          <span className="block truncate text-xs font-semibold text-muted">
                            {student.platformStudentId || "Student ID pending"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-ink">{student.grade || "No grade"}</div>
                      <div className="text-xs font-semibold text-muted">
                        Roll: {student.rollNumber || "-"}
                      </div>
                      <div className="text-xs font-semibold text-muted">
                        Reg. no: {student.registrationNumber || <span className="text-warning">not set</span>}
                      </div>
                      <div className="text-xs font-semibold text-muted">
                        IEMIS: {student.iemisNumber || <span className="text-warning">not set</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={student.section || ""}
                        disabled={!student.grade || savingSectionIds.includes(String(student._id)) || !sectionsForGrade(student.grade).length}
                        onChange={(event) => handleSectionAssignment([String(student._id)], student.grade, event.target.value)}
                        aria-label={`Assign section to ${student.name}`}
                        className="input min-w-36"
                      >
                        <option value="">No section</option>
                        {sectionsForGrade(student.grade).map((section) => (
                          <option key={section} value={section}>{section}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {student.username || "Pending"}
                        </span>
                        {student.username && (
                          <button
                            type="button"
                            onClick={() => handleCopyLogin(student)}
                            className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
                            title="Copy login ID"
                          >
                            <FaCopy className="text-xs" />
                          </button>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-muted">Student login ID</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-ink">
                        {student.parentName || "Not provided"}
                      </div>
                      <div className="text-xs font-semibold text-muted">
                        {student.parentContactNumber ||
                          student.parentPhone ||
                          student.parentEmail ||
                          "No contact"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-ink">
                        {student.email || "No email"}
                      </div>
                      <div className="text-xs font-semibold text-muted">
                        {student.phone || "No phone"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(student)}
                          className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
                          title="Edit Student"
                        >
                          <FaEdit />
                        </button>
                        <button
                          onClick={() => requestResetPassword(student)}
                          className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
                          title="Reset Password"
                        >
                          <FaKey />
                        </button>
                        <button
                          onClick={() => requestDelete(student)}
                          className="btn-icon btn-soft-danger inline-flex items-center justify-center transition-colors"
                          title="Delete Student"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && students.length > 0 && (
            <div className="border-t border-line-strong p-4">
                <PaginationControls
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    onPageChange={handlePageChange}
                    totalItems={pagination.totalStudents}
                    start={pagination.start}
                    end={pagination.end}
                />
            </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Student Details"
      >
        {editingStudent && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-subtle mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingStudent.name}
                  onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Email</label>
                <input
                  type="email"
                  value={editingStudent.email || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, email: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Grade</label>
                <select
                  value={editingStudent.grade}
                  onChange={(e) => setEditingStudent({ ...editingStudent, grade: e.target.value, section: "" })}
                  className="input w-full"
                >
                  {grades.map((g) => (
                    <option key={g._id} value={g.originalValue || g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Section</label>
                <select
                  value={editingStudent.section || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, section: e.target.value })}
                  required={sectionsForGrade(editingStudent.grade).length > 0}
                  className="input w-full"
                >
                  <option value="">{sectionsForGrade(editingStudent.grade).length ? "Select section" : "No sections for this grade"}</option>
                  {sectionsForGrade(editingStudent.grade).map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Roll Number</label>
                <input
                  type="text"
                  required
                  value={editingStudent.rollNumber}
                  onChange={(e) => setEditingStudent({ ...editingStudent, rollNumber: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Registration Number</label>
                <input
                  type="text"
                  maxLength={40}
                  value={editingStudent.registrationNumber || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, registrationNumber: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Student IEMIS Number *</label>
                <input
                  type="text"
                  maxLength={50}
                  required
                  value={editingStudent.iemisNumber || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, iemisNumber: e.target.value.toUpperCase() })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Phone</label>
                <input
                  type="text"
                  value={editingStudent.phone || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Gender</label>
                <select
                  value={editingStudent.gender || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, gender: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Parent Name</label>
                <input
                  type="text"
                  value={editingStudent.parentName || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, parentName: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Parent Phone</label>
                <input
                  type="text"
                  value={editingStudent.parentPhone || ""}
                  onChange={(e) => setEditingStudent({ ...editingStudent, parentPhone: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-subtle mb-1">Status</label>
                <select
                  value={editingStudent.status || "ACTIVE"}
                  onChange={(e) => setEditingStudent({ ...editingStudent, status: e.target.value })}
                  className="input w-full"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive (Left School)</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="ALUMNI">Alumni (Graduated)</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-line-strong">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-subtle hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-primary transition-colors"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <CredentialsModal
        isOpen={credentialsModal.isOpen}
        credentials={credentialsModal.credentials}
        onClose={() =>
          setCredentialsModal({ isOpen: false, credentials: null })
        }
      />

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        busy={Boolean(confirmState?.busy)}
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          if (!confirmState?.student) return;
          if (confirmState.type === "archive") {
            executeDelete(confirmState.student);
          } else if (confirmState.type === "reset-password") {
            executeResetPassword(confirmState.student);
          }
        }}
      />
    </div>
  );
}
