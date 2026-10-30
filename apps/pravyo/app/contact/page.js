import Link from "next/link";
import InfoPageShell, {
  InfoSection,
  SUPPORT_EMAIL,
} from "@/components/public/InfoPageShell";

export const metadata = {
  title: "Contact",
  description: "How to reach the Praavyo team.",
};

export default function ContactPage() {
  return (
    <InfoPageShell
      eyebrow="Support"
      title="Contact Us"
      intro="Whether you are a school interested in joining, a parent with a question, or a user who found a problem — we want to hear from you."
    >
      <InfoSection title="Email us">
        <p>
          The fastest way to reach us is email:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-brand-strong hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>We usually reply within 1-2 business days.</p>
      </InfoSection>

      <InfoSection title="Schools: join Praavyo">
        <p>
          Want your school on Praavyo? Register your school and our team will
          review and approve your account — you&apos;ll get an email as soon as
          it is ready.
        </p>
        <p>
          <Link
            href="/register"
            className="btn btn-primary inline-flex items-center gap-2 transition-colors"
          >
            Register your school
          </Link>
        </p>
      </InfoSection>

      <InfoSection title="Already using Praavyo?">
        <ul>
          <li>
            <strong>Schools and students:</strong> use the Feedback section in
            your dashboard — it goes straight to our team.
          </li>
          <li>
            <strong>Forgot your password?</strong> Students should contact
            their school. School admins can email us for a reset.
          </li>
          <li>
            <strong>Parents or guardians:</strong> for questions about your
            child&apos;s information, contact the school first, or email us
            directly.
          </li>
        </ul>
      </InfoSection>
    </InfoPageShell>
  );
}
