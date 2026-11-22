"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { KeyRound } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ChangePasswordCard from "@/components/teacher/workspace/ChangePasswordCard";
import PageHeader from "@/components/ui/PageHeader";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import DevicePushBanner from "@/components/notifications/DevicePushBanner";

/** The student's own account: change the starting password (password@123). */
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
        icon={KeyRound}
        eyebrow="Student"
        title="Change password"
        description="You sign in with your IEMIS number and this password."
      />
      <div className="max-w-md space-y-4">
        <ChangePasswordCard
          endpoint="/api/student/password"
          note="Your starting password is password@123, and it goes back to that if your school resets it. Choose your own: at least 8 characters."
        />
        {/* Turn on, check, or test phone/laptop notifications. */}
        <DevicePushBanner role="STUDENT" variant="card" />
      </div>
    </DashboardLayout>
  );
}
