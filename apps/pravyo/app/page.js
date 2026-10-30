import Link from "next/link";
import connectDB from "@/lib/db";
import Event from "@/models/Event";
import SchoolPromotion from "@/models/SchoolPromotion";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import { getActiveSchoolPromotions } from "@/lib/schoolPromotions";
import { diversifyBySchool } from "@/lib/schoolDiversifiedFeed";
import HomepageHeroCarousel from "@/components/public/HomepageHeroCarousel";
import HomeScrollMemory from "@/components/public/HomeScrollMemory";
import PublicExplorePanel from "@/components/public/PublicExplorePanel";
import PublicSiteNav from "@/components/public/PublicSiteNav";
import SchoolLogoMark from "@/components/public/SchoolLogoMark";
import AppDate from "@/components/common/AppDate";
import {
  getWritingPreviewText,
  WritingPreview,
} from "@/components/WritingContent";
import {
  serializeWritingImage,
  serializeWritingImages,
  WritingCover,
  WritingTags,
} from "@/components/WritingMedia";
import { ArrowRight as FaArrowRight, CalendarDays as FaCalendarAlt, Feather as FaFeatherAlt, Calendar as FaRegCalendarAlt, Shield as FaShieldAlt } from "lucide-react";
import "@/models/Student";
import "@/models/User";

// Public content can be served immediately from the route cache. The proxy
// handles authenticated-user redirects without making the homepage dynamic.
export const revalidate = 60;


function getPreview(value = "", maxLength = 120) {
  const text = getWritingPreviewText(value, maxLength, { preserveFormatting: false });
  if (!text) return "";
  return text;
}

function getInitials(value = "P") {
  return String(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getCategoryLabel(value) {
  const label = String(value || "Writing").replaceAll("_", " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function enrichItemsWithSchoolProfiles(items = []) {
  const schoolIds = [
    ...new Set(
      items
        .map((item) => item.schoolId)
        .filter(Boolean)
        .map(String)
    ),
  ];

  if (schoolIds.length === 0) return items;

  const profiles = await SchoolShowcaseProfile.find({
    school: { $in: schoolIds },
    visibility: "PUBLIC",
  })
    .select("school coverImageUrl")
    .lean();

  const profileMap = new Map(
    profiles.map((profile) => [String(profile.school), profile])
  );

  return items.map((item) => {
    const schoolId = String(item.schoolId || "");
    const profile = profileMap.get(schoolId);
    return {
      ...item,
      schoolHref: item.schoolHref || (schoolId ? `/schools/${schoolId}` : ""),
      schoolLogoUrl: profile?.coverImageUrl || "",
    };
  });
}

async function getLatestStudentWritings() {
  const articles = await SchoolMagazineArticle.find({
    status: "APPROVED",
    isPublished: true,
    isDeleted: false,
    // Transfers flip this off so a student's writing stops showing as the
    // origin school's live content (it stays in the student's portfolio).
    showOnSchoolWall: true,
  })
    .select("title content category images coverImage tags publishedAt updatedAt")
    .sort({ publishedAt: -1, updatedAt: -1 })
    .limit(50)
    .populate("authorStudent", "name grade")
    .populate("school", "schoolName")
    .lean();

  const serializedArticles = articles.map((article) => ({
    id: String(article._id),
    href: `/writings/${article._id}`,
    title: article.title,
    content: article.content,
    category: article.category || "WRITING",
    coverImage: serializeWritingImage(article.coverImage),
    images: serializeWritingImages(article.images),
    tags: article.tags || [],
    date: article.publishedAt || article.updatedAt,
    author: article.authorStudent?.name || "Student",
    schoolName: article.school?.schoolName || "School",
    schoolHref: article.school?._id ? `/schools/${article.school._id}` : "",
    schoolId: article.school?._id ? String(article.school._id) : "",
  }));

  return diversifyBySchool(serializedArticles, {
    limit: 5,
    getSchoolKey: (article) => article.schoolId || article.schoolName,
    getTime: (article) => article.date,
  });
}

async function getHomeMagazineIssues() {
  const issues = await MagazineIssue.find({
    status: "PUBLISHED",
    showOnHome: true,
  })
    .select("title weekStart publishedAt homeShownAt month year school")
    .sort({ homeShownAt: -1, publishedAt: -1, weekStart: -1, createdAt: -1 })
    .limit(20)
    .populate("school", "schoolName")
    .lean();

  if (issues.length === 0) return [];

  const issueIds = issues.map((issue) => issue._id);
  const articles = await SchoolMagazineArticle.find({
    magazineIssue: { $in: issueIds },
    isMagazinePublished: true,
    isDeleted: false,
  })
    .select("title content category images coverImage tags magazineIssue magazinePublishedAt updatedAt")
    .sort({ magazinePublishedAt: 1, updatedAt: 1 })
    .lean();

  const articlesByIssue = articles.reduce((map, article) => {
    const key = String(article.magazineIssue);
    const list = map.get(key) || [];
    list.push(article);
    map.set(key, list);
    return map;
  }, new Map());

  return issues
    .map((issue) => {
      const issueArticles = articlesByIssue.get(String(issue._id)) || [];
      if (issueArticles.length === 0) return null;

      const firstArticle = issueArticles[0];
      const schoolId = issue.school?._id ? String(issue.school._id) : "";

      return {
        id: `magazine-${issue._id}`,
        href: `/magazines/${issue._id}`,
        title: issue.title || "School Magazine",
        content:
          issueArticles.length === 1
            ? firstArticle.content
            : `${issueArticles.length} selected student writings published in this school magazine issue.`,
        category: "SCHOOL_MAGAZINE",
        coverImage: serializeWritingImage(firstArticle.coverImage),
        images: serializeWritingImages(firstArticle.images),
        tags: firstArticle.tags || [],
        date: issue.homeShownAt || issue.publishedAt || issue.weekStart,
        author: "School Magazine",
        schoolName: issue.school?.schoolName || "School",
        schoolHref: schoolId ? `/schools/${schoolId}` : "",
        schoolId,
      };
    })
    .filter(Boolean);
}

async function getHighRotationSpotlightStudentWritings() {
  const highRotationPromotions = await SchoolPromotion.find({
    placement: "HOME_SPOTLIGHT",
    status: "ACTIVE",
    priority: "PREMIUM",
  })
    .select("school")
    .lean();

  const highRotationSchoolIds = [
    ...new Set(
      highRotationPromotions
        .map((promotion) => promotion.school)
        .filter(Boolean)
        .map((schoolId) => String(schoolId))
    ),
  ];

  if (highRotationSchoolIds.length === 0) return [];

  const articles = await SchoolMagazineArticle.find({
    status: "APPROVED",
    isPublished: true,
    isDeleted: false,
    // Same rule as the feed: transferred-out students' writings are no longer
    // the origin school's live content.
    showOnSchoolWall: true,
    school: { $in: highRotationSchoolIds },
  })
    .select("title content category images coverImage tags publishedAt updatedAt")
    .sort({ publishedAt: -1, updatedAt: -1 })
    .limit(40)
    .populate("authorStudent", "name grade")
    .populate("school", "schoolName")
    .lean();

  return articles.map((article) => ({
    id: String(article._id),
    href: `/writings/${article._id}`,
    title: article.title,
    content: article.content,
    category: article.category || "WRITING",
    coverImage: serializeWritingImage(article.coverImage),
    images: serializeWritingImages(article.images),
    tags: article.tags || [],
    date: article.publishedAt || article.updatedAt,
    author: article.authorStudent?.name || "Student",
    schoolName: article.school?.schoolName || "School",
    schoolHref: article.school?._id ? `/schools/${article.school._id}` : "",
    schoolId: article.school?._id ? String(article.school._id) : "",
  }));
}

async function getUpcomingEvents() {
  const events = await Event.find({
    eventScope: "PLATFORM",
    status: "APPROVED",
    visibility: "PUBLIC",
    lifecycleStatus: { $ne: "ARCHIVED" },
    date: { $gte: new Date() },
  })
    .select("title description date eventScope eventType")
    .sort({ date: 1, updatedAt: -1 })
    .limit(4)
    .lean();

  return events.map((event) => ({
    id: String(event._id),
    title: event.title,
    description: event.description,
    date: event.date,
    eventScope: event.eventScope === "PLATFORM" ? "Platform" : "School",
    href: `/events/${event._id}`,
  }));
}

async function getHomepageData() {
  await connectDB();

  const [
    homeSpotlights,
    spotlightStories,
    latestWritings,
    homeMagazineIssues,
    upcomingEvents,
  ] = await Promise.all([
    getActiveSchoolPromotions("HOME_SPOTLIGHT", 5, { randomize: true }),
    getHighRotationSpotlightStudentWritings(),
    getLatestStudentWritings(),
    getHomeMagazineIssues(),
    getUpcomingEvents(),
  ]);

  const publicFeedItems = diversifyBySchool(
    [...homeMagazineIssues, ...latestWritings],
    {
      limit: 5,
      getSchoolKey: (item) => item.schoolId || item.schoolName,
      getTime: (item) => item.date,
    }
  );

  // Enrich both feeds in parallel — each makes its own DB round-trip, so running
  // them together (instead of two sequential awaits) saves a full round-trip.
  const [enrichedSpotlights, enrichedWritings] = await Promise.all([
    enrichItemsWithSchoolProfiles(
      diversifyBySchool(spotlightStories, {
        limit: 5,
        getSchoolKey: (item) => item.schoolId || item.schoolName,
        getTime: (item) => item.date,
      })
    ),
    enrichItemsWithSchoolProfiles(publicFeedItems),
  ]);

  return {
    homeSpotlights,
    spotlightStories: enrichedSpotlights,
    latestWritings: enrichedWritings,
    upcomingEvents,
  };
}

function EmptyPanel({ title, description, href = "", action = "" }) {
  return (
    <section className="empty-state">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-brand-soft shadow-card">
        <FaFeatherAlt className="text-xl text-brand" />
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        {description}
      </p>
      {href && action && (
        <Link
          href={href}
          className="btn btn-primary mt-5 inline-flex items-center gap-2 font-semibold transition-colors"
        >
          {action}
          <FaArrowRight />
        </Link>
      )}
    </section>
  );
}

function AuthorLine({ name, school, badge = "Published Writing", onBrand = false }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          onBrand
            ? "border border-white/30 bg-white/15 text-white"
            : "text-white shadow-card"
        }`}
        style={onBrand ? {} : { background: "var(--color-brand)" }}
      >
        {getInitials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${onBrand ? "text-white" : "text-ink"}`}>
          {name}
        </p>
        <p className={`mt-0.5 flex items-center gap-1 truncate text-xs font-medium ${onBrand ? "text-white" : "text-muted"}`}>
          <FaShieldAlt className={`shrink-0 ${onBrand ? "text-white" : "text-brand"}`} />
          <span className="truncate">{school}</span>
        </p>
      </div>
      <span
        className={`badge badge-neutral shrink-0 font-semibold uppercase tracking-wide ${
          onBrand
            ? "border-white/30 bg-white/15 text-white"
            : "border-brand-line bg-brand-soft text-brand"
        }`}
      >
        {badge}
      </span>
    </div>
  );
}

function FeedCard({ item, badge = "Published Writing" }) {
  const voiceHref = item.href || item.schoolHref || "/student-voices";

  return (
    <article className="card group relative overflow-hidden p-5 text-ink">
      {/* Accent line at top */}
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-0 transition-colors group-hover:opacity-100"
        style={{ background: "var(--color-brand)" }}
      />
      <AuthorLine
        name={item.author || item.studentLabel || "Student"}
        school={item.schoolName || "School"}
        badge={badge}
      />
      {item.date && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-subtle">
          <FaRegCalendarAlt className="text-2xs" />
          <AppDate value={item.date} />
        </div>
      )}
      <div className="mt-3 min-w-0">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-snug text-ink">
              {item.title || "Published student writing"}
            </h2>
            <WritingPreview
              content={item.content}
              maxLength={280}
              className="mt-2 line-clamp-4 text-sm leading-5 text-muted"
            />
          </div>
          <WritingCover
            coverImage={item.coverImage}
            images={item.images}
            title={item.title}
            className="h-24 w-28 shrink-0 sm:h-28 sm:w-40"
          />
        </div>
        <WritingTags tags={item.tags} className="mt-3" />
        <Link
          href={voiceHref}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:gap-2.5"
        >
          Read More
          <FaArrowRight className="text-xs" />
        </Link>
      </div>
    </article>
  );
}

function SectionTitle({ title, href = "/" }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition-colors hover:underline"
      >
        View all
        <FaArrowRight className="text-2xs" />
      </Link>
    </div>
  );
}

function RightColumn({ schools, event }) {
  return (
    <aside className="hidden lg:block">
      {/* Pinned like the left explore panel — the feed scrolls, the rails stay. */}
      <div className="sticky top-24 space-y-4">
      {/* Featured Schools card */}
      {schools.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <SectionTitle title="Featured Schools" href="/schools" />
          </div>
          <div className="divide-line px-5">
            {schools.slice(0, 5).map((school) => (
              <Link
                key={school.id || school._id || school.title}
                href={school.href || "/schools"}
                className="group flex items-center gap-3 py-3.5 transition-colors hover:opacity-80"
              >
                <SchoolLogoMark
                  imageUrl={school.profile?.coverImageUrl}
                  name={school.title || school.schoolName}
                  className="h-9 w-9 rounded-control"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {school.title || school.schoolName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {school.tagline || school.location || "School profile"}
                  </span>
                </span>
                <FaArrowRight className="shrink-0 text-2xs text-brand opacity-0 transition-colors group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming event card */}
      {event && (
        <section
          className="surface-brand overflow-hidden rounded-card p-5 text-white shadow-pop"

        >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-control bg-surface">
              <FaCalendarAlt className="text-xs text-white" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wide text-white">Upcoming Event</p>
          </div>
          <h3 className="font-semibold leading-snug text-white">{event.title}</h3>
          <p className="mt-2 text-sm leading-6 text-white">
            {getPreview(event.description, 100)}
          </p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white">
              <FaCalendarAlt className="text-2xs" />
              <AppDate value={event.date} />
            </span>
            <Link
              href={event.href}
              className="btn btn-ghost btn-sm inline-flex items-center font-semibold transition-colors"
            >
              View Event
            </Link>
          </div>
        </section>
      )}
      </div>
    </aside>
  );
}

function MobileSchoolScroller({ schools }) {
  if (schools.length === 0) return null;

  return (
    <section className="">
      <SectionTitle title="Featured Schools" href="/schools" />
      <div className="grid grid-cols-4 gap-2.5">
        {schools.slice(0, 4).map((school) => (
          <Link
            key={school.id || school.title}
            href={school.href || "/schools"}
            className="card transition-colors hover:border-brand-line hover:bg-surface-2 group flex flex-col items-center p-3 pt-4 text-center transition-colors hover:border-brand-line"
          >
            <SchoolLogoMark
              imageUrl={school.profile?.coverImageUrl}
              name={school.title}
              className="h-11 w-11 rounded-control"
            />
            <p className="mt-2 line-clamp-1 text-2xs font-semibold leading-tight text-ink w-full truncate px-0.5">
              {school.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MobileVoiceFeed({ writings }) {
  const items = writings;
  if (items.length === 0) return null;
  const tags = ["All", ...new Set(items.map((item) => getCategoryLabel(item.category)))];

  return (
    <section className="md:hidden">
      <SectionTitle title="Student Writings" href="/student-voices" />
      {/* Category pills */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
        {tags.map((tag, index) => (
          <span
            key={tag}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              index === 0
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-muted hover:border-brand-line"
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
      {/* Feed articles */}
      <div className="space-y-3.5">
        {items.map((item) => (
          <article
            key={item.id || item.title}
            className="card group relative overflow-hidden p-4 transition-colors"
          >
            {/* Top accent */}
            <div
              className="absolute inset-x-0 top-0 h-0.5 opacity-0 transition-colors group-hover:opacity-100"
              style={{ background: "var(--color-brand)" }}
            />
            <div className="mb-3 flex items-center justify-between">
              <span className="badge badge-brand inline-flex items-center font-semibold uppercase tracking-wide">
                {getCategoryLabel(item.category)}
              </span>
              <span className="text-2xs text-subtle"><AppDate value={item.date} /></span>
            </div>
            <AuthorLine name={item.author} school={item.schoolName} badge="" />
            <div className="mt-2.5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-snug text-ink">{item.title}</h2>
                {item.content && (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                    {getPreview(item.content, 180)}
                  </p>
                )}
              </div>
              <WritingCover
                coverImage={item.coverImage}
                images={item.images}
                title={item.title}
                className="h-20 w-24 shrink-0"
              />
            </div>
            <WritingTags tags={item.tags} className="mt-3" />
            <div className="mt-3.5 flex items-center justify-between">
              <Link
                href={item.href || "/student-voices"}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:gap-2.5"
              >
                Read Story
                <FaArrowRight className="text-2xs" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const {
    homeSpotlights,
    spotlightStories,
    latestWritings,
    upcomingEvents,
  } = await getHomepageData();

  const feedItems = latestWritings;
  const activeEvent = upcomingEvents[0] || null;
  const hasMainContent = feedItems.length > 0;

  return (
    <main className="min-h-screen bg-surface text-ink">
      <PublicSiteNav active="home" />
      <HomeScrollMemory />

      <div className="mx-auto grid max-w-[1480px] gap-5 px-1 pb-28 pt-3 sm:px-4 md:px-5 md:pb-10 xl:grid-cols-[230px_minmax(0,1fr)]">
        <PublicExplorePanel active="home" variant="home" />

        <div className="min-w-0">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* On desktop the feed scrolls inside its own column; the page and
                both rails stay put. Mobile keeps normal page scrolling. */}
            <div
              id="home-feed-scroll"
              className="min-w-0 space-y-4 lg:max-h-[calc(100vh-5.75rem)] lg:overflow-y-auto lg:overscroll-contain"
            >
              <HomepageHeroCarousel stories={spotlightStories} />

              <div className="hidden space-y-4 md:block">
                {feedItems.map((item) => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    badge={getCategoryLabel(item.category)}
                  />
                ))}
                {!hasMainContent && (
                  <EmptyPanel
                    title="No public posts yet"
                    description="Published magazine articles, public results, and public events will appear here after schools add them."
                    href="/schools"
                    action="Explore schools"
                  />
                )}
              </div>

              <div className="space-y-4 md:hidden">
                {activeEvent && (
                  <section className="surface-brand rounded-card p-5 text-white shadow-pop">
                    <div className="flex items-center gap-4">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface">
                        <FaCalendarAlt className="text-2xl text-white" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-white">
                          {activeEvent.title}
                        </h2>
                        <p className="mt-1 line-clamp-1 text-xs text-white">
                          {getPreview(activeEvent.description, 80)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
                        <FaCalendarAlt />
                        <AppDate value={activeEvent.date} />
                      </span>
                      <Link
                        href={activeEvent.href}
                        className="btn btn-ghost btn-sm inline-flex items-center"
                      >
                        View Event
                      </Link>
                    </div>
                  </section>
                )}
                {!hasMainContent && !activeEvent && (
                  <EmptyPanel
                    title="Homepage is ready"
                    description="Real school activity will appear here once writing, events, and results are published."
                  />
                )}
                <MobileSchoolScroller schools={homeSpotlights} />
                <MobileVoiceFeed writings={latestWritings} />
              </div>
            </div>

            <RightColumn
              schools={homeSpotlights}
              event={activeEvent}
            />
          </div>
        </div>
      </div>

    </main>
  );
}
