# Pravyo monorepo

Two Next.js apps, one database, one login.

```
apps/
  pravyo/     the existing Pravyo school platform      -> pravyo.com
  cas/        Continuous Assessment System             -> cas.pravyo.com
packages/
  db/         the MongoDB connection and every model
  auth/       NextAuth configuration and auth helpers
  core/       shared domain logic (levels, dates, notifications)
  ui/         shared Pravyo UI primitives
```

The two apps deploy separately but are not two systems. They open the same
database through `packages/db`, authenticate through the same `packages/auth`
configuration, and share one design system — so a school signs in once, and
signing out of either signs it out of both.

## Why the packages exist

`User`, `Student`, `Teacher`, `AcademicYear` and the other shared models are
defined **once**, in `packages/db/models`. The file that remains at
`apps/pravyo/models/User.js` is a two-line re-export, so ~900 existing
`@/models/User` imports keep working while the schema cannot drift into two
versions. The same applies to `lib/authOptions.js` and `lib/db.js`.

`apps/pravyo/lib/db.js` is the one deliberate exception: it wraps the shared
connection to add super-admin seeding, which belongs to that app alone. CAS must
never create an account.

## Running

```bash
npm install          # once, at the root — workspaces link everything
npm run dev          # CAS on :3001
npm run dev:pravyo   # Pravyo on :3000
npm run build        # CAS production build
npm run build:pravyo # Pravyo production build
npm test             # CAS domain tests
```

Do not run `next dev` directly — a stale global Next on PATH will hijack it.

Both apps read `.env.local` from their own directory. `MONGODB_URI` and
`NEXTAUTH_SECRET` must be identical in both, or the shared session breaks.

## Student assessment book

Open **Assessment**, choose **Grade → Subject → Student**, and select the book
theme. The form uses the supplied table's grouped date/score columns, learning
outcomes, assessment areas, tools, remarks and signature/footer layout. Known
Grade 3 theme working hours come from the source PDF.

Fill dated levels (1–4) and press **Send to school database**. The whole page
saves atomically, including partially completed pages. Blank outcomes are
excluded from percentage calculations; coverage is shown separately. Saved
regular assessments remain fixed; further support assessments append to the
record. Each student, subject and academic year keeps separate results.

School administrators can save; teachers retain the existing read-only access.
Published reports lock assessment entry. No marks are sent to guardians by
this button; publication remains the existing separate report action.

`npm test` runs the domain tests. To also run the isolated database integration
tests in PowerShell, point `CAS_TEST_MONGOD` at an installed MongoDB executable:

```powershell
$env:CAS_TEST_MONGOD = 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe'
npm test
```

The test harness launches a temporary loopback replica set and never loads the
school database URI. The supplied curriculum files currently contain selected
transcribed themes; this change does not claim a complete transcription of the
entire book.

## Collections

Four collections, all prefixed `cas`:

| Collection             | Holds                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `cassubjects`          | A subject a grade is assessed on                               |
| `caslearningoutcomes`  | What students should be able to do, in English and Nepali      |
| `casassessments`       | One student, one outcome: initial level plus any reassessments |
| `casreports`           | The published report a guardian reads                          |

Scoped to **grade and academic year** — there is no class, section or assessment
period, because Pravyo enrolment records carry only a grade and a year.

### The rules that matter

- Levels are **1–4**, never letter grades or a mark out of four. The words come
  from the Grade 3 evaluation record: 1 कमजोर / Below Basic, 2 सामान्य / Basic,
  3 राम्रो / Proficient, 4 उच्च / Advanced.
- An initial level **below 3** flags the outcome for reassessment.
- Attempts are **append-only**. The accepted level is the highest reached, so a
  reassessment can raise a student's result but never lower it.
- An outcome **not yet assessed is excluded** from achievement, not scored zero.
  How much has been assessed is reported separately as coverage.
- Publishing freezes a **snapshot**. Later assessments do not change what a
  guardian has already read.

## Seeding curriculum

```bash
npm run seed:curriculum -- data/curriculum/grade-3.json --school <schoolId> --dry-run
```

Idempotent and additive: subjects and outcomes match on code, so re-running
updates wording rather than duplicating, and nothing is ever deleted. Find the
school id with `npm run db:inspect`.
