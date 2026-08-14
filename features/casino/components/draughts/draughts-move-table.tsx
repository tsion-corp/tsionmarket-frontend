"use client";

interface MoveMark {
  symbol: string;
  tone: "good" | "bad" | "neutral";
}

export function DraughtsMoveTable({
  moves,
  activePly = moves.length,
  marks = {},
  onSelect,
}: {
  moves: readonly string[];
  activePly?: number;
  marks?: Record<number, MoveMark>;
  onSelect?: (ply: number) => void;
}) {
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, index) => ({
    turn: index + 1,
    white: moves[index * 2] ?? null,
    black: moves[index * 2 + 1] ?? null,
  }));

  if (!rows.length) {
    return (
      <div className="flex min-h-28 flex-1 items-center justify-center border-b border-white/10 px-5 text-center text-[13px] text-white/38">
        Make the first move.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-b border-white/10">
      {rows.map((row) => (
        <div key={row.turn} className="grid min-h-10 grid-cols-[44px_1fr_1fr] text-[14px]">
          <div className="flex items-center justify-center bg-white/[0.025] font-mono text-[12px] text-white/28">
            {row.turn}
          </div>
          <MoveCell
            move={row.white}
            ply={row.turn * 2 - 1}
            active={activePly === row.turn * 2 - 1}
            mark={marks[row.turn * 2 - 1]}
            onSelect={onSelect}
          />
          <MoveCell
            move={row.black}
            ply={row.turn * 2}
            active={activePly === row.turn * 2}
            mark={marks[row.turn * 2]}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}

function MoveCell({
  move,
  ply,
  active,
  mark,
  onSelect,
}: {
  move: string | null;
  ply: number;
  active: boolean;
  mark?: MoveMark;
  onSelect?: (ply: number) => void;
}) {
  return (
    <button
      type="button"
      disabled={!move}
      onClick={() => move && onSelect?.(ply)}
      className={`flex min-w-0 items-center justify-between gap-2 px-3 text-left font-sans transition-colors ${
        active ? "bg-sky-400/16 text-white" : "text-white/70 hover:bg-white/[0.05]"
      } disabled:cursor-default disabled:hover:bg-transparent`}
    >
      <span className="truncate font-medium">{move ?? "…"}</span>
      {mark ? (
        <span
          className={
            mark.tone === "good"
              ? "text-emerald-400"
              : mark.tone === "bad"
                ? "text-red-400"
                : "text-white/45"
          }
        >
          {mark.symbol}
        </span>
      ) : null}
    </button>
  );
}

export function DraughtsReplayControls({
  activePly,
  totalPlies,
  onSelect,
}: {
  activePly: number;
  totalPlies: number;
  onSelect: (ply: number) => void;
}) {
  const controls = [
    { label: "First position", symbol: "|‹", ply: 0 },
    { label: "Previous move", symbol: "‹", ply: Math.max(0, activePly - 1) },
    { label: "Next move", symbol: "›", ply: Math.min(totalPlies, activePly + 1) },
    { label: "Last position", symbol: "›|", ply: totalPlies },
  ];

  return (
    <div className="grid h-12 grid-cols-4 border-t border-white/10 bg-white/[0.02]">
      {controls.map((control) => (
        <button
          key={control.label}
          type="button"
          aria-label={control.label}
          onClick={() => onSelect(control.ply)}
          className="cursor-pointer text-[22px] text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          {control.symbol}
        </button>
      ))}
    </div>
  );
}
