"use client";

import { Suspense, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AppTabBar from "@/components/navigation/AppTabBar";
import { getRoleNavigationLinks, isNavLinkActive } from "@/components/navigation/appNavigation";
import SchoolNotificationCenter from "@/components/school/SchoolNotificationCenter";
import SchoolNoticeBoard from "@/components/school/SchoolNoticeBoard";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import PlatformEventsKindSwitch from "@/components/trainings/PlatformEventsKindSwitch";

const StudentManager = dynamic(
  () => import("@/components/dashboard/StudentManager"),
  {
    loading: () => (
      <LoadingState title="Loading students" message="Preparing your student records." />
    ),
  }
);
const SectionManager = dynamic(() => import("@/components/school/SectionManager"));
const SubjectManager = dynamic(() => import("@/components/school/SubjectManager"));
const StudentTransferPanel = dynamic(
  () => import("@/components/dashboard/StudentTransferPanel"),
  {
    loading: () => (
      <LoadingState title="Loading transfers" message="Preparing student transfer requests." />
    ),
  }
);
const TeacherManager = dynamic(
  () => import("@/components/dashboard/TeacherManager"),
  {
    loading: () => (
      <LoadingState title="Loading teachers" message="Preparing teacher and mentor records." />
    ),
  }
);
const DashboardOverview = dynamic(
  () => import("@/components/DashboardOverview"),
  {
    loading: () => (
      <LoadingState title="Loading overview" message="Preparing school dashboard statistics." />
    ),
  }
);
// Feedback the school receives from its students and parents. (Its own
// feedback to Praavyo is sent from the menu under the school's name.)
const SchoolFeedbackInbox = dynamic(
  () => import("@/components/school/SchoolFeedbackInbox"),
  {
    loading: () => (
      <LoadingState title="Loading feedback" message="Collecting what students and parents sent." />
    ),
  }
);
const SchoolTrainings = dynamic(
  () => import("@/components/trainings/SchoolTrainings"),
  {
    loading: () => (
      <LoadingState title="Loading trainings" message="Preparing Praavyo trainings for your school." />
    ),
  }
);
// Questions visitors send from the school's public page.
const SchoolInquiryInbox = dynamic(
  () => import("@/components/school/SchoolInquiryInbox"),
  {
    loading: () => (
      <LoadingState title="Loading inquiries" message="Collecting questions from your public page." />
    ),
  }
);
const FeedbackForm = dynamic(
  () => import("@/components/feedback/FeedbackForm"),
  {
    loading: () => (
      <LoadingState title="Loading feedback" message="Preparing feedback form." />
    ),
  }
);
const EnhancedStudentRegistration = dynamic(
  () => import("@/components/EnhancedStudentRegistration"),
  {
    loading: () => (
      <LoadingState title="Loading student registration" message="Preparing the student registration form." />
    ),
  }
);
const EnhancedTeacherRegistration = dynamic(
  () => import("@/components/EnhancedTeacherRegistration"),
  {
    loading: () => (
      <LoadingState title="Loading teacher registration" message="Preparing the teacher registration form." />
    ),
  }
);
const SchoolSettingsManager = dynamic(
  () => import("@/components/SchoolSettingsManager"),
  {
    loading: () => (
      <LoadingState title="Loading settings" message="Preparing school configuration." />
    ),
  }
);
const ShowcaseProfileManager = dynamic(
  () => import("@/components/ShowcaseProfileManager"),
  {
    loading: () => (
      <LoadingState title="Loading showcase profile" message="Preparing your public school profile." />
    ),
  }
);
const SchoolSettingsHistory = dynamic(
  () => import("@/components/school/SchoolSettingsHistory"),
  {
    loading: () => (
      <LoadingState title="Loading history" message="Preparing recent school changes." />
    ),
  }
);
const TeacherNoticeManager = dynamic(
  () => import("@/components/school/TeacherNoticeManager"),
  {
    loading: () => (
      <LoadingState title="Loading teacher notices" message="Preparing your notice board tools." />
    ),
  }
);
const StudentNoticeManager = dynamic(
  () => import("@/components/school/StudentNoticeManager"),
  {
    loading: () => (
      <LoadingState title="Loading student notices" message="Preparing your notice board tools." />
    ),
  }
);
const SchoolMagazineManager = dynamic(
  () => import("@/components/school/SchoolMagazineManager"),
  {
    loading: () => (
      <LoadingState title="Loading school magazine" message="Preparing review and publishing tools." />
    ),
  }
);
import { Clock as FaClock, ArrowLeftRight as FaExchangeAlt, School as FaSchool, Menu as FaBars } from "lucide-react";
import SchoolEventWorkspace from "@/components/events/SchoolEventWorkspace";
const PlatformEventsManager = dynamic(
  () => import("@/components/events/PlatformEventsManager"),
  {
    loading: () => (
      <LoadingState title="Loading platform events" message="Preparing Praavyo competition invitations." />
    ),
  }
);

function SchoolDashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab");
  // The URL is the only source of the active tab. Overview's link has no
  // `?tab=`, so a missing param must mean "overview" — keeping the tab in
  // state that only updated when a param existed left the admin stuck on the
  // previous tab (e.g. Student Transfer → Overview did nothing).
  const activeTab = !tabParam
    ? "overview"
    : ["judging", "events"].includes(tabParam)
      ? "school-events"
      : tabParam;
  const [isNavOpen, setIsNavOpen] = useState(false);

  useEffect(() => {
    if (!isNavOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen]);

  const [schoolGrades, setSchoolGrades] = useState([]);

  const isPending = session?.user?.status === "PENDING";
  const isRestricted = isPending;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") fetchData();
  }, [status, router]);

  const fetchData = async () => {
    try {
      // The config call also creates the school's SchoolConfig on first visit.
      const [, gradesRes] = await Promise.all([
        fetch("/api/school/config", { cache: "no-store" }),
        fetch("/api/school/grade-structure", { cache: "no-store" }),
      ]);

      if (gradesRes.ok) {
        const gradesData = await gradesRes.json();
        const gradeOptions = gradesData.grades || gradesData.data?.grades || [];
        setSchoolGrades(
          gradeOptions
            .map((grade) => grade?.name || grade?._id || grade)
            .filter(Boolean)
        );
      } else {
        setSchoolGrades([]);
      }
    } catch (error) {
      console.error("Error fetching data", error);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-canvas p-4 sm:p-5 text-ink">
        <LoadingState
          title="Opening school dashboard"
          message="Loading students, events, notices, and publishing tools."
          className="min-h-[70vh]"
        />
      </div>
    );
  }

  const tabLinks = isPending
    ? []
    : isRestricted && session?.user?.role === "SCHOOL_ADMIN"
      ? getRoleNavigationLinks(session?.user?.role).filter((link) => link.name === "Settings")
      : getRoleNavigationLinks(session?.user?.role);

  return (
    <div className="min-h-dvh">
      {isNavOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setIsNavOpen(false)}
          className="app-backdrop"
        />
      )}
      <Sidebar
        role={session?.user?.role}
        isRestricted={isRestricted}
        isPending={isPending}
        isMobileOpen={isNavOpen}
        onNavigate={() => setIsNavOpen(false)}
      />

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            className="btn-icon btn-ghost -ml-2 lg:hidden"
            aria-label="Open menu"
          >
            <FaBars className="text-lg" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-ink">School Dashboard</p>
            <p className="truncate text-xs text-muted">{session?.user?.name || session?.user?.email}</p>
          </div>
          <SchoolNotificationCenter />
        </header>

        <main className="overflow-x-hidden">
        <div className="app-frame">


        {isPending && (
          <div className="rounded-card border border-brand bg-brand-soft p-4 sm:p-5 mb-4 flex items-center gap-4 text-brand-strong">
            <div className="p-3 bg-brand-soft rounded-full">
              <FaClock className="text-brand-strong text-2xl" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Account Pending Approval</h3>
              <p className="text-muted mt-1">
                Your school account is currently under review by the Super Admin.
                You will receive full access once your account is approved.
              </p>
            </div>
          </div>
        )}

        {/* Content Area - Hide if Pending */}
        {isPending ? (
          <div className="text-center py-8">
            <AlertBanner
              type="warning"
              title="Approval required"
              message="Your school dashboard will unlock after the Super Admin approves this account."
            />
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <>
                <PageHeader
                  icon={FaExchangeAlt}
                  eyebrow="School workspace"
                  title="School Overview"
                  description="Review your school's student, teacher, event, grade, and recent activity status from one place."
                />
                <div className="mt-5">
                  <DashboardOverview />
                </div>
              </>
            )}

            {activeTab === "students" && <StudentManager />}
            {activeTab === "sections" && <SectionManager />}
            {activeTab === "subjects" && <SubjectManager />}

            {activeTab === "student-transfers" && (
              <>
                <PageHeader
                  icon={FaSchool}
                  eyebrow="Student movement"
                  title="Student Transfer"
                  description="Parents request a transfer for their child. Approve children leaving, and admit children joining."
                />
                <div className="mt-5">
                  <StudentTransferPanel
                    grades={schoolGrades}
                    schoolId={session?.user?.id || ""}
                    onChanged={() => router.refresh()}
                  />
                </div>
              </>
            )}

            {activeTab === "teachers" && <TeacherManager />}
            {activeTab === "showcase" && <ShowcaseProfileManager />}
            {activeTab === "feedback" && <SchoolFeedbackInbox />}
            {activeTab === "inquiries" && <SchoolInquiryInbox />}
            {activeTab === "praavyo-feedback" && <FeedbackForm audience="school" />}
            {activeTab === "register-student" && (
              <EnhancedStudentRegistration
                schoolId={session?.user?.id}
                onSuccess={() => router.refresh()}
              />
            )}
            {activeTab === "register-teacher" && (
              <EnhancedTeacherRegistration
                schoolId={session?.user?.id}
                onSuccess={() => router.refresh()}
              />
            )}
            {activeTab === "settings" && <SchoolSettingsManager />}
            {activeTab === "history" && <SchoolSettingsHistory />}

            {activeTab === "school-events" && <SchoolEventWorkspace />}
            {activeTab === "platform-events" && (
              <PlatformEventsKindSwitch
                storageKey="school:platform-events:kind"
                competitions={<PlatformEventsManager />}
                trainings={<SchoolTrainings />}
              />
            )}
            {activeTab === "student-notices" && <StudentNoticeManager />}
            {activeTab === "teacher-notices" && <TeacherNoticeManager />}
            {activeTab === "notices" && <SchoolNoticeBoard />}
            {activeTab === "magazine" && <SchoolMagazineManager />}
          </>
        )}

        </div>
        </main>
      </div>

      <AppTabBar
        links={tabLinks}
        isActive={(link) => isNavLinkActive(link, pathname, searchParams?.get("tab"))}
        onOpenMenu={() => setIsNavOpen((open) => !open)}
        menuOpen={isNavOpen}
      />
    </div>
  );
}

export default function SchoolDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas p-4 sm:p-5 text-ink">
          <LoadingState title="Loading dashboard" message="Preparing your school workspace." />
        </div>
      }
    >
      <SchoolDashboardContent />
    </Suspense>
  );
}
