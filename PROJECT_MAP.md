# Praavyo project map

A working map of the codebase for agents: where things live, how the pieces
connect, and the rules each area depends on. Snapshot of 2026-11-01. Verify
against the code before relying on a detail, and fix this file when it drifts.

## 1. Deployment facts

| | |
|---|---|
| Live site | **https://www.praavyo.com** (bare `praavyo.com` redirects to www) |
| Hosting | Vercel, project root `apps/pravyo`, region `bom1` — a NEW deployment |
| Database | the SAME MongoDB Atlas database the old deployment used (live data) |
| Old domain | `pravyo.infobytesnepal.com` is **not used at all** any more |
| Mail domain | `@praavyo.com` (support/contact, sender) |
| Storage | Cloudflare R2, buckets `praavyo` (private) and `praavyo-public` |
| Env | `.env.local` (root: scripts; `apps/pravyo`: the app) + Vercel dashboard. No `.env.example` files, by choice |

Required Vercel env: `MONGODB_URI` (also needed at build time), `NEXTAUTH_URL`
and `NEXT_PUBLIC_SITE_URL` (= `https://www.praavyo.com`, exact browser origin),
`NEXTAUTH_SECRET`. Optional: Resend/SMTP mail, Upstash Redis, VAPID web push
(`VAPID_PUBLIC_KEY`, server-only), R2.

## 2. Repository layout

```
apps/pravyo/            the ONLY Next.js 16 / React 19 app (@pravyo/web)
  app/                  routes (App Router) — pages per role + app/api/*
  components/           Pravyo UI (school, parent, student, events, ...)
  lib/                  Pravyo domain logic (events, guardians, notices, ...)
  models/               two-line re-exports of packages/db models (+ app-only models)
  tests/                jest (npm run test:pravyo)
packages/cas/           CAS domain: lib/ services, components/ UI, tests/ (node --test)
packages/db/            connect.js (one Mongo connection), models/, models/cas/,
                        teacherMemberships.js, parentIdentity.js
packages/auth/          NextAuth options (one session for all roles), parent creds, rate limit
packages/core/          dependency-free helpers: casGrading, casResults, nepaliDate,
                        subjectScope, themeLibrary, webPush, realtimeBus, ...
packages/ui/            small shared UI helpers
scripts/                root maintenance scripts (dry-run first; they hit the live DB)
memory.md               CAS decision log, newest first
apps/pravyo/MEMORY.md   app orientation, deployment, mail, media
```

CAS pages/APIs in `apps/pravyo/app/school/cas/*` and `app/api/cas/*` are thin
wrappers around `packages/cas`.

## 3. Data model essentials

- **No School collection.** A school is a `User` with `role: 'SCHOOL_ADMIN'`;
  its `_id` is the `school` foreign key everywhere. `User.status`:
  PENDING → APPROVED/SUBSCRIBED (access) | REJECTED | UNSUBSCRIBED.
- `SUPER_ADMIN` is also a `User`. `Teacher`, `Student`, `Parent` are separate
  collections (not User roles).
- `TeacherMembership` (teacher + school, ACTIVE/INACTIVE/LEFT) decides teacher
  access; `Teacher.school` only records the creating school.
- `Student.enrollments[]` = history (school, grade, roll, academicYearStart);
  transfers and promotions work through it. Grade names are `"Grade N"`.
- `ParentStudentLink` connects guardians to students; Parent IDs
  (`PRV-P-XXXXXX`) are credentials — never log them.
- `AcademicYear` has `yearStart` (number) but no real calendar dates.
- `SchoolConfig` holds grades, sections, schoolCode, and the school's IEMIS number.
- **IEMIS is the government identity** for students and schools: compulsory,
  unique, the same across schools. Students sign in with it; parent links and
  transfer records carry copies. All IEMIS rules and lookups live in
  `packages/db/iemis.js` + `iemisFormat.js`. Read
  `apps/pravyo/docs/IEMIS_IDENTITY.md` before changing anything IEMIS-related.

## 4. Roles and their areas

| Role | Sign-in | Pages | Notes |
|---|---|---|---|
| SUPER_ADMIN | `/login` | `/admin/*` (dashboard, events, settings, feedback, support, diagnostics, **theme-library**) | approves schools (`PUT /api/schools/[id]/status`) |
| SCHOOL_ADMIN | `/login` | `/school/*` (dashboard, students, teachers, guardians, events, certificates, messages, notices, settings, **cas/***) | the school account itself |
| TEACHER | `/login?as=teacher` | `/teacher/dashboard`, `/teacher/select-school`, `/teacher/exams/*` (CAS marks, student progress, internal-exam marks) | may belong to several schools; session carries `schoolId`; kept out of `/school/*` except event manage + messages (`lib/teacherAreaRoutes.js`) |
| STUDENT | `/student/login` | `/student/*` (events, writing, magazine, walls, journey, learning/cas) | sees published CAS reports only |
| PARENT | `/parent/login` (Parent ID / QR card) | `/parent/*` (child, journey, notices, messages, learning/cas, events) | PWA with web push |
| Public | — | `/`, `/events`, `/schools/[id]`, `/students/[id]`, `/writings/[id]`, `/winners`, `/verify`, `/search` | certificates verified by code |

**Two assessment doors, one set of rules.** The school's API is `/api/cas/*`
(casRoute `handler`, school admins only); the teacher's is
`/api/teacher/exams/*` (`teacherHandler`, teachers only). Both serve the same
endpoint definitions in `apps/pravyo/lib/exams/*Endpoints.js` and the same
services, so a teacher's marks are the records the school, results and report
cards read. Screens get their API from `useCas().api` (CasLayout `audience`).
Never point a teacher screen at `/api/cas` or a school screen at the teacher API.

Auth: `packages/auth/authOptions.js` — one credentials setup, JWT session,
`authVersion` revokes sessions; CAS re-reads the account on every request
(`getActor` in `packages/cas/lib/casAccess.js`).

## 5. Pravyo features (non-CAS)

- **Events & competitions** — the largest area (`app/api/events/[id]/*`, 26
  routes; `lib/event*.js`): rounds, participation requests, invitations,
  capacity locks, results, certificates (`lib/certificates.js`,
  `components/certificates/CertificateSheet.js`).
- **Performance programs** (since 2026-11-04) — school events with no
  competition (Dashain, Tihar): program → performances (solo/group) →
  students. School Events opens on a Competition / Performance program choice.
  Students, assigned teachers or the school add names; each performance's
  list is locked on its own (`performances.locked`; school or assigned teacher
  locks, only the school unlocks) and `participantsLocked` is derived = every
  performance locked; ticking who performed needs that performance locked;
  the school publishes
  and each PERFORMED student gets a private participation `Achievement`
  (`program` set, `isPublic: false`) seen by the student, their linked
  guardians and school staff. Publishing is the "Publish result" button in the
  program's Certificates section; it notifies each student and their guardians
  (`syncAchievementNotifications`, keyed by program id as `metadata.eventId`;
  parents land on My Child → Certificates). Unpublish deletes the certificates
  and those notifications. `models/PerformanceProgram.js`,
  `lib/performancePrograms.js`, `app/api/programs/*`, `app/api/student/programs`,
  `components/programs/*`. Stamped with the academic year.
- **Student writing / magazines** — writings, school & global walls, magazine
  issues, provenance and tags.
- **Student transfers** (parent-driven since 2026-11-05) — the guardian asks
  the current school to release (`/parent/transfer`, `app/api/parent/transfer`)
  → school approves and issues a code → guardian chooses the new school → new
  school admits with grade + roll. Students no longer request transfers
  (`/api/student/transfer` is read-only). Family-side logic in
  `lib/studentTransfers.js`; school actions in `app/api/students/transfer/[id]`;
  school screen `components/dashboard/StudentTransferPanel.js` (one table:
  Needs action / In progress / History). Notifications reach guardians.
- **Guardians / parent app** — guardian roster, access cards with QR
  (`components/school/*Card*`, `components/parent/QrCardScanner.js`),
  messaging, notices with delivery receipts, notifications, web push.
- **Notices, messages, notifications, realtime** — `lib/realtimeBus.js`
  (Upstash Redis streams, in-memory fallback), `app/api/realtime/stream`.
- **Media** — browser compresses to WebP → `POST /api/media/upload` → R2;
  served via `/api/media/r2/[id]`; `MediaAsset` keeps metadata.
- **Website API** (extended 2026-11-27) — every approved school can connect
  its own website: API keys in Settings → Website (`Bearer prv_school_live_…`,
  the key decides the school). `GET /api/v1/website/<resource>` (school,
  notices, events, writings, magazines, gallery, achievements, admission) and
  `/<resource>/<id>`; `POST /api/v1/website/inquiries` (GENERAL or ADMISSION).
  Content in `lib/websiteApi.js`; writings come back as safe `blocks`.
  Settings → Website → "Download website" zips a ready site
  (`lib/websiteKit/*`, `lib/zipStore.js`; route `api/school/settings/website-kit`):
  School life menu (Events, Notices, Student writings, School magazine,
  Gallery), Admission, Contact with General/Admission inquiry; the key lives
  only in its `api.php`+`config.php` (PHP/cPanel) or `server.js`+`.env` (Node).
- **Inquiries & admission** — `SchoolInquiry` has `type` (GENERAL/ADMISSION)
  and `source` (PRAAVYO = public profile, WEBSITE = Website API; old rows count
  as PRAAVYO/GENERAL). Both doors go through `lib/inquiryIntake.js` (honeypot,
  rate limits, push to the school via `pushSchoolInquiry`). Settings →
  Admission (`SchoolAdmission`, `lib/schoolAdmission.js`, `api/school/admission`)
  opens/closes the season; while open the profile (`#admission`) and website
  show the form, closed = 409 ADMISSION_CLOSED. Inbox filters: Through website /
  Through Praavyo × General / Admission, CSV download.
- **Gallery** — `SchoolGalleryAlbum` (DRAFT/PUBLIC, ≤60 photos, MediaAsset
  purpose `GALLERY_IMAGE`, public bucket), dashboard `?tab=gallery`,
  `api/school/gallery*`. Public albums feed the website's Gallery; removing
  photos/albums deletes their assets through `lib/mediaCleanup.js`.

## 6. CAS (Continuous Assessment System)

**Phases.** Phase 1 = Grades 1–5 (built). Phase 2 = Grades 6–10, different
exam/assessment process (not designed). Today, Grades 6–10 can record
assessment levels, but result calculation and report generation are blocked
on purpose (`usesResultSheet`, `RESULT_SHEET_MAX_GRADE = 5` in
`packages/cas/lib/casResultSheet.js`; enforced in `generateReports`).

**Collections** (`packages/db/models/cas/`): `CasSubject` (the school's single
subject register, embeds themes), `CasLearningOutcome`, `CasExam` (per school
+ academic year), `CasThemeExam` (which themes an exam assesses — the only
assessment gate), `CasExamTeacherAssignment`, `CasAssessment` (levels 1–4 with
reassessments), `CasStudentRecord` (legacy attendance/extra activities — no
longer entered or shown in CAS; see Internal Exam below), `CasReport`
(DRAFT → PUBLISHED frozen snapshots).

**Flow.**
1. *Curriculum* (`/school/cas/curriculum`, `casCurriculumService`): subjects →
   themes → outcomes, credit hours. Defaults come from the global library.
2. *Exams* (`/school/cas/exams`, `casExamService`): create exams, tick which
   themes each exam covers, assign teachers.
3. *Assessment* (`/school/cas/assessment`, `casAssessService`): teacher or
   school records levels 1–4 per student per outcome.
4. *Results* (`casReportService`, `casResultSheet`, `packages/core/casGrading`):
   theme = assessed outcomes × 4; subject % pooled across themes; GPA weighted
   by credit hours (spec: the Grade 3 demo result PDF, pinned by tests).
5. *Reports* (`/school/cas/print/*`, `components/report/ReportCard.js`, formats
   CLASSIC / MODERN): generate DRAFT, publish → students and parents see them
   (`app/api/cas-published`, `/parent/learning/cas`, `/student/learning/cas`).

**Global default curriculum.** One library under the reserved school id
`LIBRARY_SCHOOL_ID` (`packages/core/themeLibrary.js`), edited by the super admin
at `/admin/theme-library`, Grades 1–5 (content today: Grades 1–3 — English,
Mathematics, Nepali, Our Surroundings; Grade 4 — Nepali, English, Mathematics,
Social Studies, Science, Health/Physical/Creative Arts, credit hours from the
book's GPA table). Books are transcribed to `data/curriculum/books/grade-N-*.txt`,
built with `node scripts/build-curriculum-books.mjs`, and loaded into the
library with `node scripts/load-library-grade.mjs <grade-N.json> [--apply]`
(insert-only). `provisionDefaultCurriculum`
(`casLibraryService.js`) gives each school its own linked copy on approval;
each library subject reaches a school once (`User.casDefaultSubjects`); grades
a school built itself are skipped; edits stay local; library updates are
opt-in per theme ("Update available"). Library subjects added later (a new
grade) reach approved schools automatically: `syncDefaultCurriculum` runs on
`/api/cas/context` and `loadCurriculum` (throttled to once a minute per
school). `npm run provision:curriculum` still exists to push to every school at once.

**Exams = CAS + Internal Exam (since 2026-11-03).** The school sidebar's
"Exams" (`/school/exams`) chooses between:
- *CAS* — Grades 1–5 only (the CAS shell filters `school.grades` through
  `usesResultSheet`); results always render Classic, no format dropdown.
- *Internal Exam* (`/school/internal-exam/{marks,attendance,exams,results,published-results}`,
  same shell with `area="internal"`) — the school's own papers, Grades 1–10.
  An exam is created once for every grade (stored as one `InternalExam` row
  per grade, grouped by year + name; each grade publishes on its own).
  Models `InternalExam`, `InternalExamMark` (TH + internal fields by id),
  `InternalMarkScheme` (one school-wide TH/INT structure), `InternalActivitySet`
  (the school's activities with full marks), `InternalExamRecord` (attendance +
  activity marks per exam), `InternalExamReport` (frozen snapshots);
  service `packages/cas/lib/internalExamService.js`; maths
  `packages/core/internalExamResult.js` + `internalMarkScheme.js` (TH, INT and
  final each graded on their own %, CAS bands, NG = 0.0); card
  `components/report/InternalExamReport.js` (shares `report/gradeSheet.js`
  with the CAS card). A subject teacher on the Teachers page enters that
  subject in every exam of the grade, at `/teacher/exams/internal`, and
  nothing else (Manage Exams > Teachers only shows this, read-only).
  Unpublished = everything editable; publishing needs every mark and locks;
  parents/students read both collections via `lib/casPublished.js`.
  Combined final results: not built. Details: `memory.md` (2026-11-18..20).

**CAS boundaries.** `packages/cas/lib/casContext.js` is the only CAS module
that reads Pravyo collections. CAS never creates accounts or students.

## 7. Working conventions

- Run `npm run dev` (never bare `next dev`); no `"type": "module"` anywhere.
- Styling: tokens and component classes in `apps/pravyo/app/globals.css`
  (Figtree, brand `#2b59c3`, lucide icons); printed documents keep fixed formats.
- Visible brand "Praavyo"; technical names stay `pravyo`.
- Bilingual English/Nepali content; BS/AD calendars (`nepaliDate`).
- Never seed fake students/parents into the live DB; use `CAS_TEST_MONGOD`.
- Writes to production (scripts with `--apply`) only with the owner's go-ahead.
- The owner commits changes themselves; don't commit unless asked.

## 8. Tests and verification

```bash
npm test                     # packages/cas unit tests (node --test)
npm run test:pravyo          # apps/pravyo jest tests
CAS_TEST_MONGOD="C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe" \
  node --test packages/cas/tests/*.integration.test.mjs   # isolated replica set
cd apps/pravyo && npx eslint <files>
```
Local router DNS may lag on the new domain: probe with
`curl --resolve www.praavyo.com:443:216.198.79.65 https://www.praavyo.com/`.
