"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Settings } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ChangePasswordCard from "@/components/teacher/workspace/ChangePasswordCard";
import PageHeader from "@/components/ui/PageHeader";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import PermissionsSection from "@/components/notifications/PermissionsSection";

/** The student's settings: change the starting password (password@123) and Permissions. */
export default function StudentAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [router, status]);

  if (status === "loading") {
    return (
      <DashboardLayout>
        <LoadingState title="Opening your account" message="One moment." />
      </DashboardLayout>
    );
  }

  if (session?.user?.role !== "STUDENT") {
    return (
      <DashboardLayout>
        <AlertBanner
          type="error"
          title="Student access required"
          message="Please sign in with a student account to change your password."
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        icon={Settings}
        eyebrow="Student"
        title="Settings"
        description="Change your password (you sign in with your IEMIS number and password) and choose what Praavyo may use on this device."
      />
      <div className="max-w-md space-y-4">
        <ChangePasswordCard
          endpoint="/api/student/password"
          note="Your starting password is password@123, and it goes back to that if your school resets it. Choose your own: at least 8 characters."
        />
        {/* Turn on, check, or test phone/laptop notifications. */}
        <PermissionsSection role="STUDENT" className="card p-4" />
      </div>
    </DashboardLayout>
  );
}
