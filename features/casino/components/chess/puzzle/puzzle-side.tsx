import Image from "next/image";
import type { ChessPuzzle, ChessPuzzleCatalog } from "@/features/casino/lib/api/types";
import {
  PUZZLE_DIFFICULTIES,
  PUZZLE_THEMES,
  primaryPuzzleTheme,
  puzzleThemeArtwork,
  puzzleThemeLabel,
} from "@/features/casino/lib/chess/puzzle";

interface PuzzleSideProps {
  puzzle: ChessPuzzle;
  catalog: ChessPuzzleCatalog | undefined;
  targetRating: number;
  theme: string;
  autoNext: boolean;
  disabled: boolean;
  onTargetRating: (rating: number) => void;
  onTheme: (theme: string) => void;
  onAutoNext: (enabled: boolean) => void;
}

const panel =
  "rounded-[7px] border border-white/[0.07] bg-[#262522] shadow-[0_8px_24px_rgba(0,0,0,0.18)]";

export function PuzzleSide({
  puzzle,
  catalog,
  targetRating,
  theme,
  autoNext,
  disabled,
  onTargetRating,
  onTheme,
  onAutoNext,
}: PuzzleSideProps) {
  const primaryTheme = primaryPuzzleTheme(puzzle);

  return (
    <aside className="order-3 grid content-start gap-3 lg:col-span-2 lg:grid-cols-3 xl:order-1 xl:col-span-1 xl:grid-cols-1">
      <section className={`${panel} p-4`}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
          <Image
            src={puzzleThemeArtwork(puzzle)}
            alt=""
            width={58}
            height={58}
            className="size-[58px] shrink-0 opacity-80 grayscale"
          />
          <div className="min-w-0 text-[12px] leading-5 text-white/48">
            <p>
              Puzzle <strong className="font-semibold text-white/78">#{puzzle.id}</strong>
            </p>
            <p>
              Rating <strong className="font-semibold text-white/78">{puzzle.rating}</strong>
            </p>
            <p>Played {new Intl.NumberFormat().format(puzzle.playCount)} times</p>
          </div>
        </div>
        <div className="pt-4">
          <p className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase">Theme</p>
          <p className="mt-1 text-[14px] font-semibold text-white/78">
            {puzzleThemeLabel(primaryTheme)}
          </p>
          {puzzle.openingTags.length ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/38">
              {puzzle.openingTags.join(" · ")}
            </p>
          ) : null}
          <a
            href={puzzle.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-[11px] font-semibold text-[#7faed0] hover:text-[#9ac6e5]"
          >
            View source game
          </a>
        </div>
      </section>

      <section className={`${panel} p-4`}>
        <div className="flex items-center justify-between gap-4 text-[12px] font-semibold text-white/72">
          Server checked
          <span className="grid size-5 place-items-center rounded-full bg-[#354225] text-[11px] text-[#b7cf89]">
            ✓
          </span>
        </div>
        <div className="mt-4 text-center">
          <p className="text-[9px] font-bold tracking-[0.12em] text-white/28 uppercase">
            Target rating
          </p>
          <strong className="mt-1 block text-[36px] leading-none font-semibold text-white/78 tabular-nums">
            {targetRating}
          </strong>
        </div>
      </section>

      <section className={`${panel} p-4`}>
        <label className="flex items-center justify-between gap-4 text-[12px] font-semibold text-white/68">
          Jump to next puzzle
          <input
            type="checkbox"
            checked={autoNext}
            disabled={disabled}
            onChange={(event) => onAutoNext(event.target.checked)}
            className="size-4 accent-[#8aa15d]"
          />
        </label>

        <label className="mt-5 block text-[10px] font-bold tracking-[0.11em] text-white/30 uppercase">
          Difficulty level
          <select
            value={targetRating}
            disabled={disabled}
            onChange={(event) => onTargetRating(Number(event.target.value))}
            className="mt-2 h-9 w-full rounded-[5px] border border-white/[0.09] bg-[#171715] px-2.5 text-[12px] font-semibold text-white/68 outline-none focus:border-white/25"
          >
            {PUZZLE_DIFFICULTIES.map((item) => (
              <option key={item.rating} value={item.rating}>
                {item.label} {item.delta ? `(${item.delta})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-[10px] font-bold tracking-[0.11em] text-white/30 uppercase">
          Puzzle theme
          <select
            value={theme}
            disabled={disabled}
            onChange={(event) => onTheme(event.target.value)}
            className="mt-2 h-9 w-full rounded-[5px] border border-white/[0.09] bg-[#171715] px-2.5 text-[12px] font-semibold text-white/68 outline-none focus:border-white/25"
          >
            {PUZZLE_THEMES.map((item) => (
              <option key={item.value || "mix"} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {catalog ? (
          <p className="mt-5 border-t border-white/[0.07] pt-4 text-[10px] leading-4 text-white/28">
            {new Intl.NumberFormat().format(catalog.puzzleCount)} positions from {catalog.source}
          </p>
        ) : null}
      </section>
    </aside>
  );
}
