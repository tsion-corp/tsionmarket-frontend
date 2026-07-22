interface ProgressBarProps {
  pct: number;
  color?: string;
}

export function ProgressBar({ pct, color = "#A78BFA" }: ProgressBarProps) {
  return (
    <div className="h-[7px] overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
