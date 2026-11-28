// Field limits for school inquiries, shared by the public forms (browser) and
// the server's validation (lib/schoolInquiries.js). Kept apart so the forms
// do not pull the validation library into the public page's bundle.
export const INQUIRY_LIMITS = {
  name: 80,
  email: 160,
  phone: 20,
  subject: 150,
  message: 2000,
};

// Admission applications (the student's details).
export const ADMISSION_LIMITS = {
  studentName: 80,
  dateOfBirth: 30,
  previousSchool: 150,
  guardianRelation: 40,
  address: 200,
};

export const ADMISSION_GENDERS = ["Male", "Female", "Other"];
export const GUARDIAN_RELATIONS = ["Father", "Mother", "Guardian", "Other"];
