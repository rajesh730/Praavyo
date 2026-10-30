"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import TeacherEventOperations from "@/components/teacher/TeacherEventOperations";
import TeacherAcademicWorkspace from "@/components/teacher/TeacherAcademicWorkspace";
import PageHeader from "@/components/ui/PageHeader";
import LoadingState from "@/components/ui/LoadingState";
import { Presentation as FaChalkboardTeacher } from "lucide-react";

export default function TeacherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading") {
    return (
      <DashboardLayout>
        <LoadingState
          title="Opening teacher workspace"
          message="Loading your classes and students."
          className="min-h-[70vh]"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl">
        <PageHeader
          icon={FaChalkboardTeacher}
          eyebrow="Teacher"
          title="My workspace"
          description={`${session?.user?.name || "Teacher"}, here are the classes, subjects and students your school assigned to you.`}
        />

        <div className="mt-4 space-y-4">
          <TeacherAcademicWorkspace />
          <TeacherEventOperations />
        </div>
      </div>
    </DashboardLayout>
  );
}
