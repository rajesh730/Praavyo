import mongoose from "mongoose";
import User from "@/models/User";
import Notice from "@/models/Notice";
import Event from "@/models/Event";
import Achievement from "@/models/Achievement";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import SchoolGalleryAlbum from "@/models/SchoolGalleryAlbum";
import PerformanceProgram from "@/models/PerformanceProgram";
import { admissionForm, admissionNotice, generalInquiryForm } from "@/lib/inquiryForms";
import { getAdmissionSeason } from "@/lib/schoolAdmission";
import { serializeAlbumForWebsite } from "@/lib/schoolGallery";
import { parseWritingBlocks, parseWritingInline, stripWritingMarkup } from "@/lib/writingMarkup";
import { paginatedData, websitePagination } from "@/lib/websiteApiAuth";
import { printableOrigin } from "@/lib/siteUrl";

/**
 * The Website API's content: what a school's own website reads from Praavyo
 * (GET /api/v1/website/<resource>[/<id>]). The API key decides the school, so
 * every query here is scoped to `schoolId`, and only public, published
 * content is ever returned. Images come back as absolute URLs so they load on
 * the school's own domain.
 *
 * Each function returns plain data, or null when the item is not found.
 */

export const WEBSITE_RESOURCES = [
  { resource: "school", label: "School profile", detail: false },
  { resource: "notices", label: "Public notices", detail: true },
  { resource: "events", label: "Public events", detail: true },
  { resource: "writings", label: "Student writings", detail: true },
  { resource: "magazines", label: "School magazines", detail: true },
  { resource: "gallery", label: "Gallery albums", detail: true },
  { resource: "achievements", label: "Public achievements", detail: false },
  { resource: "admission", label: "Admission season and form", detail: false },
  { resource: "forms", label: "Inquiry and admission form fields", detail: false },
];

/** The origin that image URLs are made absolute with. */
export function websiteOrigin(request) {
  return printableOrigin(new URL(request.url).origin);
}

const absolute = (origin, url) => {
  const value = String(url || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? `${origin}${value}` : value;
};

const excerpt = (text, max = 220) => {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trim()}…`;
};

const validId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

async function page(model, filter, { request, select, sort, populate, defaultLimit = 12 }, map) {
  const { page: current, limit, skip } = websitePagination(request, defaultLimit);
  let query = model.find(filter).select(select).sort(sort).skip(skip).limit(limit);
  if (populate) query = query.populate(...populate);
  const [rows, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return paginatedData(rows.map(map), total, current, limit);
}

// ── school ────────────────────────────────────────────────────────────────

export async function websiteSchool(schoolId, { origin }) {
  const [school, profile, admission] = await Promise.all([
    User.findOne({ _id: schoolId, role: "SCHOOL_ADMIN", status: { $in: ["APPROVED", "SUBSCRIBED"] } })
      .select(
        "schoolName principalName schoolLocation province district municipality ward tole streetAddress postalCode schoolPhone website establishedYear email"
      )
      .lean(),
    // The API key is the school's own, so its profile is served to its own
    // website whether or not the Praavyo public profile is switched on.
    SchoolShowcaseProfile.findOne({ school: schoolId })
      .select(
        "tagline summary logoUrl coverImageUrl bannerImageUrl websiteUrl motto contactEmail contactPhone socialLinks highlightMetrics publicHighlights"
      )
      .lean(),
    getAdmissionSeason(schoolId),
  ]);
  if (!school) return null;

  const logo = absolute(origin, profile?.logoUrl || profile?.coverImageUrl);
  return {
    id: String(school._id),
    name: school.schoolName || "School",
    principalName: school.principalName || "",
    location: school.schoolLocation || "",
    address: {
      province: school.province || "",
      district: school.district || "",
      municipality: school.municipality || "",
      ward: school.ward || "",
      tole: school.tole || "",
      street: school.streetAddress || "",
      postalCode: school.postalCode || "",
    },
    phone: profile?.contactPhone || school.schoolPhone || "",
    email: profile?.contactEmail || "",
    website: profile?.websiteUrl || school.website || "",
    establishedYear: school.establishedYear || null,
    logoUrl: logo,
    bannerUrl: absolute(origin, profile?.bannerImageUrl),
    praavyoProfileUrl: `${origin}/schools/${school._id}`,
    admissionOpen: admission.season.isOpen,
    admission: {
      status: admission.season.isOpen ? "OPEN" : "CLOSED",
      acceptingFor: admission.season.isOpen ? "THIS_YEAR" : "NEXT_YEAR",
      notice: admissionNotice(admission.season),
    },
    showcase: profile
      ? {
          tagline: profile.tagline || "",
          summary: profile.summary || "",
          motto: profile.motto || "",
          logoUrl: logo,
          // Kept for clients on the original public API contract.
          coverImageUrl: logo,
          contactEmail: profile.contactEmail || "",
          socialLinks: profile.socialLinks || {},
          highlights: profile.publicHighlights || [],
          metrics: profile.highlightMetrics || {},
        }
      : null,
  };
}

// ── notices ───────────────────────────────────────────────────────────────

function noticeFilter(schoolId) {
  const now = new Date();
  return {
    school: schoolId,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    isActive: true,
    isDeleted: { $ne: true },
    $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
  };
}

const noticeOut = (row, full) => ({
  id: String(row._id),
  title: row.title,
  ...(full ? { content: row.content } : { content: row.content, excerpt: excerpt(row.content) }),
  type: row.type,
  priority: row.priority,
  publishedAt: row.publishedAt,
  expiryDate: row.expiryDate,
});

export function websiteNotices(schoolId, { request }) {
  return page(
    Notice,
    noticeFilter(schoolId),
    { request, select: "title content type priority publishedAt expiryDate", sort: { publishedAt: -1 } },
    (row) => noticeOut(row, false)
  );
}

export async function websiteNotice(schoolId, id) {
  if (!validId(id)) return null;
  const row = await Notice.findOne({ ...noticeFilter(schoolId), _id: id })
    .select("title content type priority publishedAt expiryDate")
    .lean();
  return row ? noticeOut(row, true) : null;
}

// ── events ────────────────────────────────────────────────────────────────

const eventFilter = (schoolId) => ({
  school: schoolId,
  eventScope: "SCHOOL",
  status: "APPROVED",
  visibility: "PUBLIC",
  lifecycleStatus: { $ne: "ARCHIVED" },
});

const EVENT_FIELDS = "title description date eventType lifecycleStatus registrationDeadline resultsPublished eligibleGrades";

const eventOut = (row, full) => ({
  id: String(row._id),
  title: row.title,
  description: row.description,
  ...(full ? {} : { excerpt: excerpt(row.description) }),
  date: row.date,
  type: row.eventType,
  status: row.lifecycleStatus,
  registrationDeadline: row.registrationDeadline,
  resultsPublished: Boolean(row.resultsPublished),
  eligibleGrades: row.eligibleGrades || [],
});

// School programs (Dashain, Tihar, sports day...): performances, no competition.
const PROGRAM_FIELDS = "title description venue date certificatesPublishedAt";

const programOut = (row, full) => ({
  id: String(row._id),
  title: row.title,
  description: row.description || "",
  ...(full ? {} : { excerpt: excerpt(row.description) }),
  date: row.date,
  type: "PROGRAM",
  kind: "PROGRAM",
  venue: row.venue || "",
  status: row.date && new Date(row.date) < new Date() ? "COMPLETED" : "ACTIVE",
  registrationDeadline: null,
  resultsPublished: Boolean(row.certificatesPublishedAt),
  eligibleGrades: [],
});

/** Competitions and programs together, newest first. */
export async function websiteEvents(schoolId, { request }) {
  const { page: current, limit, skip } = websitePagination(request, 12);
  const take = skip + limit;
  const [events, programs, eventTotal, programTotal] = await Promise.all([
    Event.find(eventFilter(schoolId)).select(EVENT_FIELDS).sort({ date: -1 }).limit(take).lean(),
    PerformanceProgram.find({ school: schoolId }).select(PROGRAM_FIELDS).sort({ date: -1 }).limit(take).lean(),
    Event.countDocuments(eventFilter(schoolId)),
    PerformanceProgram.countDocuments({ school: schoolId }),
  ]);
  const items = [
    ...events.map((row) => ({ ...eventOut(row, false), kind: "COMPETITION", venue: "" })),
    ...programs.map((row) => programOut(row, false)),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(skip, skip + limit);
  return paginatedData(items, eventTotal + programTotal, current, limit);
}

export async function websiteEvent(schoolId, id) {
  if (!validId(id)) return null;
  const row = await Event.findOne({ ...eventFilter(schoolId), _id: id }).select(EVENT_FIELDS).lean();
  if (row) return { ...eventOut(row, true), kind: "COMPETITION", venue: "" };
  const program = await PerformanceProgram.findOne({ _id: id, school: schoolId }).select(PROGRAM_FIELDS).lean();
  return program ? programOut(program, true) : null;
}

// ── writings ─────────────────────────────────────────────────────────────

/**
 * Student writings a school website shows: what is on the school wall (the
 * same rule as the wall itself, curated by teachers and the school in the
 * Publishing Desk — hide a writing there and it leaves the website too), plus
 * anything published publicly (approved, in a published magazine, or on the
 * Praavyo wall).
 */
export const writingFilter = (schoolId) => ({
  school: schoolId,
  isDeleted: { $ne: true },
  $or: [
    { status: { $in: ["SUBMITTED", "APPROVED"] }, showOnSchoolWall: { $ne: false } },
    { status: "APPROVED", isPublished: true },
    { isMagazinePublished: true },
    { isGlobalWallPublished: true },
  ],
});

const WRITING_FIELDS =
  "title content category authorStudent authorGrade publishedAt submittedAt magazinePublishedAt isFeatured coverImage images tags";

/**
 * Writing as structured blocks, so a website renders bold, italic, links,
 * headings and lists without ever inserting HTML:
 *   { type: "heading" | "paragraph", inline: Node[] }
 *   { type: "bullets", items: Node[][] } | { type: "numbers", start, items: Node[][] }
 * Node = { type: "text", text } | { type: "bold" | "italic" | "highlight", children }
 *      | { type: "link", href (http/https/mailto only), children }
 * Paragraph text keeps its line breaks (newline characters): render it with
 * white-space: pre-line.
 */
export function writingBlocks(content = "") {
  const blocks = [];
  for (const block of parseWritingBlocks(content)) {
    if (block.type === "heading") blocks.push({ type: "heading", inline: parseWritingInline(block.text) });
    else if (block.type === "bullets") blocks.push({ type: "bullets", items: block.items.map(parseWritingInline) });
    else if (block.type === "numbers") {
      blocks.push({ type: "numbers", start: block.start, items: block.items.map(parseWritingInline) });
    } else {
      let lines = [];
      const flush = () => {
        if (lines.length) blocks.push({ type: "paragraph", inline: parseWritingInline(lines.join("\n")) });
        lines = [];
      };
      block.lines.forEach((line) => (line.trim() ? lines.push(line) : flush()));
      flush();
    }
  }
  return blocks;
}

function writingOut(row, origin, full) {
  const text = stripWritingMarkup(row.content || "");
  const images = [...(row.images || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  return {
    id: String(row._id),
    title: row.title,
    // `content` keeps Praavyo's light markup (**bold**, _italic_, "# " headings,
    // "- " bullets); `contentText` is the same text without it.
    content: row.content,
    contentText: text,
    excerpt: excerpt(text),
    category: row.category,
    tags: row.tags || [],
    authorName: row.authorStudent?.name || "Student",
    authorGrade: row.authorGrade || "",
    publishedAt: row.publishedAt || row.magazinePublishedAt || row.submittedAt || null,
    featured: Boolean(row.isFeatured),
    coverImageUrl: absolute(origin, row.coverImage?.url || images[0]?.url),
    ...(full
      ? {
          blocks: writingBlocks(row.content || ""),
          images: images.map((image) => ({
            url: absolute(origin, image.url),
            caption: image.caption || "",
            altText: image.altText || "",
          })),
        }
      : {}),
  };
}

export function websiteWritings(schoolId, { request, origin }) {
  return page(
    SchoolMagazineArticle,
    writingFilter(schoolId),
    {
      request,
      select: WRITING_FIELDS,
      sort: { submittedAt: -1, publishedAt: -1, createdAt: -1 },
      populate: ["authorStudent", "name"],
    },
    (row) => writingOut(row, origin, false)
  );
}

export async function websiteWriting(schoolId, id, { origin }) {
  if (!validId(id)) return null;
  const row = await SchoolMagazineArticle.findOne({ ...writingFilter(schoolId), _id: id })
    .select(WRITING_FIELDS)
    .populate("authorStudent", "name")
    .lean();
  return row ? writingOut(row, origin, true) : null;
}

// ── magazines ─────────────────────────────────────────────────────────────

const MAGAZINE_FIELDS = "title weekStart weekEnd weekNumber month year publishedAt articles";

const magazineOut = (row) => ({
  id: String(row._id),
  title: row.title,
  weekStart: row.weekStart,
  weekEnd: row.weekEnd,
  weekNumber: row.weekNumber,
  month: row.month,
  year: row.year,
  publishedAt: row.publishedAt,
  articleCount: row.articles?.length || 0,
});

export function websiteMagazines(schoolId, { request }) {
  return page(
    MagazineIssue,
    { school: schoolId, status: "PUBLISHED" },
    { request, select: MAGAZINE_FIELDS, sort: { publishedAt: -1, weekStart: -1 } },
    magazineOut
  );
}

/** One published issue with its published articles (full text). */
export async function websiteMagazine(schoolId, id, { origin }) {
  if (!validId(id)) return null;
  const issue = await MagazineIssue.findOne({ _id: id, school: schoolId, status: "PUBLISHED" })
    .select(MAGAZINE_FIELDS)
    .lean();
  if (!issue) return null;
  const articles = await SchoolMagazineArticle.find({
    school: schoolId,
    magazineIssue: issue._id,
    isMagazinePublished: true,
    isDeleted: { $ne: true },
  })
    .select(WRITING_FIELDS)
    .populate("authorStudent", "name")
    .sort({ magazinePublishedAt: 1, publishedAt: 1, updatedAt: 1 })
    .lean();
  return {
    ...magazineOut(issue),
    articleCount: articles.length,
    articles: articles.map((row) => writingOut(row, origin, true)),
  };
}

// ── gallery ───────────────────────────────────────────────────────────────

export function websiteGallery(schoolId, { request, origin }) {
  return page(
    SchoolGalleryAlbum,
    { school: schoolId, status: "PUBLIC" },
    { request, select: "title description takenOn publishedAt photos", sort: { publishedAt: -1 } },
    (row) => serializeAlbumForWebsite(row, origin, { withPhotos: false })
  );
}

export async function websiteAlbum(schoolId, id, { origin }) {
  if (!validId(id)) return null;
  const row = await SchoolGalleryAlbum.findOne({ _id: id, school: schoolId, status: "PUBLIC" }).lean();
  return row ? serializeAlbumForWebsite(row, origin) : null;
}

// ── achievements ─────────────────────────────────────────────────────────

export function websiteAchievements(schoolId, { request }) {
  return page(
    Achievement,
    { school: schoolId, isPublic: true },
    {
      request,
      select: "student recipientType teamName title description level placement certificateRecipientName awardedAt",
      sort: { awardedAt: -1 },
      populate: ["student", "name"],
    },
    (row) => ({
      id: String(row._id),
      title: row.title,
      description: row.description || "",
      recipientType: row.recipientType,
      recipientName: row.certificateRecipientName || row.teamName || row.student?.name || "Student",
      level: row.level,
      placement: row.placement,
      awardedAt: row.awardedAt,
    })
  );
}

// ── admission ────────────────────────────────────────────────────────────

/**
 * The admission season and its form. The form is always offered: while open
 * for the grades taking applications; while closed for every grade, with
 * `notice` telling families it is for next year (applications arrive marked
 * "Next year").
 */
export async function websiteAdmission(schoolId) {
  const { season, schoolGrades } = await getAdmissionSeason(schoolId);
  const form = admissionForm(season, schoolGrades);
  return {
    ...season,
    grades: form.fields.find((field) => field.name === "grade").options,
    status: form.status,
    acceptingFor: form.acceptingFor,
    notice: form.notice,
    form,
  };
}

/** Both forms a website shows: general inquiry and admission. */
export async function websiteForms(schoolId) {
  const { season, schoolGrades } = await getAdmissionSeason(schoolId);
  return { general: generalInquiryForm(), admission: admissionForm(season, schoolGrades) };
}

/** List endpoints by resource name. */
export const WEBSITE_LISTS = {
  school: (schoolId, ctx) => websiteSchool(schoolId, ctx),
  notices: websiteNotices,
  events: websiteEvents,
  writings: websiteWritings,
  magazines: websiteMagazines,
  gallery: websiteGallery,
  achievements: websiteAchievements,
  admission: (schoolId) => websiteAdmission(schoolId),
  forms: (schoolId) => websiteForms(schoolId),
};

/** Detail endpoints (`/<resource>/<id>`) by resource name. */
export const WEBSITE_DETAILS = {
  notices: (schoolId, id) => websiteNotice(schoolId, id),
  events: (schoolId, id) => websiteEvent(schoolId, id),
  writings: websiteWriting,
  magazines: websiteMagazine,
  gallery: websiteAlbum,
};
