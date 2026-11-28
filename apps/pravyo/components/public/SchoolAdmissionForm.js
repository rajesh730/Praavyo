"use client";

import { useState } from "react";
import { CircleCheck, GraduationCap, Send } from "lucide-react";
import {
  ADMISSION_GENDERS,
  ADMISSION_LIMITS,
  GUARDIAN_RELATIONS,
  INQUIRY_LIMITS,
} from "@/lib/schoolInquiryLimits";

const EMPTY = {
  studentName: "",
  grade: "",
  dateOfBirth: "",
  gender: "",
  previousSchool: "",
  guardianName: "",
  guardianRelation: "",
  phone: "",
  email: "",
  address: "",
  message: "",
  website: "",
};

/**
 * The admission form on a school's public profile, shown only while the
 * school's admission season is open (Settings → Admission). Applications go
 * to that school's Inquiries → Admission, marked "Through Praavyo"; the
 * family's phone and email are never shown publicly.
 */
export default function SchoolAdmissionForm({ schoolId, schoolName, grades = [], closed = false }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ sending: false, error: "", sent: false, nextYear: false });
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setState({ sending: true, error: "", sent: false });
    try {
      const res = await fetch(`/api/public/schools/${schoolId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: "ADMISSION" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Your application could not be sent. Please try again.");
      setForm(EMPTY);
      setState({ sending: false, error: "", sent: true, nextYear: Boolean(data.data?.forNextYear) });
    } catch (error) {
      setState({ sending: false, error: error.message, sent: false, nextYear: false });
    }
  }

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-success-line bg-success-soft p-6 text-center" role="status">
        <CircleCheck className="h-10 w-10 text-success" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-ink">
            {state.nextYear ? "Application received for next year" : "Application received"}
          </p>
          <p className="mt-1 max-w-md text-sm text-body">
            {state.nextYear
              ? `Admissions are closed for this year, so ${schoolName} will consider your application for next year's admission and contact you on the phone number you gave.`
              : `${schoolName} has received your admission application and will contact you on the phone number you gave.`}
          </p>
        </div>
        <button type="button" onClick={() => setState({ sending: false, error: "", sent: false, nextYear: false })} className="btn btn-secondary btn-sm">
          Apply for another student
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink sm:col-span-2">
        <GraduationCap aria-hidden /> Student
      </p>
      <Field id="adm-student" label="Student's full name" required>
        <input id="adm-student" value={form.studentName} onChange={set("studentName")} required minLength={2} maxLength={ADMISSION_LIMITS.studentName} className="input w-full" />
      </Field>
      <Field id="adm-grade" label="Applying for grade" required>
        <select id="adm-grade" value={form.grade} onChange={set("grade")} required className="input w-full">
          <option value="">Choose a grade</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>{grade}</option>
          ))}
        </select>
      </Field>
      <Field id="adm-dob" label="Date of birth">
        <input id="adm-dob" value={form.dateOfBirth} onChange={set("dateOfBirth")} maxLength={ADMISSION_LIMITS.dateOfBirth} placeholder="e.g. 2075-04-12 BS" className="input w-full" />
      </Field>
      <Field id="adm-gender" label="Gender">
        <select id="adm-gender" value={form.gender} onChange={set("gender")} className="input w-full">
          <option value="">Choose</option>
          {ADMISSION_GENDERS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field id="adm-previous" label="Previous school">
          <input id="adm-previous" value={form.previousSchool} onChange={set("previousSchool")} maxLength={ADMISSION_LIMITS.previousSchool} className="input w-full" />
        </Field>
      </div>

      <p className="mt-2 text-sm font-semibold text-ink sm:col-span-2">Parent or guardian</p>
      <Field id="adm-guardian" label="Full name" required>
        <input id="adm-guardian" value={form.guardianName} onChange={set("guardianName")} required minLength={2} maxLength={INQUIRY_LIMITS.name} autoComplete="name" className="input w-full" />
      </Field>
      <Field id="adm-relation" label="Relation to the student">
        <select id="adm-relation" value={form.guardianRelation} onChange={set("guardianRelation")} className="input w-full">
          <option value="">Choose</option>
          {GUARDIAN_RELATIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </Field>
      <Field id="adm-phone" label="Phone number" required>
        <input id="adm-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} required pattern="[+\d\s()\-]{7,20}" maxLength={INQUIRY_LIMITS.phone} autoComplete="tel" placeholder="98XXXXXXXX" className="input w-full" />
      </Field>
      <Field id="adm-email" label="Email">
        <input id="adm-email" type="email" value={form.email} onChange={set("email")} maxLength={INQUIRY_LIMITS.email} autoComplete="email" className="input w-full" />
      </Field>
      <div className="sm:col-span-2">
        <Field id="adm-address" label="Address">
          <input id="adm-address" value={form.address} onChange={set("address")} maxLength={ADMISSION_LIMITS.address} autoComplete="street-address" className="input w-full" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="adm-message" label="Anything else we should know">
          <textarea id="adm-message" rows={3} value={form.message} onChange={set("message")} maxLength={INQUIRY_LIMITS.message} className="input w-full" />
        </Field>
      </div>

      {/* Hidden from people; bots that fill it are ignored by the server. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="adm-website">Website</label>
        <input id="adm-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-control border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Only {schoolName} sees your phone number and email.</p>
        <button type="submit" disabled={state.sending} className="btn btn-primary">
          <Send aria-hidden /> {state.sending ? "Sending…" : closed ? "Apply for next year" : "Send application"}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, required = false, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}
