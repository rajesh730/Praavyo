import {
  ADMISSION_GENDERS,
  ADMISSION_LIMITS,
  GUARDIAN_RELATIONS,
  INQUIRY_LIMITS,
} from "./schoolInquiryLimits.js";

/**
 * The two forms people send a school — a general inquiry and an admission
 * application — defined once. The same definitions drive:
 *   - the Website API (`GET /forms`, `GET /admission`), so every school
 *     website builds the same fields instead of guessing them;
 *   - the Website API manual (lib/websiteApiGuide.js), which documents them
 *     field by field;
 *   - the server's limits (schoolInquiryLimits.js), so what a form allows is
 *     exactly what the server accepts.
 *
 * Field: { name, label, type: text|email|tel|date-text|select|textarea,
 *          required, minLength?, maxLength, options?, placeholder?, help? }
 * Client-safe: no server imports.
 */

/** Hidden anti-spam field: render it hidden, leave it empty. */
export const HONEYPOT_FIELD = "website";

const PHONE_HELP = "Digits only, 7 to 15 (e.g. 98XXXXXXXX or +977 …).";

export const GENERAL_INQUIRY_FIELDS = [
  { name: "name", label: "Your name", type: "text", required: true, minLength: 2, maxLength: INQUIRY_LIMITS.name, autocomplete: "name" },
  { name: "email", label: "Email", type: "email", required: true, maxLength: INQUIRY_LIMITS.email, autocomplete: "email" },
  { name: "phone", label: "Phone number", type: "tel", required: true, maxLength: INQUIRY_LIMITS.phone, placeholder: "98XXXXXXXX", help: PHONE_HELP, autocomplete: "tel" },
  { name: "subject", label: "Subject", type: "text", required: true, minLength: 3, maxLength: INQUIRY_LIMITS.subject },
  { name: "message", label: "Message", type: "textarea", required: true, minLength: 10, maxLength: INQUIRY_LIMITS.message },
];

export function admissionFields(grades = []) {
  return [
    { name: "studentName", label: "Student's full name", type: "text", required: true, minLength: 2, maxLength: ADMISSION_LIMITS.studentName },
    { name: "grade", label: "Applying for grade", type: "select", required: true, options: [...grades] },
    { name: "dateOfBirth", label: "Date of birth", type: "date-text", required: false, maxLength: ADMISSION_LIMITS.dateOfBirth, placeholder: "e.g. 2075-04-12 BS", help: "Free text: BS or AD." },
    { name: "gender", label: "Gender", type: "select", required: false, options: [...ADMISSION_GENDERS] },
    { name: "previousSchool", label: "Previous school", type: "text", required: false, maxLength: ADMISSION_LIMITS.previousSchool },
    { name: "guardianName", label: "Parent / guardian name", type: "text", required: true, minLength: 2, maxLength: INQUIRY_LIMITS.name, autocomplete: "name" },
    { name: "guardianRelation", label: "Relation to the student", type: "select", required: false, options: [...GUARDIAN_RELATIONS] },
    { name: "phone", label: "Phone number", type: "tel", required: true, maxLength: INQUIRY_LIMITS.phone, placeholder: "98XXXXXXXX", help: PHONE_HELP, autocomplete: "tel" },
    { name: "email", label: "Email", type: "email", required: false, maxLength: INQUIRY_LIMITS.email, autocomplete: "email" },
    { name: "address", label: "Address", type: "text", required: false, maxLength: ADMISSION_LIMITS.address, autocomplete: "street-address" },
    { name: "message", label: "Anything else we should know", type: "textarea", required: false, maxLength: INQUIRY_LIMITS.message },
  ];
}

/** What an applicant is told about the season (also returned by the API). */
export function admissionNotice(season = {}) {
  if (season.isOpen) {
    return season.academicYear
      ? `Admissions are open for ${season.academicYear}.`
      : "Admissions are open.";
  }
  return "Admissions are closed for this year. You can still apply — your application will be considered for next year's admission.";
}

/**
 * The admission form for a season: while open, the grades taking
 * applications; while closed, every grade the school runs (for next year).
 */
export function admissionForm(season = {}, schoolGrades = []) {
  const grades = season.isOpen ? season.grades || schoolGrades : schoolGrades;
  return {
    type: "ADMISSION",
    submitTo: "POST /inquiries",
    status: season.isOpen ? "OPEN" : "CLOSED",
    acceptingFor: season.isOpen ? "THIS_YEAR" : "NEXT_YEAR",
    notice: admissionNotice(season),
    fields: admissionFields(grades),
    honeypot: { name: HONEYPOT_FIELD, note: "Render hidden and leave empty; filled = treated as spam." },
  };
}

export function generalInquiryForm() {
  return {
    type: "GENERAL",
    submitTo: "POST /inquiries",
    fields: GENERAL_INQUIRY_FIELDS.map((field) => ({ ...field })),
    honeypot: { name: HONEYPOT_FIELD, note: "Render hidden and leave empty; filled = treated as spam." },
  };
}
