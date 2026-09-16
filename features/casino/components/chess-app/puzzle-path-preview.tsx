import { CheckIcon } from "@/components/ui/icons";
import {
  getPuzzlePathPosition,
  getPuzzlePathTierNodes,
  PUZZLE_PATH_TIERS,
  type PuzzlePathAward,
} from "@/features/casino/lib/chess/puzzle-path-reference";

const PATH_ROWS = [
  [20, 19, 18, 17, 16],
  [11, 12, 13, 14, 15],
  [10, 9, 8, 7, 6],
  [1, 2, 3, 4, 5],
] as const;

interface PuzzleAwardPreviewProps {
  award: PuzzlePathAward;
  onBack: () => void;
  onContinue: () => void;
}

interface PuzzlePathPreviewProps {
  award: PuzzlePathAward;
  previousXp: number;
  xp: number;
  onContinue: () => void;
  onReset: () => void;
}

function AwardRow({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between border-b border-white/7 py-3 last:border-0">
      <span className="text-sm text-white/52">{label}</span>
      <span className="font-mono text-sm font-bold text-[#ead18d]">+{value}</span>
    </div>
  );
}

export function PuzzleAwardPreview({ award, onBack, onContinue }: PuzzleAwardPreviewProps) {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-[#d7b66e]/25 bg-[#171813] shadow-[0_30px_100px_rgba(0,0,0,.65)]">
      <div className="relative overflow-hidden border-b border-white/8 px-7 py-8 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,182,110,.24),transparent_65%)]" />
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#8fc699]/30 bg-[#162219] text-[#9fd2a8] shadow-[0_0_40px_rgba(111,173,123,.2)]">
          <CheckIcon size={30} />
        </div>
        <p className="relative mt-5 text-[10px] font-bold tracking-[.2em] text-[#d7b66e] uppercase">
          Solution accepted
        </p>
        <h2 className="relative mt-2 font-serif text-4xl tracking-[-.04em]">+{award.total} XP</h2>
        <p className="relative mt-2 text-sm text-white/45">{award.difficulty} puzzle reward</p>
      </div>

      <div className="px-7 py-4">
        <AwardRow label="Puzzle" value={award.base} />
        <AwardRow label="Speed" value={award.speed} />
        <AwardRow label="Streak" value={award.streak} />
        <AwardRow label="Daily milestone" value={award.daily} />
        <AwardRow label="Retry completion" value={award.retry} />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/8 p-5">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-lg border border-white/10 bg-white/[.035] px-4 py-3 text-xs font-semibold text-white/60 hover:bg-white/[.07]"
        >
          Back to board
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="cursor-pointer rounded-lg bg-[#d7b66e] px-4 py-3 text-xs font-bold text-[#1c170d] shadow-[0_10px_30px_rgba(215,182,110,.2)] hover:bg-[#e2c37d]"
        >
          View Puzzle Path
        </button>
      </div>
    </div>
  );
}

export function PuzzlePathPreview({
  award,
  previousXp,
  xp,
  onContinue,
  onReset,
}: PuzzlePathPreviewProps) {
  const previous = getPuzzlePathPosition(previousXp);
  const position = getPuzzlePathPosition(xp);
  const nodes = getPuzzlePathTierNodes(xp);
  const nodesByLevel = new Map(nodes.map((node) => [node.level, node]));
  const tier = PUZZLE_PATH_TIERS[position.tier - 1];
  const promoted = previous.tier !== position.tier || previous.level !== position.level;

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/9 bg-[#141510] shadow-[0_35px_120px_rgba(0,0,0,.68)]">
      <header className="relative overflow-hidden border-b border-white/8 px-6 py-6 sm:px-8">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background: `radial-gradient(circle at 15% 0%, ${tier.color}, transparent 48%)`,
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold tracking-[.2em] text-white/38 uppercase">
              Prestige {position.prestige} / {PUZZLE_PATH_TIERS.length} tiers
            </p>
            <h2 className="mt-2 font-serif text-4xl tracking-[-.04em]">{position.tierName} Path</h2>
            <p className="mt-2 text-sm text-white/45">
              Level {position.level} of 20
              {promoted ? " unlocked" : " in progress"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
            <p className="font-mono text-xl font-bold text-[#ead18d]">{xp.toLocaleString()} XP</p>
            <p className="mt-1 text-[10px] tracking-[.12em] text-white/32 uppercase">
              +{award.total} collected
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <div className="mb-2 flex justify-between text-[10px] font-semibold text-white/38">
            <span>Level {position.level}</span>
            <span>
              {position.levelXp} / {position.levelRequiredXp} XP
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[#d7b66e] shadow-[0_0_18px_rgba(215,182,110,.5)] transition-[width] duration-700"
              style={{ width: `${Math.max(2, position.levelProgress * 100)}%` }}
            />
          </div>
        </div>
      </header>

      <div className="relative px-5 py-7 sm:px-10">
        <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:28px_28px] opacity-[.045]" />
        <div className="relative space-y-5">
          {PATH_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="relative grid grid-cols-5 items-center gap-2 sm:gap-5">
              <span className="absolute top-1/2 right-[8%] left-[8%] h-px bg-white/8" />
              {row.map((level) => {
                const node = nodesByLevel.get(level);
                if (!node) return null;
                const isCurrent = node.state === "current";
                return (
                  <div key={level} className="relative z-10 grid place-items-center">
                    <div
                      className={`grid h-11 w-11 place-items-center rounded-full border text-xs font-bold transition-all sm:h-14 sm:w-14 ${
                        node.state === "complete"
                          ? "border-[#7caf86]/35 bg-[#19251b] text-[#9ecea6]"
                          : isCurrent
                            ? "scale-110 border-[#d7b66e]/60 bg-[#2a2415] text-[#efd58f] shadow-[0_0_0_7px_rgba(215,182,110,.07),0_0_35px_rgba(215,182,110,.2)]"
                            : "border-white/8 bg-[#191a16] text-white/24"
                      }`}
                    >
                      {node.state === "complete" ? <CheckIcon size={17} /> : level}
                    </div>
                    {isCurrent && (
                      <span className="mt-2 rounded-full border border-[#d7b66e]/20 bg-[#d7b66e]/8 px-2 py-1 text-[8px] font-bold tracking-[.12em] text-[#d7b66e] uppercase">
                        You
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/8 px-5 py-5 sm:px-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {PUZZLE_PATH_TIERS.map((item) => (
            <div
              key={item.id}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-bold tracking-[.1em] uppercase ${
                item.id === position.tier
                  ? "border-white/20 bg-white/8 text-white/80"
                  : "border-white/7 text-white/25"
              }`}
            >
              {item.name}
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/[.035] px-4 py-3 text-xs font-semibold text-white/55 hover:bg-white/[.07]"
          >
            Reset captured state
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="cursor-pointer rounded-lg bg-[#d7b66e] px-4 py-3 text-xs font-bold text-[#1c170d] hover:bg-[#e2c37d]"
          >
            Continue training
          </button>
        </div>
      </div>
    </div>
  );
}
