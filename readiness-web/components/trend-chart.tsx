import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/contracts/trends";

export type ChartPoint = { date: string; value: number | null };

type LineChartProps = {
  data: ChartPoint[];
  height?: number;
  width?: number;
  color?: string;
  fill?: string;
  yMin?: number;
  yMax?: number;
  gridLines?: number[];
  axisLabels?: boolean;
  className?: string;
};

/**
 * Hand-rolled SVG line chart. Pure server-rendered (no client JS) — we
 * intentionally avoid Recharts to keep the bundle small and lean into the
 * hand-crafted aesthetic. Missing points ({ value: null }) break the line
 * rather than interpolate so sync gaps are visible.
 */
export function LineChart({
  data,
  height = 220,
  width = 960,
  color = "var(--color-accent)",
  fill = "color-mix(in srgb, var(--color-accent) 22%, transparent)",
  yMin,
  yMax,
  gridLines,
  axisLabels = true,
  className,
}: LineChartProps) {
  const padLeft = axisLabels ? 36 : 4;
  const padRight = 8;
  const padTop = 12;
  const padBottom = axisLabels ? 24 : 4;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const hasData = values.length > 0;
  const dataMin = hasData ? Math.min(...values) : 0;
  const dataMax = hasData ? Math.max(...values) : 1;
  const min = yMin ?? (hasData ? Math.floor(dataMin - 2) : 0);
  const max = yMax ?? (hasData ? Math.ceil(dataMax + 2) : 100);
  const span = Math.max(1, max - min);

  const xFor = (i: number) =>
    data.length === 1 ? padLeft + plotW / 2 : padLeft + (i * plotW) / (data.length - 1);
  const yFor = (v: number) => padTop + plotH - ((v - min) / span) * plotH;

  // Build piecewise path segments so nulls produce gaps.
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  for (const p of data) {
    if (p.value === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push(p);
    }
  }
  if (current.length > 0) segments.push(current);

  const segmentPath = (seg: ChartPoint[]) =>
    seg
      .map((p, idx) => {
        const i = data.indexOf(p);
        return `${idx === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(p.value as number).toFixed(2)}`;
      })
      .join(" ");

  const areaPath = (seg: ChartPoint[]) => {
    if (seg.length < 2) return null;
    const startIdx = data.indexOf(seg[0]);
    const endIdx = data.indexOf(seg[seg.length - 1]);
    const baseline = padTop + plotH;
    const line = segmentPath(seg);
    return `${line} L ${xFor(endIdx).toFixed(2)} ${baseline} L ${xFor(startIdx).toFixed(2)} ${baseline} Z`;
  };

  const grid = gridLines ?? defaultGridLines(min, max);

  // Label every Nth date on the x-axis so the labels don't overlap.
  const labelStride = Math.max(1, Math.ceil(data.length / 6));
  const xLabels = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % labelStride === 0 || i === data.length - 1);

  const gradientId =
    data.length === 0
      ? "lc-grad-empty"
      : `lc-grad-${data[0]?.date ?? "x"}-${data[data.length - 1]?.date ?? "y"}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal gridlines + y labels */}
      {grid.map((v) => (
        <g key={`grid-${v}`}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="var(--color-border)"
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.35}
          />
          {axisLabels ? (
            <text
              x={padLeft - 6}
              y={yFor(v) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-subtle)"
              fontFamily="var(--font-display, inherit)"
              style={{ letterSpacing: "0.08em" }}
            >
              {v}
            </text>
          ) : null}
        </g>
      ))}

      {/* Filled area */}
      {fill
        ? segments.map((seg, idx) => {
            const d = areaPath(seg);
            if (!d) return null;
            return (
              <path
                key={`area-${idx}`}
                d={d}
                fill={`url(#${gradientId})`}
                opacity={0.9}
              />
            );
          })
        : null}

      {/* Line */}
      {segments.map((seg, idx) => (
        <path
          key={`line-${idx}`}
          d={segmentPath(seg)}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* End-point dot on the latest value */}
      {hasData
        ? (() => {
            const lastWithValue = [...data].reverse().find((p) => p.value !== null);
            if (!lastWithValue) return null;
            const i = data.indexOf(lastWithValue);
            return (
              <circle
                cx={xFor(i)}
                cy={yFor(lastWithValue.value as number)}
                r={3.5}
                fill={color}
                stroke="var(--color-surface)"
                strokeWidth={1.5}
              />
            );
          })()
        : null}

      {/* X-axis labels */}
      {axisLabels
        ? xLabels.map(({ d, i }) => (
            <text
              key={`x-${d.date}`}
              x={xFor(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-subtle)"
              fontFamily="var(--font-display, inherit)"
              style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}
            >
              {formatShortDate(d.date)}
            </text>
          ))
        : null}
    </svg>
  );
}

function defaultGridLines(min: number, max: number): number[] {
  const span = max - min;
  const steps = span <= 20 ? 4 : 5;
  const step = span / steps;
  const out: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(Math.round((min + step * i) * 10) / 10);
  }
  return out;
}

/**
 * Tiny sparkline (e.g. for metric cards). No axis, no gridlines — just the
 * shape of the trend.
 */
export function Sparkline({
  data,
  color = "var(--color-accent)",
  height = 44,
  width = 160,
  yMin,
  yMax,
  className,
}: {
  data: ChartPoint[];
  color?: string;
  height?: number;
  width?: number;
  yMin?: number;
  yMax?: number;
  className?: string;
}) {
  return (
    <LineChart
      data={data}
      color={color}
      fill={`color-mix(in srgb, ${color} 18%, transparent)`}
      height={height}
      width={width}
      yMin={yMin}
      yMax={yMax}
      axisLabels={false}
      gridLines={[]}
      className={className}
    />
  );
}
