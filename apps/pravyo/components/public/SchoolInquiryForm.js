"use client";

import { useState } from "react";
import { CircleCheck, Mail, MessageSquareText, Phone, Send, User } from "lucide-react";
import { INQUIRY_LIMITS } from "@/lib/schoolInquiryLimits";

const EMPTY = { name: "", email: "", phone: "", subject: "", message: "", website: "" };

/**
 * "Send an inquiry" on a school's public profile — for anyone, signed in or
 * not. What is sent goes only to that school (Dashboard → Inquiries); the
 * visitor's email and phone are never shown publicly.
 */
export default function SchoolInquiryForm({ schoolId, schoolName }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ sending: false, error: "", sent: false });
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setState({ sending: true, error: "", sent: false });
    try {
      const res = await fetch(`/api/public/schools/${schoolId}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Your inquiry could not be sent. Please try again.");
      setForm(EMPTY);
      setState({ sending: false, error: "", sent: true });
    } catch (error) {
      setState({ sending: false, error: error.message, sent: false });
    }
  }

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-success-line bg-success-soft p-6 text-center" role="status">
        <CircleCheck className="h-10 w-10 text-success" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-ink">Inquiry sent</p>
          <p className="mt-1 max-w-md text-sm text-body">
            {schoolName} has received your message and will reply to the email or phone number you gave.
          </p>
        </div>
        <button type="button" onClick={() => setState({ sending: false, error: "", sent: false })} className="btn btn-secondary btn-sm">
          Send another inquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate={false}>
      <Field id="inquiry-name" label="Your name" icon={User}>
        <input id="inquiry-name" type="text" value={form.name} onChange={set("name")} required minLength={2} maxLength={INQUIRY_LIMITS.name} autoComplete="name" placeholder="Full name" className="input w-full pl-9" />
      </Field>
      <Field id="inquiry-email" label="Email" icon={Mail}>
        <input id="inquiry-email" type="email" value={form.email} onChange={set("email")} required maxLength={INQUIRY_LIMITS.email} autoComplete="email" placeholder="you@gmail.com" className="input w-full pl-9" />
      </Field>
      <Field id="inquiry-phone" label="Phone number" icon={Phone}>
        <input id="inquiry-phone" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} required pattern="[+\d\s()\-]{7,20}" maxLength={INQUIRY_LIMITS.phone} autoComplete="tel" placeholder="98XXXXXXXX" className="input w-full pl-9" />
      </Field>
      <Field id="inquiry-subject" label="Subject" icon={MessageSquareText}>
        <input id="inquiry-subject" type="text" value={form.subject} onChange={set("subject")} required minLength={3} maxLength={INQUIRY_LIMITS.subject} placeholder="e.g. Admission for Grade 3" className="input w-full pl-9" />
      </Field>
      <div className="sm:col-span-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="inquiry-message" className="label">Message</label>
          <span className="text-2xs text-subtle tabular-nums">{form.message.length}/{INQUIRY_LIMITS.message}</span>
        </div>
        <textarea id="inquiry-message" rows={5} value={form.message} onChange={set("message")} required minLength={10} maxLength={INQUIRY_LIMITS.message} placeholder={`What would you like to ask ${schoolName}?`} className="input w-full" />
      </div>

      {/* Hidden from people; bots that fill it are ignored by the server. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="inquiry-website">Website</label>
        <input id="inquiry-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-control border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Only {schoolName} sees your email and phone number.</p>
        <button type="submit" disabled={state.sending} className="btn btn-primary">
          <Send aria-hidden /> {state.sending ? "Sending…" : "Send inquiry"}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, icon: Icon, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        {children}
      </div>
    </div>
  );
}
