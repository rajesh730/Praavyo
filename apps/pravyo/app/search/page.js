import Link from "next/link";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Student from "@/models/Student";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import { ArrowRight as FaArrowRight, Search as FaSearch, Shield as FaShieldAlt, GraduationCap as FaUserGraduate } from "lucide-react";

export const dynamic = "force-dynamic";

// Search-result pages shouldn't be indexed (thin/duplicate); the canonical
// content lives on the portfolio/school pages, which are in the sitemap.
export const metadata = {
  title: "Search",
  description: "Find verified student portfolios and schools on Praavyo.",
  robots: { index: false, follow: true },
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getInitials(value = "") {
  return (
    String(value)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

async function runSearch(q) {
  await connectDB();
  const rx = new RegExp(escapeRegex(q), "i");

  // Schools are public only if they have a public showcase profile (mirrors the
  // schools directory gating).
  const publicProfiles = await SchoolShowcaseProfile.find({
    visibility: "PUBLIC",
  })
    .select("school logoUrl coverImageUrl")
    .lean();
  const publicSchoolIds = publicProfiles
    .map((profile) => profile.school)
    .filter(Boolean);
  const coverBySchool = new Map(
    publicProfiles.map((profile) => [
      String(profile.school),
      profile.logoUrl || profile.coverImageUrl || "",
    ])
  );

  const [schoolDocs, namedStudents] = await Promise.all([
    publicSchoolIds.length
      ? User.find({
          _id: { $in: publicSchoolIds },
          role: "SCHOOL_ADMIN",
          schoolName: rx,
        })
          .select("schoolName schoolLocation")
          .limit(24)
          .lean()
      : [],
    // Students matching the name; we then keep only those with a public,
    // browsable portfolio (at least one approved + published piece).
    Student.find({
      name: rx,
      isDeleted: { $ne: true },
      status: { $ne: "INACTIVE" },
    })
      .select("name grade school")
      .populate("school", "schoolName")
      .limit(80)
      .lean(),
  ]);

  const namedIds = namedStudents.map((student) => student._id);
  const portfolioStudentIds = new Set(
    (namedIds.length
      ? await SchoolMagazineArticle.distinct("authorStudent", {
          authorStudent: { $in: namedIds },
          status: "APPROVED",
          isPublished: true,
          isDeleted: { $ne: true },
        })
      : []
    ).map(String)
  );

  return {
    schools: schoolDocs.map((school) => ({
      id: String(school._id),
      name: school.schoolName || "School",
      location: school.schoolLocation || "",
      cover: coverBySchool.get(String(school._id)) || "",
    })),
    students: namedStudents
      .filter((student) => portfolioStudentIds.has(String(student._id)))
      .slice(0, 24)
      .map((student) => ({
        id: String(student._id),
        name: student.name || "Student",
        grade: student.grade || "",
        school: student.school?.schoolName || "",
      })),
  };
}

function SearchBar({ q }) {
  return (
    <form
      action="/search"
      className="card flex h-10 items-center gap-3 px-4"
    >
      <FaSearch className="shrink-0 text-subtle" />
      <input
        name="q"
        type="search"
        defaultValue={q}
        autoFocus
        placeholder="Search students and schools…"
        className="input min-w-0 flex-1 border-0"
      />
      <button
        type="submit"
        className="btn btn-primary btn-sm"
      >
        Search
      </button>
    </form>
  );
}

export default async function SearchPage({ searchParams }) {
  const resolved = await searchParams;
  const q = String(resolved?.q || "").trim();
  const results = q ? await runSearch(q) : { schools: [], students: [] };
  const total = results.students.length + results.schools.length;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <PublicSiteNav active="schools" searchAction="/search" />

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-6 pb-16 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="schools" />

        <div className="min-w-0 space-y-4">
          <section className="card p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase text-brand-strong">Search</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">
              Find students &amp; schools
            </h1>
            <p className="mt-2 text-sm font-semibold text-muted">
              {q
                ? `${total} result${total === 1 ? "" : "s"} for “${q}”.`
                : "Search verified student portfolios and school profiles."}
            </p>
            <div className="mt-4">
              <SearchBar q={q} />
            </div>
          </section>

          {q && total === 0 && (
            <section className="card border-dashed p-6 text-center">
              <FaSearch className="mx-auto text-3xl text-brand-strong" />
              <h2 className="mt-4 text-xl font-semibold text-ink">
                No matches for “{q}”
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted">
                Try a different name. Only students with public published work and
                schools with public profiles appear here.
              </p>
            </section>
          )}

          {results.students.length > 0 && (
            <section className="card p-5 sm:p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
                <FaUserGraduate className="text-brand-strong" />
                Students
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.students.map((student) => (
                  <Link
                    key={student.id}
                    href={`/students/${student.id}`}
                    className="card transition-colors hover:border-brand-line hover:bg-surface-2 flex items-center gap-3 p-4 transition-colors hover:border-brand-line hover:bg-surface-2"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-strong">
                      {getInitials(student.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {student.name}
                      </span>
                      <span className="block truncate text-xs font-semibold text-muted">
                        {[student.grade, student.school].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <FaArrowRight className="shrink-0 text-brand" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.schools.length > 0 && (
            <section className="card p-5 sm:p-5">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
                <FaShieldAlt className="text-brand" />
                Schools
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.schools.map((school) => (
                  <Link
                    key={school.id}
                    href={`/schools/${school.id}`}
                    className="card transition-colors hover:border-brand-line hover:bg-surface-2 flex items-center gap-3 p-4 transition-colors hover:border-brand-line hover:bg-surface-2"
                  >
                    <SchoolLogoMark
                      imageUrl={school.cover}
                      name={school.name}
                      className="h-12 w-12"
                      iconClassName="text-lg"
                      shapeClassName="rounded-card"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {school.name}
                      </span>
                      {school.location && (
                        <span className="block truncate text-xs font-semibold text-muted">
                          {school.location}
                        </span>
                      )}
                    </span>
                    <FaArrowRight className="shrink-0 text-brand" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
