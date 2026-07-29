interface SparklineProps {
  line: string;
  color?: string;
  height?: number;
  viewHeight?: number;
  id: string;
}

export function Sparkline({
  line,
  color = "#d4d4d8",
  height = 150,
  viewHeight = 150,
  id,
}: SparklineProps) {
  const area = `${line} L600 ${viewHeight} L0 ${viewHeight} Z`;
  return (
    <div className="relative overflow-hidden rounded-[14px]" style={{ height }}>
      <svg width="100%" height="100%" viewBox={`0 0 600 ${viewHeight}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" />
      </svg>
    </div>
  );
}

export const BALANCE_LINE =
  "M0 110 C60 100 90 60 150 70 C210 80 240 40 300 55 C360 70 400 20 460 35 C520 50 560 25 600 15";
export const DETAIL_LINE =
  "M0 88 C60 80 90 48 150 56 C210 64 240 30 300 44 C360 58 400 16 460 28 C520 40 560 20 600 12";
