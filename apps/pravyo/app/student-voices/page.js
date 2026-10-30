import Link from "next/link";
import { unstable_cache } from "next/cache";
import connectDB from "@/lib/db";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import { WritingPreview } from "@/components/WritingContent";
import {
  serializeWritingImage,
  serializeWritingImages,
  WritingCover,
  WritingTags,
} from "@/components/WritingMedia";
import AppDate from "@/components/common/AppDate";
import { diversifyBySchool } from "@/lib/schoolDiversifiedFeed";
import { getAuthoredSchoolName, formatAuthoredEra } from "@/lib/writingProvenance";
import { ArrowRight as FaArrowRight, CalendarDays as FaCalendarAlt, Feather as FaFeatherAlt, School as FaSchool, Share as FaShare, Shield as FaShieldAlt, GraduationCap as FaUserGraduate } from "lucide-react";
import "@/models/Student";
import "@/models/User";

export const metadata = {
  title: "Student Voices",
  description: "Read public student writing and featured school stories on Praavyo.",
};


function getCategory(value) {
  const label = String(value || "Essay").replaceAll("_", " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getInitials(value = "Student") {
  return String(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const getStudentVoices = unstable_cache(async () => {
  await connectDB();

  const articles = await SchoolMagazineArticle.find({
    status: "APPROVED",
    isPublished: true,
    isDeleted: { $ne: true },
  })
    .select(
      "title content category images coverImage tags publishedAt updatedAt authorSchoolNameSnapshot authorGrade authorAcademicYear"
    )
    .populate("authorStudent", "name grade")
    .populate("school", "schoolName schoolLocation")
    .sort({ publishedAt: -1, updatedAt: -1 })
    .limit(120)
    .lean();

  const serializedArticles = articles.map((article) => ({
    id: String(article._id),
    title: article.title,
    content: article.content,
    category: article.category,
    coverImage: serializeWritingImage(article.coverImage),
    images: serializeWritingImages(article.images),
    tags: article.tags || [],
    date: (article.publishedAt || article.updatedAt)?.toISOString() || "",
    author: article.authorStudent?.name || "Student",
    authorId: article.authorStudent?._id ? String(article.authorStudent._id) : "",
    grade: article.authorStudent?.grade || "",
    schoolName: getAuthoredSchoolName(article, article.school?.schoolName),
    authoredEra: formatAuthoredEra(article),
    schoolHref: article.school?._id ? `/schools/${article.school._id}` : "/schools",
    schoolId: article.school?._id ? String(article.school._id) : "",
    href: `/writings/${article._id}`,
  }));

  return diversifyBySchool(serializedArticles, {
    limit: 30,
    getSchoolKey: (article) => article.schoolId || article.schoolName,
    getTime: (article) => article.date,
  });
}, ["public-student-voices-v1"], {
  revalidate: 60,
  tags: ["public-student-voices"],
});

function VoiceCard({ article, featured = false }) {
  return (
    <article
      className={`card p-4 ${
        featured ? "md:p-7" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-strong">
          {getInitials(article.author)}
        </span>
        <div className="min-w-0 flex-1">
          {article.authorId ? (
            <Link
              href={`/students/${article.authorId}`}
              className="block truncate text-sm font-semibold text-ink hover:text-brand-strong"
            >
              {article.author}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-ink">
              {article.author}
            </p>
          )}
          <Link
            href={article.schoolHref}
            className="mt-1 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-muted hover:text-brand-strong"
          >
            <FaShieldAlt className="text-brand" />
            <span>{article.schoolName}</span>
            {article.authoredEra && (
              <span className="font-semibold text-subtle">
                · {article.authoredEra}
              </span>
            )}
          </Link>
        </div>
        <span className="badge badge-brand">
          {getCategory(article.category)}
        </span>
      </div>

      <h2 className={`${featured ? "mt-6 text-3xl" : "mt-4 text-xl"} font-semibold leading-tight text-ink`}>
        {article.title}
      </h2>
      <WritingCover
        coverImage={article.coverImage}
        images={article.images}
        title={article.title}
        className="mt-4 aspect-[16/9]"
      />
      <WritingPreview
        content={article.content}
        maxLength={featured ? 280 : 150}
        className={`${featured ? "mt-4 text-base" : "mt-2 text-sm"} line-clamp-4 leading-6 text-muted`}
      />
      <WritingTags tags={article.tags} className="mt-3" />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-2">
          <FaCalendarAlt />
          <AppDate value={article.date} fallback="Recently" />
        </span>
        <Link
          href={article.href}
          className="inline-flex items-center gap-2 text-brand-strong"
        >
          <FaShare />
          Share Story
        </Link>
      </div>

      <Link
        href={article.href}
        className="btn btn-primary mt-5 inline-flex items-center gap-2"
      >
        Read Story
        <FaArrowRight />
      </Link>
    </article>
  );
}

export default async function StudentVoicesPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const query = String(resolvedSearchParams?.q || "").trim().toLowerCase();
  const allArticles = await getStudentVoices();
  const articles = query
    ? allArticles.filter((article) =>
        `${article.title} ${article.content} ${article.author} ${article.schoolName} ${article.category}`
          .toLowerCase()
          .includes(query)
      )
    : allArticles;
  const featured = articles[0] || null;
  const schoolCount = new Set(articles.map((article) => article.schoolName)).size;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <PublicSiteNav
        active="home"
        searchPlaceholder="Search student voices..."
        searchAction="/student-voices"
      />

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-6 pb-16 sm:px-6 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="home" />

        <div className="min-w-0 space-y-4">
          <section className="card p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase text-brand-strong">
              Student Voices
            </p>
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div>
                <h1 className="text-3xl font-semibold leading-tight text-ink md:text-3xl">
                  Read student stories with less noise.
                </h1>
                <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-muted">
                  {query
                    ? `Showing results for "${resolvedSearchParams.q}".`
                    : "Public writing from schools, organized as simple cards that lead directly to the full story."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  [articles.length, "Stories", FaFeatherAlt],
                  [schoolCount, "Schools", FaSchool],
                  ["Public", "Reading", FaUserGraduate],
                ].map(([value, label, Icon]) => (
                  <div key={label} className="rounded-card bg-surface-2 p-4 text-center">
                    <Icon className="mx-auto text-brand-strong" />
                    <p className="mt-2 text-xl font-semibold text-ink">
                      {value}
                    </p>
                    <p className="text-2xs font-semibold uppercase text-muted">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {featured ? (
            <VoiceCard article={featured} featured />
          ) : (
            <section className="card border-dashed p-6 text-center">
              <FaFeatherAlt className="mx-auto text-3xl text-brand-strong" />
              <h2 className="mt-4 text-xl font-semibold text-ink">
                No public stories yet
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted">
                Approved school magazine stories will appear here.
              </p>
            </section>
          )}

          {articles.length > 1 && (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {articles.slice(1).map((article) => (
                <VoiceCard key={article.id} article={article} />
              ))}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
