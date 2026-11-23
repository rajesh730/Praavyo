import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import FeedbackForm from "@/components/feedback/FeedbackForm";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Feedback",
  description: "Send feedback to your school",
};

/**
 * A teacher's feedback to the school chosen in their session. The school
 * reads it in its Feedback inbox, next to student and parent feedback.
 */
export default async function TeacherFeedbackPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/");
  if (!session.user.schoolId) redirect("/teacher/select-school");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          icon={MessageSquareText}
          eyebrow="Feedback"
          title="Feedback to your school"
          description="Tell your school what is going well or what could be better. The school administration reads every message."
        />
        <div className="mt-5">
          <FeedbackForm audience="teacher" schoolName={session.user.schoolName || ""} />
        </div>
      </div>
    </DashboardLayout>
  );
}
