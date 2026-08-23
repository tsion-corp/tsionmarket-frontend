import type { ChessRatingChartPoint } from "@/features/casino/lib/api/types";

const WIDTH = 300;
const HEIGHT = 96;
const PADDING = 7;

function linePath(points: ChessRatingChartPoint[]): string {
  if (points.length === 0) return "";
  const ratings = points.map((point) => point.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 1);
  return points
    .map((point, index) => {
      const x =
        points.length === 1
          ? WIDTH / 2
          : PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - ((point.rating - min) / span) * (HEIGHT - PADDING * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function RatingSparkline({ points }: { points: ChessRatingChartPoint[] }) {
  const path = linePath(points);
  const first = points.at(0)?.rating;
  const last = points.at(-1)?.rating;
  const rising = first !== undefined && last !== undefined && last >= first;

  if (!path) {
    return (
      <div className="grid h-24 place-items-center border-y border-white/[0.055] text-[11px] text-white/28">
        Play a rated game to start your chart.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-24 w-full overflow-visible"
      role="img"
      aria-label={`30 day rating trend from ${first} to ${last}`}
      preserveAspectRatio="none"
    >
      <path d="M0 24H300M0 48H300M0 72H300" stroke="rgba(255,255,255,0.055)" />
      <path
        d={path}
        fill="none"
        stroke={rising ? "#c7cdd1" : "#a9afb3"}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point, index) => {
        if (index !== points.length - 1) return null;
        const ratings = points.map((item) => item.rating);
        const min = Math.min(...ratings);
        const max = Math.max(...ratings);
        const span = Math.max(max - min, 1);
        const x =
          points.length === 1
            ? WIDTH / 2
            : PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
        const y = HEIGHT - PADDING - ((point.rating - min) / span) * (HEIGHT - PADDING * 2);
        return (
          <circle
            key={`${point.at}:${point.rating}`}
            cx={x}
            cy={y}
            r="3.5"
            fill="#e7eaec"
            stroke="#2d3338"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
