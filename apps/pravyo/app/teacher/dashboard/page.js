"use client";

import { Suspense, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import TeacherEventOperations from "@/components/teacher/TeacherEventOperations";
import ProgramManager from "@/components/programs/ProgramManager";
import UpcomingPrograms from "@/components/programs/UpcomingPrograms";
import OverviewTab from "@/components/teacher/workspace/OverviewTab";
import AssessmentTab from "@/components/teacher/workspace/AssessmentTab";
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
  assessment: {
    icon: ClipboardCheck,
    title: () => "Assessment",
    description: "Exams your school has opened for you. Choose one to enter marks.",
    Component: AssessmentTab,
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
  const tabKey = TABS[searchParams.get("tab")] ? searchParams.get("tab") : "overview";
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
          <h2 className="mb-3 text-lg font-semibold text-ink">Competitions</h2>
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
      <div className="mx-auto max-w-6xl">
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
