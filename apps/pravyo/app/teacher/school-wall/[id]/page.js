import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import StudentMagazineArticleReader from "@/components/student/StudentMagazineArticleReader";

export const metadata = {
  title: "Read School Wall Writing",
  description: "Read a full writing post from your school wall",
};

export default async function TeacherSchoolWallArticlePage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/");

  const { id } = await params;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl">
        <StudentMagazineArticleReader
          articleId={id}
          apiBasePath="/api/teacher/school-wall"
          backHref="/teacher/school-wall"
          backLabel="Back to school wall"
          relatedHrefPrefix="/teacher/school-wall/"
          relatedTitle="More School Wall Writing"
        />
      </div>
    </DashboardLayout>
  );
}
