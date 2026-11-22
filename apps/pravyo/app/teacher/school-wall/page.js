import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import SchoolWallFeed from "@/components/student/SchoolWallFeed";

export const metadata = {
  title: "School Wall",
  description: "Read writing posted by students of your school",
};

export default async function TeacherSchoolWallPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/");

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <SchoolWallFeed
          endpoint="/api/teacher/school-wall"
          surface={null}
          articleHrefPrefix="/teacher/school-wall/"
          showStudentNav={false}
        />
      </div>
    </DashboardLayout>
  );
}
