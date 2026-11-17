"use client";

import { Suspense, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import TeacherEventOperations from "@/components/teacher/TeacherEventOperations";
import ProgramManager from "@/components/programs/ProgramManager";
import UpcomingPrograms from "@/components/programs/UpcomingPrograms";
import OverviewTab from "@/components/teacher/workspace/OverviewTab";
import ExamsTab from "@/components/teacher/workspace/ExamsTab";
import ResultsTab from "@/components/teacher/workspace/ResultsTab";
import StudentsTab from "@/components/teacher/workspace/StudentsTab";
import ProfileTab from "@/components/teacher/workspace/ProfileTab";
import { useTeacherWorkspace } from "@/components/teacher/workspace/shared";
import PageHeader from "@/components/ui/PageHeader";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import { CalendarDays, ClipboardCheck, GraduationCap, Presentation, UserRound, Users } from "lucide-react";

/**
 * The teacher workspace, one tab per job. The tabs are the sidebar and phone
 * tab bar entries (`?tab=`, see TEACHER_NAV_LINKS); the workspace is loaded
 * once here and shared, so switching tabs never waits on the network.
 */
const TABS = {
  overview: {
    icon: Presentation,
    title: (name) => `Namaste, ${name}`,
    description: "Your school, what is open for marks, and the latest results.",
    Component: OverviewTab,
  },
  exams: {
    icon: ClipboardCheck,
    title: () => "Exams",
    description: "Choose CAS for Grades 1–5 assessment, or the internal exam for marks.",
    Component: ExamsTab,
  },
  results: {
    icon: GraduationCap,
    title: () => "Published results",
    description: "Results for your subjects, and your whole class if you are its class teacher.",
    Component: ResultsTab,
  },
  students: {
    icon: Users,
    title: () => "My students",
    description: "Active students in the grades you teach.",
    Component: StudentsTab,
  },
  events: {
    icon: CalendarDays,
    title: () => "Events",
    description: "Programs and competitions your school gave you to run.",
  },
  profile: {
    icon: UserRound,
    title: () => "My profile",
    description: "Your details and the roles your school has given you.",
    Component: ProfileTab,
  },
};

export default function TeacherDashboard() {
  return (
    <Suspense fallback={null}>
      <TeacherWorkspace />
    </Suspense>
  );
}

function TeacherWorkspace() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  // "assessment" was the old CAS list; CAS now opens its own workspace from Exams.
  const requestedTab = searchParams.get("tab") === "assessment" ? "exams" : searchParams.get("tab");
  const tabKey = TABS[requestedTab] ? requestedTab : "overview";
  const tab = TABS[tabKey];
  const { workspace, error, reload } = useTeacherWorkspace();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?as=teacher");
  }, [status, router]);

  const firstName = String(session?.user?.name || "Teacher").split(" ")[0];
  const { Component } = tab;

  let body;
  if (tabKey === "events") {
    body = (
      <div className="space-y-6">
        <ProgramManager mode="teacher" />
        <div>
          <div className="mb-3">
            <h2 className="font-semibold text-ink">Competitions</h2>
            <p className="mt-1 text-sm text-muted">Platform and school competitions. Manage the ones your school assigned to you.</p>
          </div>
          <TeacherEventOperations />
        </div>
      </div>
    );
  } else if (error) {
    body = (
      <div className="space-y-3">
        <AlertBanner type="error" title="Workspace unavailable" message={error} />
        <button type="button" onClick={reload} className="btn btn-secondary btn-sm">Try again</button>
      </div>
    );
  } else if (!workspace) {
    body = <LoadingState title="Loading your workspace" message="Checking your classes, subjects and students." />;
  } else {
    body = (
      <>
        {tabKey === "overview" && (
          <UpcomingPrograms className="mb-4" manageHref="/teacher/dashboard?tab=events" />
        )}
        <Component workspace={workspace} />
      </>
    );
  }

  return (
    <DashboardLayout>
      {/* Same width as the school dashboard: app-frame sets the limit. */}
      <div>
        <PageHeader
          icon={tab.icon}
          eyebrow="Teacher"
          title={tab.title(firstName)}
          description={tab.description}
        />
        {body}
      </div>
    </DashboardLayout>
  );
}
