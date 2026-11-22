import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import TeacherPublishedMagazineLibrary from "@/components/teacher/workspace/TeacherPublishedMagazineLibrary";

export const metadata = {
  title: "School Magazine",
  description: "Read published school magazine issues",
};

export default async function TeacherMagazinePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl">
        <TeacherPublishedMagazineLibrary />
      </div>
    </DashboardLayout>
  );
}
