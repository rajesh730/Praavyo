import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import connectDB from "@/lib/db";
import { authOptions } from "@/lib/authOptions";
import Teacher from "@/models/Teacher";
import User from "@/models/User";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import PrintButton from "@/components/school/PrintButton";
import { teacherCardUrl } from "@/lib/teacherCard";
import { printableOrigin } from "@/lib/siteUrl";
import { cardQrSvg } from "@/lib/cardQr";

/**
 * A printable Teacher Login Card.
 *
 * The QR holds only the teacher's username, so a lost card cannot sign anyone
 * in — the password is still required. Reprinting changes nothing.
 * Server-rendered, school-admin only, and only for this school's teachers.
 */
export default async function TeacherLoginCardPage({ searchParams }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SCHOOL_ADMIN") redirect("/login");

  const teacherId = String(params?.id || "");
  if (!/^[a-f\d]{24}$/i.test(teacherId)) return <Missing reason="This card link is incomplete." />;

  await connectDB();
  const school = session.user.id;
  const [membership, teacher, schoolRow] = await Promise.all([
    TeacherMembership.findOne({ teacher: teacherId, school }).select("status designation").lean(),
    Teacher.findById(teacherId).select("name username email").lean(),
    User.findById(school).select("schoolName name").lean(),
  ]);
  if (!membership || !teacher) return <Missing reason="This teacher is not at your school." />;
  if (membership.status === "LEFT") return <Missing reason="This teacher has left your school." />;

  const identifier = teacher.username || teacher.email;
  const qrSvg = await cardQrSvg(teacherCardUrl(await resolveSiteUrl(), identifier));

  return (
    <main className="min-h-screen bg-canvas p-4 text-ink print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-md items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-semibold">Teacher Login Card</h1>
          <p className="mt-1 text-sm text-muted">Print and hand this to the teacher. The card fills in their username; they still sign in with their password.</p>
        </div>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[22rem] rounded-card border border-line-strong bg-white p-5 text-black print:break-inside-avoid">
        <header className="border-b border-black/20 pb-3 text-center">
          <p className="text-base font-semibold">{schoolRow?.schoolName || schoolRow?.name || "School"}</p>
          <p className="mt-0.5 text-xs font-semibold tracking-widest">PRAVYO TEACHER LOGIN</p>
        </header>

        <section className="mt-4 text-center">
          <p className="text-lg font-semibold">{teacher.name}</p>
          {membership.designation && <p className="text-sm">{membership.designation}</p>}
        </section>

        <section className="mt-4 flex flex-col items-center">
          <div
            className="h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
            // Generated on the server by the qrcode package from our own URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-2 text-center text-xs">On the sign-in page, choose Teacher, then<br /><strong>Take a photo of your login card</strong></p>
        </section>

        <section className="mt-4 rounded-control border border-black/20 p-3 text-center">
          <p className="text-xs">Username / प्रयोगकर्ता नाम</p>
          <p className="font-mono text-base font-semibold break-all">{identifier}</p>
        </section>

        <footer className="mt-4 text-center text-xs">
          <p>You still need your password to sign in.</p>
          <p>साइन इन गर्न पासवर्ड चाहिन्छ।</p>
          <p className="mt-2">Forgot your password? Ask the school office.</p>
        </footer>
      </article>
    </main>
  );
}

/** Same origin resolution as the Parent Access Card: env first, request host as fallback. */
async function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return printableOrigin(configured);
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  if (!host) return "";
  const protocol = headerList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return printableOrigin(`${protocol}://${host}`);
}

function Missing({ reason }) {
  return (
    <main className="min-h-screen bg-canvas p-6 text-ink">
      <div className="mx-auto max-w-md card p-5">
        <h1 className="font-semibold">Card not available</h1>
        <p className="mt-2 text-sm text-muted">{reason}</p>
      </div>
    </main>
  );
}
