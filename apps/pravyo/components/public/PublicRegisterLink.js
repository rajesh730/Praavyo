"use client";

import Link from "next/link";
import clsx from "clsx";

const SIZE_CLASSES = {
  sm: "h-9 px-4 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-11 px-5 text-sm",
};

export default function PublicRegisterLink({
  children = "Register",
  className = "",
  href = "/register",
  size = "sm",
  onClick,
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center rounded-control bg-brand font-semibold text-white transition-colors hover:bg-brand-strong",
        SIZE_CLASSES[size] || SIZE_CLASSES.sm,
        className
      )}
    >
      {children}
    </Link>
  );
}
