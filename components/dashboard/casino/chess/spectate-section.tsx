"use client";

import { useEffect, useState } from "react";
import {
  initialBoard,
  applyMove,
  gameStatus,
  pickBotMove,
  squareName,
  type Board,
  type Move,
  type PieceColor,
} from "@/lib/casino/chess/engine";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { DEMO_OPPONENT, DEMO_PLAYER } from "@/lib/casino/demo";
import { formatCasinoAmount, parseStakeToMinor } from "@/lib/casino/stakes";

const ODDS_TICK_MS = 2600;
const FLASH_MS = 260;
const BOT_MOVE_MS = 1800;
const EVENT_CAP = 30;

type BetSide = "White" | "Draw" | "Black";
type Flash = "" | "up" | "down";

interface FeedEvent {
  move: string;
  text: string;
  tone: "neutral" | "alert";
}

const SEED_EVENTS: FeedEvent[] = [
  { move: "18.", text: "Nf3–e5 played", tone: "neutral" },
  { move: "18…", text: "New bet: ₦5,000 on White", tone: "neutral" },
  { move: "17…", text: "Blunder! Black odds jump 3.1 → 1.8", tone: "alert" },
  { move: "17.", text: "Bc4xf7+ played", tone: "neutral" },
];

interface DuelState {
  board: Board;
  turn: PieceColor;
  lastMove: Move | null;
  moveCount: number;
  clocks: Record<PieceColor, number>;
}

function freshDuel(): DuelState {
  return {
    board: initialBoard(),
    turn: "w",
    lastMove: null,
    moveCount: 0,
    clocks: { w: 272, b: 252 },
  };
}

// Live match watched by spectators: two bots trade moves on an interval and
// the game restarts shortly after it ends.
function useBotDuel(onMove: (label: string, moveNo: string) => void) {
  const [duel, setDuel] = useState<DuelState>(freshDuel);

  useEffect(() => {
    const id = setInterval(() => {
      setDuel((d) => {
        if (
          gameStatus(d.board, d.turn) === "checkmate" ||
          gameStatus(d.board, d.turn) === "stalemate"
        ) {
          return freshDuel();
        }
        const move = pickBotMove(d.board, d.turn);
        if (!move) return freshDuel();
        const piece = d.board[move.from.r][move.from.c];
        const target = d.board[move.to.r][move.to.c];
        const letter = piece && piece.type !== "p" ? piece.type.toUpperCase() : "";
        const notation =
          letter +
          squareName(move.from.r, move.from.c) +
          (target ? "x" : "–") +
          squareName(move.to.r, move.to.c);
        const moveCount = d.moveCount + 1;
        const moveNo = `${Math.ceil(moveCount / 2)}${d.turn === "b" ? "…" : "."}`;
        onMove(`${notation} played`, moveNo);
        return {
          board: applyMove(d.board, move.from, move.to),
          turn: d.turn === "w" ? "b" : "w",
          lastMove: move,
          moveCount,
          clocks: { ...d.clocks, [d.turn]: Math.max(0, d.clocks[d.turn] - 7) },
        };
      });
    }, BOT_MOVE_MS);
    return () => clearInterval(id);
    // onMove is a stable setState-based callback defined below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return duel;
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SpectateSection() {
  const [events, setEvents] = useState<FeedEvent[]>(SEED_EVENTS);
  const duel = useBotDuel((text, move) =>
    setEvents((ev) => [{ move, text, tone: "neutral" as const }, ...ev].slice(0, EVENT_CAP))
  );

  // A random-walk market: white and black odds drift each tick, flash green
  // or red for a beat, and feed the probability bar and the sparkline.
  const [market, setMarket] = useState({
    white: 2.1,
    draw: 4.5,
    black: 3.25,
    flashWhite: "" as Flash,
    flashBlack: "" as Flash,
    history: [2.3, 2.24, 2.18, 2.15, 2.2, 2.12, 2.1],
    evalWhitePct: 54,
  });

  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    const id = setInterval(() => {
      setMarket((m) => {
        const dw = (Math.random() - 0.5) * 0.24;
        const white = Math.max(1.15, +(m.white + dw).toFixed(2));
        const black = Math.max(1.15, +(m.black - dw * 0.8).toFixed(2));
        const evalWhitePct = Math.max(
          5,
          Math.min(95, Math.round((100 / white / (100 / white + 100 / black)) * 100))
        );
        return {
          ...m,
          white,
          black,
          flashWhite: dw > 0 ? "up" : "down",
          flashBlack: dw > 0 ? "down" : "up",
          evalWhitePct,
          history: [...m.history.slice(-19), white],
        };
      });
      flashTimer = setTimeout(
        () => setMarket((m) => ({ ...m, flashWhite: "", flashBlack: "" })),
        FLASH_MS
      );
    }, ODDS_TICK_MS);
    return () => {
      clearInterval(id);
      if (flashTimer) clearTimeout(flashTimer);
    };
  }, []);

  const [betSide, setBetSide] = useState<BetSide | null>(null);
  const [betStake, setBetStake] = useState("");
  const [betSlip, setBetSlip] = useState<{ side: BetSide; odds: string; payout: string } | null>(
    null
  );

  const lockOdds = () => {
    if (!betSide) return;
    const stakeMinor = parseStakeToMinor(betStake) || 100_000;
    const odds =
      betSide === "White" ? market.white : betSide === "Draw" ? market.draw : market.black;
    setBetSlip({
      side: betSide,
      odds: odds.toFixed(2),
      payout: formatCasinoAmount(Math.round(stakeMinor * odds), "NGN"),
    });
  };

  const oddsButtonClass = (flash: Flash, selected: boolean) => {
    if (selected) return "border-white bg-white text-ink";
    if (flash === "up") return "border-up bg-up/15 text-up";
    if (flash === "down") return "border-down bg-down/15 text-down";
    return "border-white/10 bg-white/4 text-white";
  };

  // Sparkline over the recent odds history, with a dot on the sharpest move
  // (the "blunder" a market reacts to).
  const { history } = market;
  const min = Math.min(...history);
  const range = Math.max(0.01, Math.max(...history) - min);
  const point = (v: number, i: number) =>
    `${((i / (history.length - 1)) * 240).toFixed(1)},${(52 - ((v - min) / range) * 42).toFixed(1)}`;
  const sparkPoints = history.map(point).join(" ");
  let blunderIdx = 1;
  for (let i = 1; i < history.length; i++) {
    if (
      Math.abs(history[i] - history[i - 1]) >
      Math.abs(history[blunderIdx] - history[blunderIdx - 1])
    ) {
      blunderIdx = i;
    }
  }
  const [blunderX, blunderY] = point(history[blunderIdx], blunderIdx).split(",");

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 pt-6 pb-20 sm:px-6">
      <div className="tnum mb-4 flex gap-5 text-[13px]">
        <div>
          <span className="font-normal text-white/50">Pot </span>
          <span className="text-grey-100 font-semibold">₦50,000</span>
        </div>
        <div>
          <span className="font-normal text-white/50">Spectator volume </span>
          <span>₦612,000</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="min-w-[320px] flex-1">
          <div className="mb-2.5 flex max-w-[520px] items-center justify-between text-[13.5px]">
            <div className="flex items-center gap-2.5">
              <span className="h-[26px] w-[26px] rounded-full bg-white/8" />
              {DEMO_OPPONENT.name} ({DEMO_OPPONENT.rating})
            </div>
            <div className="tnum ws-inset rounded-lg px-3 py-1 text-[16px]">
              {formatClock(duel.clocks.b)}
            </div>
          </div>

          <div className="max-w-[520px]">
            <ChessBoard board={duel.board} lastMove={duel.lastMove} />
          </div>

          <div className="mt-2.5 flex max-w-[520px] items-center justify-between text-[13.5px]">
            <div className="flex items-center gap-2.5">
              <span className="h-[26px] w-[26px] rounded-full bg-white/8" />
              {DEMO_PLAYER.name} ({DEMO_PLAYER.rating})
            </div>
            <div className="tnum ws-inset rounded-lg px-3 py-1 text-[16px]">
              {formatClock(duel.clocks.w)}
            </div>
          </div>

          <div className="mt-6 max-w-[520px]">
            <div className="ws-display mb-2 text-[15px]">Event feed</div>
            <div className="max-h-[200px] overflow-y-auto rounded-[10px] border border-white/8">
              {events.map((ev, i) => (
                <div
                  key={`${ev.move}-${i}`}
                  className="flex gap-2.5 border-t border-white/6 px-3.5 py-2 text-[12.5px] first:border-t-0"
                >
                  <span className="tnum min-w-[34px] font-normal text-white/40">{ev.move}</span>
                  <span className={ev.tone === "alert" ? "text-down" : "font-normal text-white/60"}>
                    {ev.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live market panel */}
        <div className="ws-glass h-fit w-full shrink-0 rounded-2xl p-4.5 md:w-[320px]">
          <div className="ws-display mb-3 text-[15px]">Live market</div>
          <div className="mb-3.5 grid grid-cols-3 gap-2">
            {(
              [
                ["White", market.white, market.flashWhite],
                ["Draw", market.draw, "" as Flash],
                ["Black", market.black, market.flashBlack],
              ] as Array<[BetSide, number, Flash]>
            ).map(([side, odds, flash]) => (
              <button
                key={side}
                onClick={() => setBetSide(side)}
                className={`cursor-pointer rounded-[10px] border py-3 text-center transition-colors ${oddsButtonClass(flash, betSide === side)}`}
              >
                <span className="block text-[11px] opacity-70">{side}</span>
                <span className="tnum block text-[19px]">{odds.toFixed(2)}</span>
              </button>
            ))}
          </div>

          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-[11px] font-normal text-white/50">
              <span>White win probability</span>
              <span className="tnum">{market.evalWhitePct}% White</span>
            </div>
            <div className="flex h-[7px] overflow-hidden rounded-[4px] bg-white/10">
              <div
                className="h-full bg-white transition-[width] duration-400"
                style={{ width: `${market.evalWhitePct}%` }}
              />
            </div>
          </div>

          <div className="mb-3.5 border-t border-white/8 pt-3.5">
            <div className="mb-2 text-[11px] font-normal text-white/50">Place a bet</div>
            <div className="mb-2.5 flex gap-2">
              <input
                value={betStake}
                onChange={(e) => setBetStake(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Stake"
                className="ws-inset tnum focus:border-accent/50 min-w-0 flex-1 rounded-lg px-2.5 py-2 font-sans text-[13px] text-white outline-none"
              />
              <button
                onClick={lockOdds}
                className="text-ink cursor-pointer rounded-lg bg-white px-4 font-sans text-[12px] font-bold"
              >
                Lock odds
              </button>
            </div>
            {betSlip ? (
              <div className="border-grey-300/30 rounded-[10px] border bg-black/40 px-3.5 py-3 text-[12.5px]">
                <div className="mb-1 font-normal text-white/50">Your bet</div>
                <div>
                  {betSlip.side} @ {betSlip.odds} — potential payout{" "}
                  <span className="text-grey-100 font-semibold">{betSlip.payout}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-normal text-white/50">Odds movement</div>
            <svg viewBox="0 0 240 56" className="block h-[56px] w-full">
              <polyline
                points={sparkPoints}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-accent"
              />
              <circle cx={blunderX} cy={blunderY} r="3.5" className="fill-down" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
