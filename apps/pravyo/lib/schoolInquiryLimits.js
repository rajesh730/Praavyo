// Field limits for school inquiries, shared by the public form (browser) and
// the server's validation (lib/schoolInquiries.js). Kept apart so the form
// does not pull the validation library into the public page's bundle.
export const INQUIRY_LIMITS = {
  name: 80,
  email: 160,
  phone: 20,
  subject: 150,
  message: 2000,
};
