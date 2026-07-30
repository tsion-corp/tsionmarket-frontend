"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DRAW_BONUS_POOL,
  DRAW_ENTRY_COST_MINOR,
  DRAW_JACKPOT_LABEL,
  DRAW_MAIN_PICKS,
  DRAW_MAIN_POOL,
  DRAW_PRIZE_TIERS,
  PAST_DRAWS,
} from "@/lib/casino/demo";
import { formatCasinoAmount } from "@/lib/casino/stakes";
import { NumberChip } from "@/components/dashboard/casino/draw/number-chip";
import { useDrawEntries } from "@/components/dashboard/casino/draw/use-draw-entries";

const BALL_REVEAL_MS = 650;
// Demo countdown to the next draw: 4h 12m 33s.
const NEXT_DRAW_SECONDS = 4 * 3600 + 12 * 60 + 33;

function formatCountdown(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function randomIn(pool: number): number {
  return 1 + Math.floor(Math.random() * pool);
}

interface DrawResult {
  matches: number;
  bonusHit: boolean;
}

export function DrawSection() {
  const { addEntry } = useDrawEntries();
  const [mainNumbers, setMainNumbers] = useState<number[]>([7, 14, 22]);
  const [bonusNumber, setBonusNumber] = useState(3);
  const [entryCount, setEntryCount] = useState(3);
  const [countdown, setCountdown] = useState(NEXT_DRAW_SECONDS);
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [drawnBalls, setDrawnBalls] = useState<number[]>([]);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const drawTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearInterval(id);
      if (drawTimer.current) clearInterval(drawTimer.current);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const toggleMain = (num: number) => {
    setMainNumbers((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num);
      if (prev.length >= DRAW_MAIN_PICKS) return prev;
      return [...prev, num];
    });
  };

  const quickPick = () => {
    const picks = new Set<number>();
    while (picks.size < DRAW_MAIN_PICKS) picks.add(randomIn(DRAW_MAIN_POOL));
    setMainNumbers([...picks]);
    setBonusNumber(randomIn(DRAW_BONUS_POOL));
  };

  // Runs a simulated draw: the winning set keeps one to three of the player's
  // picks so the reveal usually has something to celebrate, then balls land
  // one at a time.
  const startDraw = () => {
    if (drawTimer.current) clearInterval(drawTimer.current);
    const pool = [...mainNumbers];
    while (pool.length < DRAW_MAIN_PICKS) {
      const n = randomIn(DRAW_MAIN_POOL);
      if (!pool.includes(n)) pool.push(n);
    }
    const keep = 1 + Math.floor(Math.random() * 3);
    const winning = pool.slice(0, keep);
    while (winning.length < DRAW_MAIN_PICKS) {
      const n = randomIn(DRAW_MAIN_POOL);
      if (!winning.includes(n)) winning.push(n);
    }
    winning.sort((a, b) => a - b);
    const bonus = randomIn(DRAW_BONUS_POOL);
    const sequence = [...winning, bonus];
    // Score against the picks as they were when the draw started.
    const picked = [...mainNumbers];
    const pickedBonus = bonusNumber;

    setPhase("running");
    setDrawnBalls([]);
    setResult(null);
    let shown = 0;
    drawTimer.current = setInterval(() => {
      shown++;
      setDrawnBalls(sequence.slice(0, shown));
      if (shown >= sequence.length) {
        if (drawTimer.current) clearInterval(drawTimer.current);
        setResult({
          matches: picked.filter((n) => winning.includes(n)).length,
          bonusHit: pickedBonus === bonus,
        });
      }
    }, BALL_REVEAL_MS);
  };

  const resetDraw = () => {
    setPhase("idle");
    setDrawnBalls([]);
    setResult(null);
  };

  const canConfirm = mainNumbers.length === DRAW_MAIN_PICKS;
  const confirmEntry = () => {
    if (!canConfirm) return;
    addEntry(mainNumbers, bonusNumber);
    setJustConfirmed(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setJustConfirmed(false), 3500);
  };

  const resultText = result
    ? result.matches >= 5 && result.bonusHit
      ? "JACKPOT — all 5 + bonus matched!"
      : result.matches >= 3
        ? `${result.matches} matched${result.bonusHit ? " + bonus" : ""} — you win ${
            result.matches === 5 ? "₦240,000" : result.matches === 4 ? "₦8,500" : "₦500"
          }`
        : `${result.matches} matched — no prize this time`
    : "";

  const numberButton = (num: number, selected: boolean, gold: boolean, onClick: () => void) => (
    <button
      key={num}
      onClick={onClick}
      className={`tnum aspect-square cursor-pointer rounded-lg border text-[12px] transition-colors ${
        selected
          ? gold
            ? "border-grey-300 bg-grey-100 text-ink font-bold"
            : "border-accent bg-accent text-ink font-bold"
          : "border-white/10 bg-black/40 text-white hover:border-white/25"
      }`}
    >
      {num}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pt-8 pb-20 sm:px-6">
      {/* Jackpot header */}
      <div className="ws-glass relative mb-6 overflow-hidden rounded-[20px] p-9 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-36 left-1/2 h-[280px] w-[480px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(212,212,216,0.13),transparent_70%)]"
        />
        <div className="mb-2.5 text-[11px] font-normal tracking-[0.06em] text-white/50 uppercase">
          Jackpot · rolled over 3 draws
        </div>
        <div className="ws-display tnum text-grey-100 mb-2.5 text-[clamp(38px,7vw,56px)] leading-none">
          {DRAW_JACKPOT_LABEL}
        </div>
        <div className="tnum mb-4.5 text-[15px]">
          Next draw in <span className="text-down">{formatCountdown(countdown)}</span>
        </div>
        {phase === "idle" ? (
          <button
            onClick={startDraw}
            className="border-accent/45 text-accent cursor-pointer rounded-full border bg-transparent px-5 py-2 font-sans text-[12px] font-semibold"
          >
            Simulate draw now
          </button>
        ) : (
          <>
            <div className="flex min-h-[44px] items-center justify-center gap-2.5">
              {drawnBalls.map((num, i) => {
                const isBonus = i === DRAW_MAIN_PICKS;
                const hit = isBonus ? bonusNumber === num : mainNumbers.includes(num);
                return (
                  <span
                    key={`${num}-${i}`}
                    className={`tnum grid h-[42px] w-[42px] [animation:ws-ball-in_0.35s_ease-out] place-items-center rounded-full text-[15px] font-semibold ${
                      hit
                        ? "bg-grey-100 text-ink"
                        : isBonus
                          ? "border-accent border bg-white/8 text-white"
                          : "border border-white/10 bg-white/8 text-white"
                    }`}
                  >
                    {num}
                  </span>
                );
              })}
            </div>
            {result ? (
              <>
                <div
                  className={`mt-3.5 text-[13.5px] ${result.matches >= 3 ? "text-up" : "font-normal text-white/55"}`}
                >
                  {resultText}
                </div>
                <button
                  onClick={resetDraw}
                  className="mt-3 cursor-pointer rounded-full border border-white/15 px-4 py-1.5 font-sans text-[11.5px] font-normal text-white/55"
                >
                  Reset
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-[1.2fr_1fr]">
        {/* Number picker */}
        <div className="ws-glass rounded-2xl p-5.5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-normal text-white/55">
              Pick {DRAW_MAIN_PICKS} numbers (1–{DRAW_MAIN_POOL})
            </div>
            <button
              onClick={quickPick}
              className="text-accent cursor-pointer rounded-full border border-white/15 px-3.5 py-1.5 font-sans text-[12px]"
            >
              Quick pick
            </button>
          </div>
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {Array.from({ length: DRAW_MAIN_POOL }, (_, i) => i + 1).map((num) =>
              numberButton(num, mainNumbers.includes(num), false, () => toggleMain(num))
            )}
          </div>
          <div className="mb-2 text-[13px] font-normal text-white/55">
            Bonus number (1–{DRAW_BONUS_POOL})
          </div>
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({ length: DRAW_BONUS_POOL }, (_, i) => i + 1).map((num) =>
              numberButton(num, bonusNumber === num, true, () => setBonusNumber(num))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Entries */}
          <div className="ws-glass rounded-2xl p-5">
            <div className="mb-2.5 text-[13px] font-normal text-white/55">Entries</div>
            <div className="mb-3 flex items-center gap-3.5">
              <button
                onClick={() => setEntryCount((n) => Math.max(1, n - 1))}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/15 text-[16px] text-white"
              >
                −
              </button>
              <div className="tnum text-[16px]">{entryCount} entries</div>
              <button
                onClick={() => setEntryCount((n) => Math.min(20, n + 1))}
                className="h-8 w-8 cursor-pointer rounded-lg border border-white/15 text-[16px] text-white"
              >
                +
              </button>
            </div>
            <div className="ws-display tnum text-grey-100 mb-3.5 text-[22px]">
              {formatCasinoAmount(entryCount * DRAW_ENTRY_COST_MINOR, "NGN")}
            </div>
            <button
              onClick={confirmEntry}
              disabled={!canConfirm}
              className={`w-full rounded-full p-3 font-sans text-[13px] font-bold ${
                canConfirm
                  ? "text-ink cursor-pointer bg-white"
                  : "cursor-not-allowed bg-white/10 text-white/40"
              }`}
            >
              {canConfirm
                ? "Confirm entry"
                : `Pick ${DRAW_MAIN_PICKS - mainNumbers.length} more number${
                    DRAW_MAIN_PICKS - mainNumbers.length === 1 ? "" : "s"
                  }`}
            </button>
            {justConfirmed ? (
              <div className="text-up mt-2.5 text-center text-[12px]">
                Entry locked in — view it in{" "}
                <Link href="/casino/draw/entries" className="text-accent">
                  My entries
                </Link>
              </div>
            ) : null}
          </div>

          {/* Prize tiers */}
          <div className="ws-glass rounded-2xl p-5">
            <div className="mb-2.5 text-[13px] font-normal text-white/55">Prize tiers</div>
            {DRAW_PRIZE_TIERS.map((t) => (
              <div
                key={t.label}
                className="flex justify-between border-t border-white/6 py-1.5 text-[12.5px]"
              >
                <span className="font-normal text-white/50">{t.label}</span>
                <span className="tnum text-grey-100">{t.prize}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-2.5 text-[13px] font-normal text-white/55">Past draws</div>
      <div className="flex gap-3.5 overflow-x-auto pb-1">
        {PAST_DRAWS.map((d) => (
          <div key={d.date} className="ws-inset flex-none rounded-xl px-3.5 py-2.5">
            <div className="mb-1.5 text-[10.5px] font-normal text-white/40">{d.date}</div>
            <div className="flex gap-1.5">
              {d.numbers.map((num, i) => (
                <NumberChip key={i} num={num} size={22} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
