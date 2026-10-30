import clsx from "clsx";
import Spinner from "@/components/ui/Spinner";

// Visual variants map onto the design-system button classes in globals.css.
const VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  outline: "btn-secondary",
};

const SIZES = {
  sm: "btn-sm",
  md: "",
  lg: "h-11 px-5 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  fullWidth = false,
  type = "button",
  disabled = false,
  loading = false,
  asChild = false,
  ...props
}) {
  const Component = asChild ? "span" : "button";
  const isDisabled = disabled || loading;

  return (
    <Component
      type={asChild ? undefined : type}
      className={clsx(
        "btn",
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth && "w-full",
        
        className
      )}
      disabled={isDisabled && !asChild}
      aria-disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </Component>
  );
}

export function ButtonLink({
  children,
  variant = "primary",
  size = "md",
  className = "",
  fullWidth = false,
  href,
  disabled = false,
  ...props
}) {
  return (
    <a
      href={href || "#"}
      className={clsx(
        "btn",
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth && "w-full",
        
        className
      )}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      {...props}
    >
      {children}
    </a>
  );
}
