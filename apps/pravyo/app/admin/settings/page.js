import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Settings as FaCog } from "lucide-react";
import { authOptions } from "@/lib/authOptions";
import DashboardLayout from "@/components/DashboardLayout";
import SuperAdminSettingsManager from "@/components/settings/SuperAdminSettingsManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Platform Settings - Admin Panel",
  description: "Manage platform-wide defaults, governance, and operational policy.",
};

export default async function AdminSettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-5">
          <h1 className="mb-2 flex items-center gap-3 font-semibold text-white">
            <FaCog className="text-brand" />
            Platform Settings
          </h1>
          <p className="text-subtle">
            Manage the global defaults and governance rules that shape every
            school workspace and platform event.
          </p>
        </div>

        <SuperAdminSettingsManager />
      </div>
    </DashboardLayout>
  );
}
