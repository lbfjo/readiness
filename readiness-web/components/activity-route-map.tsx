import { decodePolyline, projectToSvgPath } from "@/lib/strava-polyline";

/**
 * Decorative route preview from Strava `map.summary_polyline`. No external
 * tiles — just the encoded path scaled into a fixed viewBox.
 */
export function ActivityRouteMap({ polyline }: { polyline: string }) {
  let path = "";
  try {
    const coords = decodePolyline(polyline);
    if (coords.length < 2) return null;
    path = projectToSvgPath(coords, 320, 140, 6);
  } catch {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <svg
        viewBox="0 0 320 140"
        className="h-36 w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Activity route map"
      >
        <defs>
          <linearGradient id="route-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="url(#route-glow)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
