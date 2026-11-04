"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquareText as FaCommentDots } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import FeedbackForm from "@/components/feedback/FeedbackForm";
import PageHeader from "@/components/ui/PageHeader";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";

export default function StudentFeedbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [router, status]);

  if (status === "loading") {
    return (
      <DashboardLayout>
        <LoadingState title="Opening feedback" message="Preparing feedback form." />
      </DashboardLayout>
    );
  }

  if (session?.user?.role !== "STUDENT") {
    return (
      <DashboardLayout>
        <AlertBanner
          type="error"
          title="Student access required"
          message="Please sign in with a student account to send feedback."
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          icon={FaCommentDots}
          eyebrow="Feedback"
          title="Feedback to your school"
          description="Tell your school what is going well or what could be better. Your school reads every message."
        />
        <div className="mt-5">
          <FeedbackForm audience="student" />
        </div>
      </div>
    </DashboardLayout>
  );
}
