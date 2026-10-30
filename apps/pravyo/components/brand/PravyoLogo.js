import Image from "next/image";
import clsx from "clsx";
import pravyoLogo from "@/logo/pravyo logo by name.png";

export default function PravyoLogo({
  compact = false,
  iconOnly = false,
  variant,
  withSurface = false,
  className = "",
  imageClassName = "",
  textClassName = "",
  subtitle = "",
  priority = false,
}) {
  const resolvedVariant = variant || (iconOnly ? "icon" : "wordmark");
  const includesName = resolvedVariant === "wordmark" || resolvedVariant === "lockup";
  const assets = {
    icon: {
      src: pravyoLogo,
      alt: "Praavyo icon",
      width: compact ? 40 : 52,
      height: compact ? 40 : 52,
    },
    wordmark: {
      src: pravyoLogo,
      alt: "Praavyo",
      width: compact ? 34 : 44,
      height: compact ? 34 : 44,
    },
    lockup: {
      src: pravyoLogo,
      alt: "Praavyo logo",
      width: compact ? 44 : 56,
      height: compact ? 44 : 56,
    },
  };

  const asset = assets[resolvedVariant] || assets.wordmark;
  const shouldShowSubtitle = Boolean(subtitle);

  return (
    <span className={clsx("inline-flex flex-col gap-2", className)}>
      <span
        className={clsx(
          "inline-flex w-fit items-center gap-2.5 justify-center",
          withSurface &&
            (resolvedVariant === "icon"
              ? "rounded-card bg-surface p-2 shadow-pop"
              : "rounded-card bg-surface px-4 py-3 shadow-pop")
        )}
      >
        <Image
          src={asset.src}
          alt={asset.alt}
          width={asset.width}
          height={asset.height}
          className={clsx("h-auto w-auto", imageClassName, textClassName)}
          priority={priority}
        />
        {includesName ? (
          <span
            className={clsx(
              "whitespace-nowrap font-semibold text-ink",
              compact ? "text-lg" : "text-2xl",
              textClassName
            )}
          >
            Praavyo
          </span>
        ) : null}
      </span>
      {shouldShowSubtitle ? (
        <span
          className={clsx(
            "pl-1 text-2xs font-semibold uppercase tracking-wide text-muted",
            textClassName
          )}
        >
          {subtitle}
        </span>
      ) : null}
    </span>
  );
}
