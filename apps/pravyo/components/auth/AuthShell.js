import Link from "next/link";
import PravyoLogo from "@/components/brand/PravyoLogo";

const DEFAULT_LINKS = [
  { href: "/events", label: "Events" },
  { href: "/schools", label: "Schools" },
];

export function AuthTopBar({ links = DEFAULT_LINKS }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:opacity-80"
      >
        <span aria-hidden="true">←</span> Back to home
      </Link>
      <div className="flex flex-wrap gap-2 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              link.highlight
                ? "btn btn-soft btn-sm inline-flex items-center font-semibold transition-colors"
                : "btn btn-secondary btn-sm inline-flex items-center font-semibold transition-colors"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function AuthCard({ title, description, children, footer }) {
  return (
    <div className="card w-full max-w-md rounded-card p-6">
      <div className="mb-4 text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-control bg-brand-soft">
          <PravyoLogo variant="icon" compact priority />
        </div>
        {title && (
          <h1 className="text-2xl text-ink">{title}</h1>
        )}
        {description && (
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {children}
      {footer && <div className="mt-4 border-t border-line pt-5">{footer}</div>}
    </div>
  );
}

export default function AuthShell({ links, title, description, children, footer }) {
  return (
    <div className="">
      <AuthTopBar links={links} />
      <div className="flex items-center justify-center px-0 pb-12 sm:px-4">
        <AuthCard title={title} description={description} footer={footer}>
          {children}
        </AuthCard>
      </div>
    </div>
  );
}

export function AuthSessionPanel({ role, name, email }) {
  return (
    <div className="rounded-card border border-line bg-brand-soft p-4 text-left">
      <p className="eyebrow">Current account</p>
      <p className="mt-2 text-sm font-semibold text-ink">
        {role || "Signed-in account"}
      </p>
      {name && <p className="mt-1 text-sm text-muted">{name}</p>}
      {email && <p className="mt-1 text-xs text-muted">{email}</p>}
    </div>
  );
}
