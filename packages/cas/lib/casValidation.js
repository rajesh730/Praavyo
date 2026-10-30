import { z } from 'zod';
import { ECA_FIELDS } from '@pravyo/core/casSupplementary';
import {
  CAS_EXAM_TERM_VALUES,
  DEFAULT_CAS_EXAM_TERM,
  normalizeExamTitle,
} from '@pravyo/core/casExamTerms';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';

/**
 * Request shapes, following the Zod conventions already used across Pravyo:
 * `.strict()` so an unexpected field is an error rather than silently ignored,
 * and bounded strings so nothing unbounded reaches the database.
 *
 * Note what is absent: no schema accepts a `school`. School identity comes from
 * the session, and a request may not name it.
 */

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid record identifier');

const grade = z.string().trim().min(1).max(60);
const section = z.string().trim().max(60).optional();
const reportFormat = z.enum(['CLASSIC', 'MODERN']).default('CLASSIC');
const examTerm = z.enum(CAS_EXAM_TERM_VALUES).default(DEFAULT_CAS_EXAM_TERM);
const examTitle = z.string().trim().max(120).optional();
const examId = objectId.optional();
const resultMode = z.enum(['EXAM', 'MERGED']).default('EXAM');
const includePrevious = z.boolean().default(false);
const themeAssignmentIds = z.array(objectId).min(1).max(600).optional();
const code = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Codes may use letters, numbers, dash and underscore');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
/** A Bikram Sambat date as the school writes it: 2083/06/08. */
const bsDay = z
  .string()
  .trim()
  .regex(/^\d{4}\/\d{1,2}\/\d{1,2}$/, 'Write the issue date in B.S. as YYYY/MM/DD, e.g. 2083/06/08')
  .refine((value) => Boolean(parseBsNumeric(value)), 'Enter a real B.S. issue date');
const themeKey = z.string().trim().min(1).max(401);
const themeTitleEn = z.string().trim().max(200);
const themeTitleNe = z.string().trim().max(200);
const nullableHours = z.union([z.number().min(0).max(500), z.null()]).default(null);
// Several areas or tools, one per line; line N of the English field pairs with
// line N of the Nepali one, so lines are trimmed one by one, never dropped.
const bookList = z
  .string()
  .max(2100)
  .transform((value) => {
    const lines = value.replace(/\r/g, '').split('\n').map((line) => line.trim());
    return lines.some(Boolean) ? lines.join('\n').replace(/\n+$/, '') : '';
  });
const assessmentAspect = bookList;
const assessmentTool = bookList;
const nullableDayCount = z.union([z.number().int().min(0).max(400), z.null()]).default(null);
const activityGrade = z.string().trim().max(20).default('');
// Null leaves a subject out of the GPA rather than weighting it as zero.
const creditHours = z.union([z.number().min(0).max(40), z.null()]);
const examName = z.string().trim().min(2).max(120);
const reportTitleInput = z.string().trim().max(120);

export const examCreateInput = z.object({
  academicYear: objectId,
  name: examName,
  reportTitle: reportTitleInput.optional(),
  // The date printed on this exam's report cards; nothing else supplies one.
  issueDate: bsDay,
}).strict();

export const examUpdateInput = z.object({
  exam: objectId,
  academicYear: objectId,
  name: examName,
  reportTitle: reportTitleInput.optional(),
  issueDate: bsDay.optional(),
}).strict();

// How a subject is used — the register is shared by daily teaching and CAS.
const subjectUsage = {
  taught: z.boolean().optional(),
  examined: z.boolean().optional(),
  kind: z.enum(['COMPULSORY', 'OPTIONAL']).optional(),
  optionalGroup: z.string().trim().max(60).optional(),
  sections: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
};

export const subjectInput = z
  .object({
    grade,
    code,
    titleEn: z.string().trim().min(1).max(120),
    titleNe: z.string().trim().max(120).default(''),
    creditHours: creditHours.default(null),
    ...subjectUsage,
  })
  .strict();

export const subjectUpdateInput = z
  .object({
    subject: objectId,
    titleEn: z.string().trim().min(1).max(120).optional(),
    titleNe: z.string().trim().max(120).optional(),
    creditHours: creditHours.optional(),
    sequence: z.number().int().min(1).max(999).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
    ...subjectUsage,
  })
  .strict();

export const themeInput = z
  .object({
    subject: objectId,
    titleEn: themeTitleEn.default(''),
    titleNe: themeTitleNe.default(''),
    workingHours: nullableHours,
  })
  .strict()
  .refine((theme) => theme.titleEn || theme.titleNe, {
    message: 'Give the theme a name in English or Nepali',
    path: ['titleEn'],
  });

export const themeUpdateInput = z
  .object({
    subject: objectId,
    themeKey,
    titleEn: themeTitleEn.optional(),
    titleNe: themeTitleNe.optional(),
    workingHours: nullableHours.optional(),
    sequence: z.number().int().min(1).max(999).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .strict()
  .superRefine((theme, ctx) => {
    if (
      (Object.hasOwn(theme, 'titleEn') || Object.hasOwn(theme, 'titleNe')) &&
      !theme.titleEn &&
      !theme.titleNe
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['titleEn'],
        message: 'Give the theme a name in English or Nepali',
      });
    }
  });

export const themeDeleteInput = z.object({ subject: objectId, themeKey }).strict();

/**
 * A whole theme as edited on the Curriculum screen: its name, hours and every
 * row in book order. A row with an `id` already exists; one without is new;
 * an existing row left out is being removed.
 */
const themeBookRow = z
  .object({
    id: objectId.optional(),
    titleEn: z.string().trim().max(1000).default(''),
    titleNe: z.string().trim().max(1000).default(''),
    assessmentAspect: assessmentAspect.default(''),
    assessmentAspectNe: assessmentAspect.default(''),
    assessmentTool: assessmentTool.default(''),
    assessmentToolNe: assessmentTool.default(''),
  })
  .strict();

export const themeBookInput = z
  .object({
    subject: objectId,
    themeKey,
    titleEn: themeTitleEn.default(''),
    titleNe: themeTitleNe.default(''),
    workingHours: nullableHours,
    rows: z.array(themeBookRow).max(300),
  })
  .strict()
  .superRefine((book, ctx) => {
    if (!book.titleEn && !book.titleNe) {
      ctx.addIssue({ code: 'custom', path: ['titleEn'], message: 'Give the theme a name in English or Nepali' });
    }
    book.rows.forEach((row, index) => {
      if (!row.titleEn && !row.titleNe) {
        ctx.addIssue({
          code: 'custom',
          path: [],
          message: `Row ${index + 1} needs a learning outcome in English or Nepali`,
        });
      }
    });
    const ids = book.rows.map((row) => row.id?.toLowerCase()).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: [], message: 'A row appears twice. Reload before saving.' });
    }
  });

export const outcomeInput = z
  .object({
    subject: objectId,
    code: code.optional(),
    themeKey: themeKey.optional(),
    themeEn: themeTitleEn.default(''),
    themeNe: themeTitleNe.default(''),
    titleEn: z.string().trim().max(1000).default(''),
    titleNe: z.string().trim().max(1000).default(''),
    assessmentAspect: assessmentAspect.default(''),
    assessmentAspectNe: assessmentAspect.default(''),
    assessmentTool: assessmentTool.default(''),
    assessmentToolNe: assessmentTool.default(''),
  })
  .strict()
  .refine((o) => o.titleEn || o.titleNe, {
    message: 'Give the learning outcome a description in English or Nepali',
    path: ['titleEn'],
  });

export const outcomeUpdateInput = z
  .object({
    outcome: objectId,
    themeKey: themeKey.optional(),
    themeEn: themeTitleEn.optional(),
    themeNe: themeTitleNe.optional(),
    titleEn: z.string().trim().max(1000).optional(),
    titleNe: z.string().trim().max(1000).optional(),
    assessmentAspect: assessmentAspect.optional(),
    assessmentAspectNe: assessmentAspect.optional(),
    assessmentTool: assessmentTool.optional(),
    assessmentToolNe: assessmentTool.optional(),
    sequence: z.number().int().min(1).max(999).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .strict();

export const deleteInput = z.object({ id: objectId }).strict();

export const attemptInput = z
  .object({
    academicYear: objectId,
    student: objectId,
    outcome: objectId,
    level: z.number().int().min(1).max(4),
    // Optional so the Assessment screen can record a level with one tap; the
    // server fills in today's date in the school's timezone.
    assessmentDate: day.optional(),
    remarksEn: z.string().trim().max(1000).default(''),
    remarksNe: z.string().trim().max(1000).default(''),
    // The revision the client last saw, so a second teacher cannot silently
    // overwrite a colleague's entry.
    revision: z.number().int().min(0),
  })
  .strict();

/**
 * A whole theme sheet for one student — the book page, submitted in one go.
 *
 * Levels are nullable so a half-filled page is a legal submission: a teacher
 * assesses what they got through today and comes back to the rest.
 */
export const sheetInput = z
  .object({
    academicYear: objectId,
    exam: objectId,
    grade,
    subject: objectId,
    themeKey,
    student: objectId,
    rows: z
      .array(
        z
          .object({
            outcome: objectId,
            revision: z.number().int().min(0),
            regularLevel: z.union([z.number().int().min(1).max(4), z.null()]).default(null),
            regularDate: z.union([day, z.literal('')]).default(''),
            remedialLevel: z.union([z.number().int().min(1).max(4), z.null()]).default(null),
            remedialDate: z.union([day, z.literal('')]).default(''),
            remarks: z.string().trim().max(1000).default(''),
          })
          .strict()
          .superRefine((row, ctx) => {
            for (const prefix of ['regular', 'remedial']) {
              if (row[`${prefix}Level`] !== null && !row[`${prefix}Date`]) {
                ctx.addIssue({ code: 'custom', path: [`${prefix}Date`], message: 'Enter the assessment date for this mark' });
              }
              if (row[`${prefix}Level`] === null && row[`${prefix}Date`]) {
                ctx.addIssue({ code: 'custom', path: [`${prefix}Level`], message: 'Choose a mark for this assessment date' });
              }
            }
            if (row.remedialLevel !== null && row.regularLevel === null) {
              ctx.addIssue({ code: 'custom', path: ['regularLevel'], message: 'Record the regular assessment before extra support' });
            }
            if (row.remarks && row.regularLevel === null) {
              ctx.addIssue({ code: 'custom', path: ['regularLevel'], message: 'Record the regular assessment before saving remarks' });
            }
          }),
      )
      .min(1)
      .max(60),
  })
  .strict()
  .refine((data) => new Set(data.rows.map((row) => row.outcome.toLowerCase())).size === data.rows.length, {
    message: 'Each learning outcome may appear only once on a sheet',
    path: ['rows'],
  });

export const themesQuery = z.object({ grade, subject: objectId }).strict();

export const sheetQuery = themesQuery.extend({
  academicYear: objectId,
  exam: objectId,
  student: objectId,
  themeKey,
}).strict();

export const studentProgressQuery = themesQuery.extend({
  academicYear: objectId,
  student: objectId,
}).strict();

const reportBaseInput = z
  .object({
    academicYear: objectId,
    grade,
    section,
    students: z.array(objectId).min(1).max(300),
    format: reportFormat,
    examTerm,
    examId,
    resultMode,
    includePrevious,
    themeAssignmentIds,
    examTitle,
  })
  .strict();

function validateResultScope(data, context) {
  if (data.themeAssignmentIds && (!data.examId || data.resultMode === 'MERGED')) {
    context.addIssue({
      code: 'custom',
      path: ['themeAssignmentIds'],
      message: 'Choose one exam before selecting themes for its result.',
    });
  }
  if (data.includePrevious && (!data.examId || data.resultMode === 'MERGED')) {
    context.addIssue({
      code: 'custom',
      path: ['includePrevious'],
      message: 'Choose one exam before including previous assessments.',
    });
  }
  if (data.includePrevious && data.themeAssignmentIds) {
    context.addIssue({
      code: 'custom',
      path: ['includePrevious'],
      message: 'Choose either specific themes or the legacy cumulative option, not both.',
    });
  }
}

export const reportInput = reportBaseInput
  .superRefine(validateResultScope)
  .transform((data) => ({
    ...data,
    examTitle: normalizeExamTitle(data.examTerm, data.examTitle),
  }));

export const gradeResultsQuery = z.object({ academicYear: objectId, grade, examTerm, examId, resultMode, includePrevious, themeAssignmentIds }).strict().superRefine(validateResultScope);

/** Report cards for a grade: every student, or just the ones asked for. */
export const reportCardsQuery = z
  .object({
    academicYear: objectId,
    grade,
    section,
    format: reportFormat,
    examTerm,
    examId,
    resultMode,
    includePrevious,
    themeAssignmentIds,
    examTitle,
    students: z.array(objectId).max(300).optional(),
  })
  .strict()
  .superRefine(validateResultScope)
  .transform((data) => ({
    ...data,
    examTitle: normalizeExamTitle(data.examTerm, data.examTitle),
  }));

/** Take a grade's published results back from parents and students. */
export const gradeUnpublishInput = z
  .object({
    academicYear: objectId,
    grade,
    section,
    examTerm,
    examId,
    resultMode,
    includePrevious,
    themeAssignmentIds,
    students: z.array(objectId).min(1).max(300),
  })
  .strict()
  .superRefine(validateResultScope);

/** Snapshot and publish a grade's results in one step. */
export const gradePublishInput = reportBaseInput
  .strict()
  .superRefine(validateResultScope)
  .transform((data) => ({
    ...data,
    examTitle: normalizeExamTitle(data.examTerm, data.examTitle),
  }));

export const publishInput = z
  .object({
    reports: z.array(objectId).min(1).max(300),
    publishDate: day.optional(),
  })
  .strict();

const attendanceInput = z
  .object({
    workingDays: nullableDayCount,
    presentDays: nullableDayCount,
    absentDays: nullableDayCount.optional(),
  })
  .strict()
  .superRefine((attendance, ctx) => {
    if (
      attendance.workingDays != null &&
      attendance.presentDays != null &&
      attendance.presentDays > attendance.workingDays
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['presentDays'],
        message: 'Present days cannot be greater than working days',
      });
    }
  });

const extraActivitiesInput = z
  .object(Object.fromEntries(ECA_FIELDS.map((field) => [field.key, activityGrade])))
  .strict();

export const studentRecordQuery = z
  .object({
    academicYear: objectId,
    grade,
    student: objectId,
  })
  .strict();

export const studentRecordInput = studentRecordQuery
  .extend({
    revision: z.number().int().min(0),
    attendance: attendanceInput.default({}),
    extraActivities: extraActivitiesInput.default({}),
  })
  .strict();

export const studentRecordsQuery = z
  .object({
    academicYear: objectId,
    grade,
    section: z.string().trim().max(60).optional(),
    // Omitted for the whole-year (merged) result.
    exam: objectId.optional(),
  })
  .strict();

const studentRecordRowInput = z
  .object({
    student: objectId,
    revision: z.number().int().min(0),
    attendance: attendanceInput.default({}),
    extraActivities: extraActivitiesInput.default({}),
  })
  .strict();

export const studentRecordsInput = studentRecordsQuery
  .extend({
    rows: z.array(studentRecordRowInput).min(1).max(300),
  })
  .strict()
  .refine(
    (data) =>
      new Set(data.rows.map((row) => row.student.toLowerCase())).size === data.rows.length,
    {
      message: 'Each student may appear only once',
      path: ['rows'],
    },
  );

/** Turn a Zod failure into one readable sentence for the UI. */
export function firstIssue(error) {
  const issue = error?.issues?.[0];
  if (!issue) return 'The submitted data was not valid';
  const path = issue.path?.filter((p) => typeof p === 'string').join(' ');
  return path ? `${issue.message} (${path})` : issue.message;
}

