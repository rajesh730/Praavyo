# IEMIS identity

Nepal's government (IEMIS) issues one number per school and one per student.
Since 2026-11-17 Praavyo treats those numbers as the identity that stays the
same everywhere: on every screen, on report cards, when a student moves school,
and for any future link with the government system.

Database ids (`_id`) still join records internally. **IEMIS is the number
people use, and the number we use when we need to say who a student or school
is.**

## The rules

| | Student IEMIS | School IEMIS |
| --- | --- | --- |
| Stored on | `Student.iemisNumber` | `SchoolConfig.iemisNumber` |
| Required | Yes, at registration (single, bulk, CSV) | Yes, at school registration |
| Unique | Across the whole platform | Across all schools |
| Changes on transfer | **Never**: it follows the student | n/a |
| Format | Letters, digits, hyphens; up to 50; spaces removed, upper case, leading zeroes kept |

Uniqueness is checked by the app (`lib/iemisRegistry.js`) when a number is
saved. There is no unique database index, because soft-deleted students keep
their number and a re-registered student must be able to reuse it.

## Where it is used

- **Student sign-in:** IEMIS number + password (`packages/auth/authOptions.js`,
  `findStudentForLogin`). The old username still works as a temporary
  fallback. Every student starts with `password@123` and changes it at
  `/student/account`.
- **Parent ↔ child links:** `ParentStudentLink.studentIemisNumber` copies the
  child's IEMIS. A pre-save hook fills it on every new link, whichever code
  path creates it. `syncStudentIemisOnLinks` updates the copy when a school
  corrects a student's number (the student edit route calls it). Access is
  still decided by the `student` id, never by this copy.
- **Transfers:** `StudentTransfer` keeps `studentIemisNumber`,
  `fromSchoolIemisNumber` and `toSchoolIemisNumber`, filled by a pre-save hook
  as a permanent record of who moved from where to where. Schools see and
  search transfers by student IEMIS; families can find the new school by its
  IEMIS.
- **Guardian roster:** shows and searches by the child's IEMIS, and includes it
  in the CSV export.
- **Report cards** (CAS Classic, Modern, internal exam) print both numbers.

## Code map

| File | What |
| --- | --- |
| `packages/db/iemisFormat.js` | Format rules only (no database), so they are safe in browser code. Re-exported as `@/lib/iemis`. |
| `packages/db/iemis.js` | Lookups: `findActiveStudentsByIemis`, `findSchoolIdByIemis`, `studentIemisNumber`, `schoolIemisNumber`, `schoolIemisMap`, `syncStudentIemisOnLinks`. |
| `apps/pravyo/lib/iemisRegistry.js` | "Is this number free?" checks used when saving a student or school. |
| `packages/db/models/ParentStudentLink.js` | `studentIemisNumber` + hook. |
| `apps/pravyo/models/StudentTransfer.js` | Three IEMIS copies + hook. |
| `apps/pravyo/scripts/backfill-iemis-identity.mjs` | Fills the copies on records made before these fields existed. Preview by default; `--apply` to write. |

## Changing it later

- Use the helpers above; don't write new IEMIS cleanup or lookup code.
- A new record that refers to a student or school by id should also keep its
  IEMIS copy when it is history (like a transfer) or when people search by it.
- To make IEMIS the only way students sign in, delete the username fallback in
  `findStudentForLogin` and update the hint on `/student/login`.
- Scripts that load models must connect with `{ autoIndex: false }` (the app
  does), or Mongoose builds indexes on the live database.
