import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/ui/PageHeader";
import TeacherNoticeList from "@/components/teacher/TeacherNoticeList";
import TeacherNotificationCenter from "@/components/teacher/TeacherNotificationCenter";

export const metadata = {
  title: "Notices",
  description: "School notices and updates for teachers",
};

/** Every notice and alert for the teacher at the school they are working in. */
export default async function TeacherNoticesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/");
  if (!session.user.schoolId) redirect("/teacher/select-school");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          icon={Bell}
          eyebrow="Teacher"
          title="Notices"
          description="Notices your school sends to teachers, events for your grades, and updates about your classes."
          action={<TeacherNotificationCenter />}
        />
        <TeacherNoticeList />
      </div>
    </DashboardLayout>
  );
}
