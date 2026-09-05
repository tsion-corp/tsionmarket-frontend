import type { BoardTotalOption } from "../presenter";

interface GoalsLineSelectProps {
  fixtureName: string;
  options: BoardTotalOption[];
  value: string | null;
  onChange: (marketId: string) => void;
}

function lineLabel(line: number): string {
  return line.toFixed(2).replace(/\.?0+$/, "");
}

export function GoalsLineSelect({ fixtureName, options, value, onChange }: GoalsLineSelectProps) {
  if (options.length === 0) {
    return (
      <span className="flex h-11 items-center justify-center rounded-[7px] border border-white/5 bg-white/[0.025] text-[12px] text-white/25">
        -
      </span>
    );
  }

  const hasAlternatives = options.length > 1;
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <label className="relative block h-11">
      <span className="sr-only">Goals line for {fixtureName}</span>
      <select
        aria-label={`Goals line for ${fixtureName}`}
        value={selected.id}
        disabled={!hasAlternatives}
        onChange={(event) => onChange(event.target.value)}
        className={`peer absolute inset-0 z-10 h-full w-full opacity-0 outline-none ${
          hasAlternatives ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {lineLabel(option.line)}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className={`flex h-11 items-center justify-center rounded-[7px] border border-white/9 bg-[#18181c] text-[12px] font-extrabold text-[#d7d7dc] tabular-nums transition-colors peer-focus-visible:border-white/35 ${
          hasAlternatives ? "pr-3 peer-hover:border-white/20 peer-hover:bg-[#202024]" : ""
        }`}
      >
        {lineLabel(selected.line)}
      </span>
      {hasAlternatives ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="pointer-events-none absolute top-1/2 right-1 z-20 size-3 -translate-y-1/2 text-white/45"
        >
          <path
            d="m2.25 4.25 3.75 3.5 3.75-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </label>
  );
}
