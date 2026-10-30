import Image from "next/image";
import clsx from "clsx";
import pravyoLogo from "../../assets/pravyo-logo.png";

export default function PravyoLogo({
  compact = false,
  iconOnly = false,
  variant,
  withSurface = false,
  className = "",
  imageClassName = "",
  textClassName = "",
  subtitle = "",
}) {
  const resolvedVariant = variant || (iconOnly ? "icon" : "wordmark");
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
      width: compact ? 126 : 220,
      height: compact ? 34 : 60,
    },
    lockup: {
      src: pravyoLogo,
      alt: "Praavyo logo",
      width: compact ? 152 : 260,
      height: compact ? 152 : 260,
    },
  };

  const asset = assets[resolvedVariant] || assets.wordmark;
  const shouldShowSubtitle = Boolean(subtitle);

  return (
    <span className={clsx("inline-flex flex-col gap-2", className)}>
      <span
        className={clsx(
          "inline-flex w-fit items-center justify-center",
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
          priority
        />
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
