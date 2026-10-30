import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/authOptions';
import DashboardLayout from '@/components/DashboardLayout';
import CasLayout from '@pravyo/cas/components/CasLayout';
import CurriculumPage from '@/app/school/cas/curriculum/page';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Theme Library - Admin Panel',
  description: 'Default subjects, themes and learning outcomes for Grades 1 to 5.',
};

/**
 * The platform's default theme library, edited by the super admin with the
 * same Curriculum editor schools use. It sits inside the normal admin
 * dashboard (full admin menu); CAS only supplies the editor's data, resolving
 * a super admin to the reserved library id so no real school is touched.
 */
export default async function ThemeLibraryPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'SUPER_ADMIN' || session.error) redirect('/login');

  return (
    <DashboardLayout>
      <CasLayout embedded>
        <CurriculumPage />
      </CasLayout>
    </DashboardLayout>
  );
}
