import { cn } from "@/lib/utils";

/**
 * Readiness brand mark: a stylized "R" with a lightning-bolt crossbar.
 * Pure SVG so it stays sharp at any size and doesn't need an image asset.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-label="Readiness"
      role="img"
    >
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        d="M22 18 L36 18 C42 18 46 22 46 28 C46 33 43 36 39 37 L48 48 L40 48 L32 38 L28 38 L28 48 L22 48 Z M28 24 L28 32 L35 32 C37 32 39 30 39 28 C39 26 37 24 35 24 Z"
        fill="currentColor"
      />
      <path
        d="M12 30 L22 30 L18 38 L26 38 L14 54 L18 42 L10 42 Z"
        fill="currentColor"
        opacity="0.95"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[15px] font-bold uppercase tracking-[0.22em] text-white",
        className,
      )}
    >
      Readiness
    </span>
  );
}
