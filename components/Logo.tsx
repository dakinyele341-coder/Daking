import { cn } from "@/lib/utils";

/**
 * Skribbl mark: a little whiteboard with two hand-drawn squiggles — the lower
 * one in the marker accent. Uses `currentColor` for the board/ink squiggle so
 * it adapts to its context (paper or chalkboard).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("h-7 w-7", className)}
    >
      <rect
        x="3"
        y="5"
        width="26"
        height="22"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M8 13c2-2.5 4-2.5 6 0s4 2.5 6 0"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 19c2.5 3 5.5 3 8 0"
        stroke="#E8745C"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Logo + wordmark, for nav bars and headers. */
export function Brand({
  className,
  logoClassName,
  textClassName,
}: {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Logo className={logoClassName} />
      <span className={cn("font-display text-2xl font-bold tracking-tight", textClassName)}>
        Skribbl
      </span>
    </span>
  );
}
