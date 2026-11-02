"use client";

import Link from "next/link";
import { Users as FaUserFriends, GraduationCap as FaUserGraduate, Presentation as FaChalkboardTeacher, School as FaSchool, ChevronRight } from "lucide-react";

/**
 * "Who is signing in?" — the first thing anyone sees at /login.
 *
 * Before this, a parent arriving at the login page was shown an email and
 * password form that would never work for them: guardians sign in with a Parent
 * ID and a PIN, on a completely different route. They had no way to discover
 * that, and no reason to guess it.
 *
 * Large tiles rather than a dropdown or a tab strip. The audience
 * includes guardians with low digital confidence, so the choice has to be
 * obvious at a glance, thumb-sized, and labelled in plain words — never
 * "authentication method".
 */

const ROLES = [
  {
    href: "/parent/login",
    icon: FaUserFriends,
    emoji: "👨‍👩‍👧",
    title: "Parent",
    titleNe: "अभिभावक",
    description: "See your child's school life",
    hint: "Use your Parent Card, or type your Parent ID",
    tone: "",
  },
  {
    href: "/student/login",
    icon: FaUserGraduate,
    emoji: "🎓",
    title: "Student",
    titleNe: "विद्यार्थी",
    description: "Your writing, events and journey",
    hint: "Use the username your school gave you",
    tone: "",
  },
  {
    href: "/login?as=teacher",
    icon: FaChalkboardTeacher,
    emoji: "🧑‍🏫",
    title: "Teacher",
    titleNe: "शिक्षक",
    description: "Your classes, students and marks",
    hint: "Username or email and password, or a photo of your login card",
    tone: "",
  },
  {
    href: "/login?as=school",
    icon: FaSchool,
    emoji: "🏫",
    title: "School",
    titleNe: "विद्यालय",
    description: "School administrators",
    hint: "Use the school's email address and password",
    tone: "",
  },
];

export default function RoleChooser() {
  return (
    <div className="space-y-2.5">
      <p className="text-center text-sm font-medium text-muted">
        Who is signing in? / कस्ले साइन इन गर्दै हुनुहुन्छ?
      </p>

      {ROLES.map((role) => {
        const Icon = role.icon;
        return (
          <Link
            key={role.href}
            href={role.href}
            className={`group flex items-center gap-3.5 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-brand-line hover:bg-brand-soft/40 ${role.tone}`}
          >
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand-soft text-xl text-brand">
              <Icon />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-base font-semibold text-ink">{role.title}</span>
                <span className="cas-ne text-sm text-muted">{role.titleNe}</span>
              </span>
              <span className="block text-sm text-body">{role.description}</span>
              {/* Says what they will actually be asked for, so nobody arrives
                  at a form expecting different credentials. */}
              <span className="mt-0.5 block text-xs text-muted">{role.hint}</span>
            </span>

            <ChevronRight aria-hidden="true" className="shrink-0 text-lg text-subtle transition-colors group-hover:text-brand" />
          </Link>
        );
      })}
    </div>
  );
}
