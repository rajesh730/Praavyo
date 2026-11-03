# Praavyo CAS memory

Newest sections first. Where sections disagree, the newer one wins.

## Exams = CAS + Internal Exam, result rules - 2026-11-03 (read first)

Owner decisions made over one long session. Supersedes anything older about
report formats, unpublishing and the Grades 6–10 gap.

### Two result tracks
- **CAS** — the government continuous assessment, **Grades 1–5 only**, by
  theme and learning outcome, exactly as before. Calculation unchanged (demo
  PDF rules, `packages/cas/lib/casResultSheet.js`).
- **Internal Exam** — the school's own written papers, **Grades 1–10**, plain
  marks per student per subject.
- Grades 1–5 therefore get **two report cards a term**; Grades 6–10 get one.
  The two publish **separately** (neither waits for the other); parents see
  both under Student Result, labelled "CAS" / "Internal exam".
- School sidebar item "CAS" was renamed **Exams** → `/school/exams`, a chooser
  page with two cards (CAS → `/school/cas/assessment`, Internal Exam →
  `/school/internal-exam/marks`). Both workspaces share the CAS shell
  (`CasLayout`, prop `area="cas" | "internal"`) and link to each other in the
  sidebar. Teachers see CAS Assessment + Internal Exam mark entry only; their
  dashboard Assessment tab has an "Internal exam marks" card.
- In the CAS area `school.grades` is filtered through `usesResultSheet`
  (Grades 1–5) inside `CasLayout`, so every CAS dropdown hides 6–10. The super
  admin's theme library keeps its own grade list.

### Report formats (owner's naming wins over the code's old names)
- The owner calls the blue-header outcome sheet **Classic** and the grade
  sheet with Attendance/Extra Activities "modern". The code had these
  inverted (`CLASSIC` used to render `ModernReport.js`).
- Now `components/report/ReportCard.js` **always** renders `ClassicReport.js`
  for every CAS card, ignoring the stored `format`, on every screen, print
  route and the parent/student portal. No format dropdown anywhere
  (Student Result, Published Results). `ModernReport.js` is unused by CAS.
  The Classic sheet has **no Attendance / Extra Activities section** — the
  data is still saved; owner was asked whether to add it back (open).
- The **Modern** card is the internal exam's own:
  `components/report/InternalExamReport.js`.
- Classic card layout changes: signatures (Class Teacher, Principal,
  **Issue Date**) sit at the foot of the A4 page (`cas-a4-fit` +
  `cas-a4-foot`); the long "Achievement levels run from 1 to 4…" note, the
  credit-hour note and "Published report. Figures are fixed…" were removed.
  Only an unpublished preview still says "DRAFT — not published".

### Report-card data comes from the database at read time
`packages/cas/lib/casBranding.js` (`loadReportBranding` / `withBranding`)
attaches, whenever any CAS or internal card is read:
- `logoUrl` — Public Profile school logo (`schoolshowcaseprofiles.coverImageUrl`);
- `reportImageUrl` — Settings → Report card images (`SchoolConfig.reportCardImageUrl`);
- `principalName` — school account (`User.principalName`), live; the snapshot
  copy is only a fallback;
- `classTeachers` — `{ grade: names }` from `TeacherTeachingAssignment`
  `CLASS_TEACHER` rows, only teachers with an ACTIVE membership.
So changing the logo, principal or class teacher shows on every card without
republishing. Internal-exam remark is derived from the result (grade band's
words if passed, else "Needs improvement in: <subjects>"), not fixed text.

### Issue date
- Set per exam in **Manage Exams** (CAS: `CasExam.issueDate`; internal:
  `InternalExam.issueDate`). The Classic card labels it "Issue Date".
- `updateExam` in `casExamService.js` now also rewrites
  `snapshot.issueDate` on every CasReport of that exam (published included),
  so a later change reaches existing cards. Whole-year (exam-less) cards take
  the latest exam's date at generation and only change when regenerated.

### Publishing and unpublishing CAS results (owner rule)
- **Student Result only publishes.** The per-student Unpublish button and the
  old `unpublishGradeResults` were removed.
- **Unpublish happens only on Published Results, a whole exam at a time** for
  the chosen grade: every section, every student. Button "Unpublish exam" is
  enabled once a specific exam is chosen in the filter; the exam filter also
  offers "Whole year (final result)" (`WHOLE_YEAR` = cards with `exam: null`).
- **Unpublish = delete.** `unpublishExamResults` (`casReportService.js`, route
  `POST /api/cas/results/unpublish` with `{ academicYear, grade, exam }`)
  deletes every CasReport for school + year + grade + exam (any status) and
  the `UserNotification`s pointing at them. Nothing is kept as DRAFT; the
  assessments remain, so the school simply publishes that exam again from
  Student Result to rebuild the cards. Owner's reason: kept drafts are an
  extra burden on the database.
- Old behaviour left DRAFT rows behind from earlier unpublishes; they were NOT
  cleaned from production (would need the owner's go-ahead).

### Internal Exam module (built 2026-11-03)
- Models (`packages/db/models/cas/`): `InternalExam` (school, academicYear,
  grade, term FIRST/SECOND/THIRD/FINAL, name, `fullMarks` default for every
  subject, `subjectFullMarks` overrides, `passPercent` default 35, issueDate,
  publishedAt), `InternalExamMark` (exam + student + subject unique; `marks`
  or `absent`), `InternalExamReport` (frozen snapshot per student).
- Service `packages/cas/lib/internalExamService.js`; routes under
  `/api/cas/internal-exams` (list/create/update/delete, `sheet`, `marks`,
  `cards`, `publish` with `{ exam, publish: true|false }`).
- Maths `packages/core/internalExamResult.js`: subject % = marks ÷ full marks,
  so out-of-50 and out-of-100 grade on one scale; same `GRADE_BANDS` as CAS;
  absent = 0 and fails; GPA by credit hours, or equal weights when the grade
  has no credit hours at all. Tests `packages/cas/tests/internalExamResult.test.mjs`.
- Screens: Manage Exams, Mark Entry (grid student × subject, `AB` = absent,
  Enter moves down, live total/%/GPA/grade, per-subject entered/expected),
  Results (preview cards → Publish; publish blocked until every mark is
  entered; publishing locks marks; Unpublish deletes the cards and unlocks).
- Access: school admin edits everything; a teacher edits only subjects they
  hold as `SUBJECT_TEACHER` on the Teachers page; a `CLASS_TEACHER` reads the
  grade's grid. Subjects come from the subject register (`CasSubject`,
  examined, active); optional subjects only for assigned students.
- Not built (owner: later): theory / practical / internal-assessment split,
  combining terminals into a final result, guardian notification on publish.

### Smaller fixes the same day
- CAS filter rows always show **Section** (disabled "No sections" when the
  grade has none) on Assessment, Attendance/Extra Activities and Student
  Progress, so every grade's row looks the same.
- `useCasQuery` (`lib/client/useCas.js`) keeps showing the current data while
  the same URL reloads (`loading` = first load only, new `refreshing` flag).
  Fixes Manage Exams' theme panel collapsing on every tick (a reload swapped
  the list for a spinner). Internal Mark Entry swaps in the saved sheet
  before clearing drafts.
- Teacher Login Card QR now signs the teacher in by itself
  (`packages/auth/teacherCardToken.js`, HMAC of teacher id + `cardVersion`
  with NEXTAUTH_SECRET; teachers at several schools get a username-only card).
  "Reset password" sets `password@123` and bumps `cardVersion` (old cards stop
  working). Teachers change their password on My Profile.
- Green Villege's logo field is empty (latest SCHOOL_LOGO asset, uploaded
  2026-11-01 09:04, was marked DELETED at 11:41 the same day). Note:
  `app/api/media/r2/[id]` auto-clears a logo when storage reports the file
  missing, without revalidating the public page — a cached public profile can
  still show a logo the database no longer has. Cause not confirmed.

### Tests
- `packages/cas` unit tests: 72 pass. Integration tests need
  `CAS_TEST_MONGOD="C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe"`;
  2 of 13 fail **before and independent of these changes** — their fixtures
  assess without an exam, which the app now requires ("Exam unavailable",
  NOT_ASSESSED). The preview/unpublish test was updated to the new
  exam-wide delete behaviour but cannot reach those lines until its fixture
  creates an exam first.

## Project scope and phases - 2026-11-01 (read first)

- **Phase 1 — Grades 1–5 (built).** CAS = curriculum (subjects → themes →
  learning outcomes), exams, assessment, results, report cards for Grades 1–5.
- **Phase 2 — Grades 6–10 (not built).** A different exam and assessment
  process. Do not stretch Grades 1–5 logic (theme library, result calculation,
  report formats) over Grades 6–10; wait for the agreed Phase 2 design.
  *(2026-11-03: Grades 6–10 now get results through the Internal Exam — see
  the section above. CAS itself stays Grades 1–5.)*
- Live at https://www.praavyo.com (formerly pravyo.infobytesnepal.com). One
  Next.js app at `apps/pravyo`; CAS domain code in `packages/cas`, shared
  models in `packages/db`, shared helpers in `packages/core`.

## Default curriculum for every school - 2026-11-01

- **One global default, one local copy per school.** The super admin maintains
  the default library at `/admin/theme-library` (stored under the reserved
  school id `LIBRARY_SCHOOL_ID` in `packages/core/themeLibrary.js`; editor is
  limited to `LIBRARY_GRADES` = Grades 1–5). Today it holds Grades 1–3 (English,
  Mathematics, Nepali, Our Surroundings); Grades 4–5 are still to be entered.
- **Provisioning.** `provisionDefaultCurriculum` in
  `packages/cas/lib/casLibraryService.js` copies every library subject the
  school has not received yet — subject, credit hours, all themes and outcomes —
  linked via `CasSubject.librarySubject`, each theme carrying
  `sourceThemeKey`/`sourceHash`. Runs automatically when a super admin first
  approves a school (`apps/pravyo/app/api/schools/[id]/status/route.js`).
- **Each library subject reaches a school at most once.** Received ids are kept
  in `User.casDefaultSubjects` (school account). So a subject the school deletes
  never returns, and Grades 4–5 added later still reach earlier schools.
- **School's choice afterwards.** Copies are local: edits, archiving and
  deletion affect only that school. Library changes appear as "Update
  available" and are applied only if the school chooses. A grade the school set
  up with its own subjects (e.g. Green Villege Grades 1–3, the library's source)
  is skipped entirely. Library grades outside 1–5 are never copied.
- **After adding a grade to the library** (e.g. Grade 4 finished), run
  `npm run provision:curriculum -- --dry-run`, then `-- --apply`, to deliver it
  to already-approved schools. Safe to re-run.
- Tests: `packages/cas/tests/casLibrary.integration.test.mjs` (run with
  `CAS_TEST_MONGOD="C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe"`).
- **Applied on production 2026-11-01** (owner's request): Mothers Tongue
  Secondary School and Tejaswee Pathshala each received 12 subjects, 115
  themes, 1,439 outcomes (Grades 1–3), all linked to the library and recorded
  in `User.casDefaultSubjects`. Green Villege Secondary School (the library's
  source, own Grades 1–3 + Grade 10) was skipped and unchanged. A re-run
  copies nothing.
- The approval hook only works once the code is deployed. A school approved
  before that deploy gets its copy from the next
  `npm run provision:curriculum -- --apply`.
- Is giving the default to every school a problem? No: copies are per school,
  schools with their own setup are skipped, edits stay local, and updates are
  opt-in. The cost is about 1,440 outcome rows per school for Grades 1–3.

## UI refresh and visible rebrand - 2026-10-13

- Product-facing branding is now **Praavyo**. The change is intentionally
  limited to visible text, metadata, PWA naming, accessibility labels,
  certificates, public pages, auth surfaces, parent surfaces and the CAS
  navigation. Legacy identifiers, package names, file names, imports, API
  routes, database values and environment keys remain `pravyo` where they are
  part of the application's technical contract.
- The old 4,179-line global CSS cascade and the unused legacy
  `packages/ui/theme.css` have been removed. `apps/pravyo/app/globals.css` is
  the rebuilt Tailwind v4 foundation, using Plus Jakarta Sans (with Noto Sans
  Devanagari fallback), school-focused surfaces, navigation, forms, status
  states, tables, modal/focus treatment and responsive breakpoints. It includes
  a narrow mapping for named legacy Tailwind colour utilities while components
  are migrated, so older route markup receives the new palette without any
  logic or behavioural change.
- `components/parent/ParentDesign.module.css` was also rebuilt so the parent
  experience is a calmer, short-path workspace rather than an inherited
  dashboard-card treatment. `app/cas.css` keeps its A4/print rules because
  report-card pagination and paper output are functional requirements.
- `apps/pravyo/components/brand/PravyoLogo.js` now presents the existing icon
  alongside the visible Praavyo wordmark for wordmark/lockup variants. The
  CAS sidebar has matching visible Praavyo CAS and Back to Praavyo labels.
  The image files and component identifiers retain their old names to avoid
  breaking imports.
- Read-only visual verification on the authenticated local CAS Student Result
  screen confirmed the refreshed sidebar, active navigation, filters, cards,
  page heading, controls and Praavyo labels render correctly. No school data
  was submitted or modified.
- Verification after the replacement: the authenticated local CAS Curriculum
  workspace rendered after hot reload, its navigation/controls/table remained
  present, `npm test` passes 66/66, the changed web files pass focused ESLint,
  and `npm run build` completes successfully for all 131 generated routes.
  Repository-wide `npm run lint --workspace @pravyo/web` still fails with 58
  pre-existing React hooks/ref errors across unrelated screens (plus five
  load-test warnings); it is not a clean project-wide lint baseline.

## Published Results workspace - 2026-10-13

This is the current source of truth for the school-side published-results
experience. It deliberately separates preparing a result from reviewing report
cards that are already visible to students and guardians.

- CAS now has a `Published Results` sidebar item in
  `packages/cas/components/navigation/casNavigation.js`, routed by
  `apps/pravyo/app/school/cas/published-results/page.js` to
  `packages/cas/components/PublishedResultsPage.js`.
- `Student Result` remains the preparation/publication workspace. The old
  embedded published-history control is not rendered; the legacy JSX is still
  behind `false &&` in `StudentResultPage.js` and should be deleted, not
  re-enabled, when that file is next cleaned up.
- Published Results renders the actual stored `ReportCard` documents directly
  below its filters. It is intentionally not a table of links. A filtered set
  can be printed with `window.print()`; controls, filter summary and optional
  theme summaries use `cas-print-hide`, so the printed output is the official
  report cards only.
- Available filters are academic year, grade, section, exam, report format,
  and student name / roll number / result-title search. `Show assessed themes`
  is off by default. When enabled it displays the `snapshot.selectedThemes`
  saved at publication above each card; it never derives themes from the live
  curriculum, which could have changed after publication.
- The list API is still `/api/cas/reports`, but its GET handler now requires a
  `SCHOOL_ADMIN` and accepts `status`, `section`, `exam`, `format`, and
  `search` in addition to academic year and grade. `loadReports` always scopes
  by `actor.school`, applies search as an escaped regex against the stored
  snapshot, orders newest publication first and caps the response at 500.
  The Published Results page always requests `status=PUBLISHED`; no student or
  parent data path was changed.
- Read-only database diagnosis for the Grade 3 pilot: all 72 report documents
  still exist. For snapshot year `2083/84`, 18 are `PUBLISHED` and all are
  `CLASSIC`; 36 are `DRAFT` and `CLASSIC`. The older snapshot year `2026-27`
  has 17 `PUBLISHED` and one `DRAFT`, also all `CLASSIC`. A `MODERN` format
  filter therefore correctly returns no Grade 3 published cards. No database
  records were changed during this diagnosis.
- Validation recorded during this work: the CAS domain suite passes 66/66 and
  `npm run lint --workspace @pravyo/web` completes successfully after the
  presentation work. The protected Published Results URL was not separately
  rechecked in the authenticated browser in this pass; do not claim an
  end-to-end Published Results visual verification until that route is opened.

## Teacher exam assignment - audited 2026-11-02

Checked end to end from code; no app run or test run in this pass. The flow is
complete: school creates exam → assigns teacher per exam + grade + subject →
it shows on the teacher dashboard → that teacher enters marks and reassessments.

- `CasExamTeacherAssignment` (school, academicYear, exam, grade, subject,
  teacher) is the single source of truth. Two admin screens write it: Manage
  Exams (`/api/cas/exam-teachers`, `casTeacherAssignmentService`) and the
  teacher detail panel (`/api/teachers/[id]/exam-access`, current academic year
  only, and only for subjects the teacher teaches or was already granted).
  Saving replaces the scope; marks already entered are never deleted.
- Teacher dashboard "Exam mark entry" card lists exam · grade · subject and
  links to `/school/cas/assessment` (`/api/teacher/workspace`, active year only).
- Server enforcement: `assertTeacherExamAssignment` (exact exam+grade+subject)
  guards `loadThemes`, `loadStudentSheet` and `saveSheet`; reassessment goes
  through `saveSheet`, so the same guard covers it. `listExams` and
  `loadCurriculum` filter to the teacher's grants; the roster needs
  `assertTeacherGradeAssignment`. The legacy outcome sheet / `recordLevel` and
  student progress are admin-only. Teachers see only the Assessment CAS nav link.
- Test: `casSheet.integration.test.mjs` "permits an assigned teacher…" (assigned
  saves, unassigned gets 403). No teacher-reassessment-specific test.
- Known UX gaps (not security holes, not fixed yet): the Assessment Grade
  dropdown shows every school grade to a teacher (an unassigned grade shows the
  misleading "Create an exam…" warning); the Subject dropdown is not filtered by
  the selected exam (a subject granted only for another exam errors with 403);
  the Attendance/Extra Activities tabs still show for teachers.

## Current exam and curriculum workflow - 2026-09-27

This section is the current source of truth for CAS exam/theme assignment. It
supersedes older sections below that describe theme-level assessment status or
the "Mark for assessment" toggle.

- `CasExam` is global to a school and academic year. A new academic year gets
  new exam documents (the same title is allowed again); old years are retained.
- `CasThemeExam` is the sole assignment source, scoped by school, academic year,
  grade, subject, theme key and exam. Curriculum checkboxes write these records.
  Assessment lists only themes assigned to the selected active exam.
- Archived exams and their assignments remain readable for historical results.
  They cannot be selected for new assessments. Cumulative results include
  assigned themes through the selected exam; merged results use assignments
  across the selected academic year. Progress also keeps themes with saved
  marks visible if assignments are later adjusted.
- Do not add a second theme-level publish/status workflow. The old embedded
  `CasSubject.themes[].assessmentStatus` / `publishedAt` schema keys are kept
  only for backward-compatible preservation of existing stored values (no
  default for new themes); application services and UI do not read or write
  them. `setThemeAssessment` and `/api/cas/curriculum/theme/publish` are gone.
  No destructive migration is needed to ignore legacy values.
- The old toggle was already behind `false &&` in the checked-in component,
  while obsolete publish/status logic remained in services and copy. Therefore
  a clean render should show only the exam checkboxes. A toggle seen before a
  hard refresh indicates a stale Fast Refresh/client bundle (or a different
  served build), not a valid current UI path. Restart the dev server and hard
  reload if that old markup remains after source changes; verify the served
  checkout/port before changing the component again.
- Core files: `packages/cas/components/CurriculumThemeTable.js`,
  `apps/pravyo/app/school/cas/curriculum/page.js`,
  `packages/cas/lib/casExamService.js`, `packages/cas/lib/casSheetService.js`,
  `packages/cas/lib/casReportService.js`, `packages/db/models/cas/CasExam.js`,
  `packages/db/models/cas/CasThemeExam.js`, and `packages/db/models/cas/CasSubject.js`.
- Existing grade-specific exam data needs the separately prepared
  `scripts/migrate-cas-global-exams.mjs` consolidation migration. It groups only
  within school + academic year + normalized name, remaps references and keeps
  duplicate exam documents as aliases. Previous connection attempt stalled in
  read-only mode; migration has NOT been applied. Never report it as applied.
- No database writes were done for the UI cleanup. The verified same-checkout
  Next dev server on port 3000 was restarted; `/login` returns 200 and the
  curriculum route redirects to login without a school-admin browser session.
- Verification on 2026-09-27: `npm test` passes 66/66; curriculum Mongo
  integration tests pass 4/4 on the isolated loopback replica set; changed JSX
  parses. Production build is blocked by unavailable Google Fonts downloads
  (Cinzel, EB Garamond, Great Vibes); ESLint is blocked because
  `eslint-config-next` is missing from the installed dependencies. No claim of
  authenticated visual verification: the browser session reached the login
  screen only.

## CAS merged into Pravyo — 2026-09-23

This section supersedes every statement below about CAS being a second app.
There is now ONE Next.js app. `apps/cas` is gone; CAS is a feature of Pravyo.

Why: CAS never had its own identity — it reused Pravyo's accounts, database and
NextAuth secret. Keeping it as a separate deployment bought nothing and cost a
shared-cookie domain, a cross-origin redirect allow-list, a second login page
and duplicated report layouts that had already drifted apart. The boundary was
not real, so it was removed rather than worked around.

Layout:
- `packages/cas` (`@pravyo/cas`) — services (`lib/`), UI (`components/`), tests.
  Internal imports are RELATIVE and carry an explicit `.js`: webpack and the
  native `node --test` runner both resolve them, `@/` in a package would not.
- `apps/pravyo/app/school/cas/*` — thin route files. Next requires route files
  under `app/`; they hold no logic.
- `apps/pravyo/app/api/cas/*` — thin route handlers. `/api/cas-published`
  (parent/student read path) is unchanged and still separate.
- Screens moved from `localhost:3001/x` to `/school/cas/x`. Nav entry is
  "Continuous Assessment" in `SCHOOL_NAV_LINKS`.

Traps that will break this silently if forgotten:
- `apps/pravyo/app/globals.css` MUST keep `@source "../../../packages/cas"`.
  Tailwind infers its scan root from `.git`; when that inference misses, zero
  utilities are generated for the package and CAS renders unstyled with no
  error anywhere.
- Do NOT add `"type": "module"` to `packages/cas/package.json`. Node prints a
  MODULE_TYPELESS_PACKAGE_JSON warning asking for it; adding it breaks
  next-auth's CJS default import, and only in `next build`.
- `npm run dev` / `build` at the root now target `@pravyo/web`. `npm test`
  still targets `@pravyo/cas` (the domain suite); `npm run test:pravyo` is Jest.
- `packages/cas` is outside apps/pravyo's eslint base path, so `npx eslint`
  from the app does not cover it — same pre-existing gap as the other packages.

Adding a school sidebar link takes TWO edits, not one. `SCHOOL_NAV_LINKS` in
`components/navigation/appNavigation.js` defines the link, but
`SCHOOL_NAV_GROUPS` in `components/Sidebar.js` selects links into sections BY
NAME — an unlisted name was filtered out and rendered NOWHERE, with nothing
failing and nothing logged. The CAS link was invisible for exactly this reason
until 2026-09-23. `Sidebar.js` now routes unmatched links into a trailing
"More" group so a new link can never silently vanish again, but keep the two
name lists in sync anyway.

CAS is a FULL-SCREEN TAKEOVER, not a panel inside the Pravyo dashboard. The
school sidebar's "CAS" entry goes to `/school/cas`, and from there the Pravyo
chrome is gone entirely — `CasLayout` renders its own fixed sidebar and the
only way back is the "Back to Pravyo" link at the bottom of `CasSidebar`.
This works because there is NO `apps/pravyo/app/school/layout.js`: Pravyo's
chrome comes from each page importing `DashboardLayout` itself, so nothing
under `/school/cas` inherits it. If a `/school/layout.js` is ever added, CAS
will start rendering inside Pravyo's sidebar and this breaks — put CAS in a
route group outside it if that happens.

Report formats — ONE implementation, in `packages/cas/components/report`:
- `ReportCard.js` is the only place a stored format becomes a layout. Both the
  school's A4 print route and the guardian's portal render through it.
- `REPORT_FORMATS` is the single source for the dropdown labels AND the
  renderer, so they cannot disagree.
- **Format 1 `CLASSIC`** = blue-header continuous-assessment sheet.
  **Format 2 `MODERN`** = the school's own grade sheet (GRADE-SHEET table,
  Attendance, Extra Activities, Grading Scale, Remarks, four signatures).
- This INVERTS the earlier coding, where `CLASSIC` was the grade sheet. Rows
  published before 2026-09-23 store `format: 'CLASSIC'` and will now render as
  the blue-header layout. No data was migrated; confirm with the school before
  rewriting any stored `format`.
- The grading scale printed on the sheet is derived from `GRADE_BANDS` in
  `@pravyo/core/casGrading`, not retyped, so the key cannot drift from the
  arithmetic above it.
- `teacherComment` / `teacherCommentNe` removed from model, validation, service
  and the published projection. Reports generate automatically; there is no
  comment step. Existing documents keep the field; nothing reads it.

Publication is unchanged and already did what was wanted: a future publish date
keeps a report hidden in the parent portal until that day (`resolvePublishAt`,
Kathmandu midnight), guardians are only notified once the date arrives, and
`publishedAt` is the date the sheet prints. Guardians reach ALL their children
through Pravyo's existing `ChildSwitcher`; per `ParentAppContext`, §36 forbids
mixing school context between children, so results deliberately do not merge
siblings into one list.

Verification on 2026-09-23: 50 domain/validation tests pass, the production
build compiles with all 15 CAS API routes and 8 screens present, and app-level
lint is clean. `apps/cas` is fully deleted; `apps/` holds only `pravyo`.

A CSS bug that `next build` did NOT catch was found and fixed by running the
dev server: the Devanagari `@import url(...)` was placed after
`@import "tailwindcss"`, which expands in place into ~6300 rules, so the font
import landed at line 6336 of the generated CSS. Turbopack failed EVERY route
with "@import rules must precede all rules" — `/` and `/login` included —
while the webpack production build compiled clean. The font import now sits
as the first line of `globals.css`, above the Tailwind directive, and must
stay there. Never put a font `@import` in `cas.css`; it is inlined and fails
the same way. Always run `npm run dev` after touching CSS; a passing build
proves nothing about import ordering.

Runtime check on 2026-09-23 (dev server, unauthenticated): `/` and `/login`
200; `/school/cas`, `/school/cas/parent-report`, `/school/cas/assessment`,
`/school/cas/curriculum`, `/school/cas/progress`, `/school/cas/students` and
`/parent/learning/cas` all 307 to login; `/api/cas/context` 401. Tailwind
scanning of `packages/cas` confirmed working — `border-double` (used only in
ModernReport.js) and both arbitrary `grid-cols-[...]` classes are present in
the built CSS. Note Tailwind escapes arbitrary values, so grep the escaped
form (`0\.88fr`) or a plain class; a substring search for `0.88fr` returns
nothing and looks like a scanning failure when nothing is wrong.

Format 2 was rendered and visually compared against the school's supplied
marksheet on 2026-09-23, via a throwaway `/cas-preview` route screenshotted
with headless Edge (`msedge --headless=new --screenshot`), then deleted. It
matches. Two fixes came out of that comparison: the issue date must print as
numeric Bikram Sambat (`formatBsNumeric`, e.g. 2083/04/10) because an AD date
reads as the wrong year to the parent holding the sheet; and the title bar
prints `academicYear.label` alone, since the school titles it with the exam
("First Terminal Examination 2083"). Re-use that screenshot technique for any
future layout work — Edge is installed, no puppeteer/playwright in the repo.

Known honest gap in Format 2: the "TH Grade" and "INT. Grade" columns always
print "-". CAS records ONE achievement figure per subject and has no
theory/internal split, so there is nothing truthful to put there. Do not
invent values to fill them; either the school supplies that split or the
columns stay empty.

NOT done, and deliberately so:
- No SIGNED-IN check with REAL data. Routes respond correctly logged out and
  Format 2 was verified with fixture data, but no real report has been
  generated end to end. Sign in, open `/school/cas/parent-report`, generate a
  draft, then use the A4 button.
- Format 1 CLASSIC has never been visually checked and no reference for it was
  ever supplied; it is the inherited blue-header layout.
- No database was read or mutated. Reports published before this change store
  `format: 'CLASSIC'` and now render as the blue-header layout instead of the
  grade sheet they were published as. The user was offered the rewrite on
  2026-09-23 and DECLINED it, so published snapshots stay as stored. Do not
  rewrite them without asking again.

## Current student-book implementation — 2026-09-21

This section's architecture statements are superseded by the merge above; its
assessment and sheet behaviour still holds. The workspace
used apps/cas plus shared packages/db, auth, core and ui; it no longer uses
CasPlan. Assessment is Grade → Subject → Student, then a theme from that
student's book. AssessmentBook renders the supplied nine-column reference,
including grouped date/score headings, source working hours where verified,
totals, percentage, grade and blank signature lines. Dates are explicitly AD.

POST /api/cas/sheet takes academicYear, grade, subject, themeKey, student and
rows with revisions. Save is an atomic Mongo transaction. Regular attempts
are immutable; support results append; current notes use sheetRemarks. The
highest earned level is retained. Empty outcomes are excluded from percentage
and reported separately in coverage. Existing school-admin write/teacher-read
permissions remain. Published reports are locked, and changed existing draft
reports require regeneration before publication.

Client queries hide stale student/year/subject data immediately; page-local
drafts survive switching selections and save errors. The server returns the
canonical saved sheet before success is shown. No school data was mutated
while implementing/testing this change. Existing curriculum transcription is
partial; no extra textbook themes or invented outcomes were added.

Verification: 44 domain/validation tests and 10 real database integration
tests passed on an isolated loopback MongoDB replica set. Lint and production
build passed. Final browser visual verification was blocked by repeated
browser-extension timeouts; do not claim a visual check completed.

## Scope
User requests student results only, existing database reuse, minimum code and cleanup. Existing Pravyo checkout is `../schoolproject`. Original CAS folder was an unauthenticated HTTP/JSON demo with missing seed/database files.

Implemented Next.js 16 / React 19 with delivery (`app`) → domain (`lib`) → persistence (`models`). Three CAS collections instead of seven: CasPlan embeds periods, versioned outcomes and multi-teacher assignments; CasAssessment embeds historical membership and append-only attempts; CasReport stores draft/published snapshots. UI: Assessments, Results, school-only Setup.

## Database inspection — 2026-09-18, read-only
- 120 students, 120 parents, 120 guardian links, zero teachers, three User documents, two academic years and two school configs.
- Schools are SCHOOL_ADMIN User records, not a School collection. Teachers, students and parents have separate collections.
- Academic years: ACTIVE, 2026-27, canonical yearStart 2026, AD. `startedAt` is lifecycle metadata, not an authoritative school-year start date.
- Historical enrollments include school, grade, rollNumber, academicYearStart, academicYear, status, startedAt and endedAt. No section field.
- Populated student grades: 5–10; configured grades: 1–10. No CAS collections, outcomes, marks or assessment periods existed.
- Guardian access requires active ParentStudentLink with canViewPortfolio and matching school/student. Parent IDs are credentials; never log them.
- Student records alone cannot produce genuine results. School must supply verified outcomes and enter assessments.

## Invariants
- Shared NextAuth provider/session callbacks are synchronized from Pravyo; source hashes in integration/pravyo/manifest.json. No password code reimplemented or hashes copied. CAS uses host-scoped sessions with the existing credentials.
- CAS DB adapter omits Pravyo's development admin seed and automatic master-model indexing.
- Unique assessment and report keys include school/plan/student/period. Revision conflicts return 409. Every assessment/publication transaction writes the same plan to prevent stale snapshots.
- Accepted result never decreases; missing outcomes are excluded from achievement, counted in coverage. No rankings or letter grades.
- Publication requires all outcomes and at least one reassessment for regular level 1/2. Below-3 results remain valid honest results with follow-up indicated; no artificial passing requirement.
- Published snapshots/assessments are locked. Teacher consolidated access/publication requires corresponding access across every subject.
- Use actual school-confirmed academic-year/period dates, canonical AD inputs, Kathmandu day boundaries, existing AD/BS display.

## Cleanup
Removed old server.js, reset-data.js, start-mac-linux.sh, public/app.js, public/index.html, public/theme.css, unused demo-school logo and obsolete README. Kept source PDF, secrets and user tool configurations. No database records deleted/reset.
Added secret/build ignores; trimmed .env.example. Local origin changed to http://localhost:3001 without exposing secrets.

## Main Pravyo changes
Installer adds /api/cas-published, parent/student learning list/detail routes, published-report reader and lib/casPublished.js. Existing files modified: components/navigation/appNavigation.js and app/parent/page.js. Reads the same casreports, enforces published-only visibility and identity/relationship checks. Both checkouts need deployment; no deployment or actual notifications performed.

## Verification
15 result/access-policy tests passing, including exhaustive maximum-level sequences through six attempts, impossible/future dates, coverage, multiple teachers, tenancy and parent/student draft denial. Dependency installation initially hit ECONNRESET; lint/build/runtime verification ongoing (update before completion).

## Educational / operational decisions
School must confirm curriculum source and actual dates. No unverified publisher content activated. Current publication rule permits a below-3 result after required reassessment; ongoing intervention remains visible. Published corrections need a future explicit revision policy; snapshots cannot be overwritten. No sections until Pravyo provides historical section membership.

## Login investigation - 2026-09-27
- School sign-in uses shared NextAuth credentials in `packages/auth/authOptions.js`; user lookup depends on MongoDB being reachable.
- The initial DNS failure was from the restricted process context, not a bad Atlas hostname. A direct Atlas handshake succeeded when run with outbound access. The actual local blocker was the Next.js dev server started without MongoDB network access; server logs showed Mongo connection `ETIMEOUT`.
- Restarted the local dev server with outbound DB access. Verified read-only that the configured `SUPER_ADMIN` exists, is `APPROVED`, and the local configured password matches its stored hash. An end-to-end credentials callback issued a `SUPER_ADMIN` session and `/admin/dashboard` returned HTTP 200.
- Database connection failure returns a sanitized auth-service error. The login page distinguishes invalid credentials from service unavailability (`apps/pravyo/lib/authErrorMessage.js`); it also times out after 20 seconds to release a stuck form. Focused error-message tests pass.
- The local dev server is running at `http://localhost:3000` with DB access. If restarted in a network-restricted process, MongoDB auth will time out again. Never log or paste the URI/password into project notes or chat. If a real credential was exposed in IDE selection/screenshots, rotate it.

## Stale UI across refreshes - 2026-09-27
- CAS has a single `CasLayout`, `CasSidebar`, dashboard route and static `CAS_NAV_LINKS` source. The current source includes `Manage Exams`; there is no alternate old dashboard implementation to remove.
- Seeing that link absent before refresh but present afterward is evidence of client/server version skew (an already-open client bundle/router using an older deployment), not a conditional role or data path. Next.js 16's `deploymentId` provides version-skew detection, deployment cache-busting and a full navigation on mismatch.
- `apps/pravyo/next.config.mjs` now sets the ID from `NEXT_DEPLOYMENT_ID`, Vercel/release environment IDs, or a per-process development ID. Custom production hosting must provide a unique ID per release and share it across instances; documented in `apps/pravyo/README.md` and `.env.example`.
- A tab loaded before this safeguard may need one hard reload to receive the new ID; subsequent release mismatches reload automatically.
- Verified the running development HTML contains the deployment marker and authenticated CAS navigation shows exactly one Manage Exams link; soft navigation to Manage Exams and back to Dashboard succeeds.
