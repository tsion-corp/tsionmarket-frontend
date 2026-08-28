"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/ui/modal-shell";
import { useCreateComputerMatch } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { ComputerWagerSummary } from "@/features/casino/components/computer-wager-summary";
import {
  MIN_STAKED_CHESS_COMPUTER_LEVEL,
  chessComputerWagerBreakdown,
  exceedsUsdcBalance,
  normalizeUsdcAmount,
} from "@/features/casino/lib/api/cashier";
import {
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
} from "@/features/casino/lib/chess/ui";
import type { ChessClockMode, CreateComputerMatchInput } from "@/features/casino/lib/api/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const STAKED_INITIAL_SECONDS = 600;

// These are Lichess's time slider values. Keeping the same index mapping makes
// the setup behave predictably for players already familiar with that dialog.
const MINUTES_PER_SIDE = [
  0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
] as const;

const INCREMENTS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25, 30, 35, 40, 45, 60,
  90, 120, 150, 180,
] as const;

const STORAGE_KEY = "chess.computer.setup";

type ComputerColor = CreateComputerMatchInput["color"];

interface StoredSetup {
  level: number;
  color: ComputerColor;
  timeMode: ChessClockMode;
  timeIndex: number;
  incrementIndex: number;
  coachEnabled: boolean;
}

const DEFAULT_SETUP: StoredSetup = {
  level: 1,
  color: "random",
  timeMode: "unlimited",
  timeIndex: 9,
  incrementIndex: 3,
  coachEnabled: true,
};

function isStoredSetup(value: unknown): value is StoredSetup {
  if (typeof value !== "object" || value === null) return false;
  const setup = value as Partial<StoredSetup>;
  return (
    typeof setup.level === "number" &&
    setup.level >= 1 &&
    setup.level <= 8 &&
    (setup.color === "white" || setup.color === "black" || setup.color === "random") &&
    (setup.timeMode === "real_time" || setup.timeMode === "unlimited") &&
    typeof setup.timeIndex === "number" &&
    setup.timeIndex >= 0 &&
    setup.timeIndex < MINUTES_PER_SIDE.length &&
    typeof setup.incrementIndex === "number" &&
    setup.incrementIndex >= 0 &&
    setup.incrementIndex < INCREMENTS.length &&
    (setup.coachEnabled === undefined || typeof setup.coachEnabled === "boolean")
  );
}

function displayMinutes(value: number): string {
  if (value === 0.25) return "1/4";
  if (value === 0.5) return "1/2";
  if (value === 0.75) return "3/4";
  return String(value);
}

function SidePiece({ color }: { color: ComputerColor }) {
  if (color === "random") {
    return (
      <span className="relative block h-9 w-12" aria-hidden>
        <Image
          src="/piece/cburnett/bk.png"
          alt=""
          width={36}
          height={36}
          className="absolute top-0 left-0 h-9 w-9 object-contain"
        />
        <Image
          src="/piece/cburnett/wk.png"
          alt=""
          width={36}
          height={36}
          className="absolute top-0 right-0 h-9 w-9 object-contain"
        />
      </span>
    );
  }
  return (
    <Image
      src={`/piece/cburnett/${color === "white" ? "w" : "b"}k.png`}
      alt=""
      width={36}
      height={36}
      className="h-9 w-9 object-contain"
    />
  );
}

interface ChessComputerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChessComputerDialog({ open, onClose }: ChessComputerDialogProps) {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const create = useCreateComputerMatch();
  const [setup, setSetup] = useState<StoredSetup>(DEFAULT_SETUP);
  const [restored, setRestored] = useState(false);
  const [stake, setStake] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isStoredSetup(parsed)) {
            setSetup({ ...parsed, coachEnabled: parsed.coachEnabled ?? true });
          }
        }
      } catch {
        // A blocked or corrupt local store should never prevent starting a game.
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // The setup still works when browser storage is unavailable.
    }
  }, [restored, setup]);

  const minutes = MINUTES_PER_SIDE[setup.timeIndex];
  const increment = INCREMENTS[setup.incrementIndex];
  const realTimeValid = minutes > 0 || increment > 0;
  const stakingAllowed = setup.level >= MIN_STAKED_CHESS_COMPUTER_LEVEL;
  const stakeUsdc = cashier.configured && stakingAllowed ? normalizeUsdcAmount(stake) : null;
  const wagerBreakdown = stakeUsdc
    ? chessComputerWagerBreakdown(stakeUsdc, cashier.available, setup.level)
    : null;
  const stakeInvalid = stake.trim().length > 0 && stakingAllowed && !wagerBreakdown;
  const stakeOverBalance = !!stakeUsdc && exceedsUsdcBalance(stakeUsdc, cashier.available);
  const stakedGame = !!stakeUsdc;

  const onPlay = async () => {
    if (!wallet.connected) {
      toast.error("Connect your wallet to play.");
      return;
    }
    const id = toast.loading("Starting your computer game...");
    try {
      const match = await create.mutateAsync({
        level: setup.level,
        color: stakedGame ? "random" : setup.color,
        timeMode: stakedGame ? "real_time" : setup.timeMode,
        ...(stakedGame
          ? { initialSeconds: STAKED_INITIAL_SECONDS, incrementSeconds: 0 }
          : setup.timeMode === "real_time"
            ? {
                initialSeconds: Math.round(minutes * 60),
                incrementSeconds: increment,
              }
            : {}),
        ...(stakeUsdc ? { stakeUsdc } : {}),
        coachEnabled: setup.coachEnabled && !stakeUsdc,
      });
      toast.success("Game ready.", { id });
      onClose();
      router.push(`/casino/chess/play?match=${match.id}`);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't start the computer game."), { id });
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      contentKey="computer-game-setup"
      panelClassName={`${CHESS_MODAL_PANEL_CLASS} !flex !flex-col !overflow-hidden !rounded-[4px] !px-0 !pt-0 !pb-0 md:!w-[min(672px,calc(100vw-32px))]`}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
    >
      <h2 className="shrink-0 px-6 py-5 text-center text-[21px] font-normal text-white/88">
        Game setup
      </h2>

      <div
        data-testid="computer-game-setup-scroll-region"
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain border-y border-white/10 bg-[#211f1c] px-5 py-6 sm:px-7"
      >
        <div>
          <div className="mb-2 text-[14px] font-semibold text-white/86">Variant</div>
          <div className="flex items-center gap-3 rounded-[3px] border border-white/10 bg-[#262421] px-4 py-3">
            <Image
              src="/piece/cburnett/wk.png"
              alt=""
              width={34}
              height={34}
              className="h-[34px] w-[34px] object-contain"
            />
            <div>
              <div className="text-[15px] font-semibold text-white/88">Standard</div>
              <div className="mt-0.5 text-[13px] text-white/48">Standard chess rules</div>
            </div>
          </div>
        </div>

        <fieldset>
          <legend className="sr-only">Time control</legend>
          <div className="grid grid-cols-2 border-b border-white/12" role="tablist">
            {(
              [
                ["real_time", "Real time"],
                ["unlimited", "Unlimited"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={(stakedGame ? "real_time" : setup.timeMode) === mode}
                disabled={stakedGame}
                onClick={() => setSetup((current) => ({ ...current, timeMode: mode }))}
                className={`cursor-pointer border-b-2 px-3 py-2.5 text-[14px] transition-colors ${
                  (stakedGame ? "real_time" : setup.timeMode) === mode
                    ? "border-[#629924] text-[#8fbd55]"
                    : "border-transparent text-white/52 hover:text-white/78"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {stakedGame ? (
            <p className="mt-5 rounded-[3px] border border-white/10 bg-[#262421] px-4 py-3 text-center text-[13px] leading-6 text-white/62">
              Every paid choice uses the maximum-strength level-8 engine with a fixed 10+0 clock.
            </p>
          ) : setup.timeMode === "real_time" ? (
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] items-end gap-3">
              <label className="block min-w-0">
                <span className="mb-3 flex items-center justify-between gap-3 text-[13px] text-white/62">
                  <span>Minutes per side</span>
                  <span className="tnum rounded-[3px] bg-white/8 px-2 py-1 text-white/88">
                    {displayMinutes(minutes)}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={MINUTES_PER_SIDE.length - 1}
                  value={setup.timeIndex}
                  onChange={(event) =>
                    setSetup((current) => ({
                      ...current,
                      timeIndex: Number(event.target.value),
                    }))
                  }
                  className="w-full cursor-pointer accent-[#629924]"
                />
              </label>
              <span className="pb-0.5 text-center text-[24px] font-light text-white/38">+</span>
              <label className="block min-w-0">
                <span className="mb-3 flex items-center justify-between gap-3 text-[13px] text-white/62">
                  <span className="tnum rounded-[3px] bg-white/8 px-2 py-1 text-white/88">
                    {increment}
                  </span>
                  <span>Increment in seconds</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={INCREMENTS.length - 1}
                  value={setup.incrementIndex}
                  onChange={(event) =>
                    setSetup((current) => ({
                      ...current,
                      incrementIndex: Number(event.target.value),
                    }))
                  }
                  className="w-full cursor-pointer accent-[#629924]"
                />
              </label>
            </div>
          ) : (
            <p className="mt-5 text-center text-[13px] leading-6 text-white/52">
              Take as long as you need. No clock will count down.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[14px] font-semibold text-white/86">Strength</legend>
          <div className="grid grid-cols-4 gap-2">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={setup.level === level}
                onClick={() => {
                  setSetup((current) => ({ ...current, level }));
                  if (level < MIN_STAKED_CHESS_COMPUTER_LEVEL) setStake("");
                }}
                className={`tnum flex h-11 cursor-pointer items-center justify-center rounded-[3px] border text-[13px] ${
                  setup.level === level
                    ? "border-[#78b32d] bg-[#629924] font-semibold text-white"
                    : "border-white/10 bg-[#262421] text-white/68 hover:border-white/22 hover:bg-white/8 hover:text-white"
                }`}
              >
                {level >= MIN_STAKED_CHESS_COMPUTER_LEVEL ? `Stockfish ${level}` : level}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[14px] font-semibold text-white/86">Coach</legend>
          <button
            type="button"
            role="switch"
            aria-checked={setup.coachEnabled && !stakeUsdc}
            disabled={!!stakeUsdc}
            onClick={() =>
              setSetup((current) => ({ ...current, coachEnabled: !current.coachEnabled }))
            }
            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-[3px] border border-white/10 bg-[#262421] px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span>
              <span className="block text-[14px] font-semibold text-white/86">
                Coach me during the game
              </span>
              <span className="mt-0.5 block text-[12px] leading-5 text-white/44">
                Pause before serious mistakes, explain the danger, and let me try again.
              </span>
            </span>
            <span
              aria-hidden
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                setup.coachEnabled && !stakeUsdc ? "bg-[#629924]" : "bg-white/14"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  setup.coachEnabled && !stakeUsdc ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
          {stakeUsdc ? (
            <p className="mt-1.5 text-[11px] text-white/38">
              Live coaching is disabled when a stake is attached.
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[14px] font-semibold text-white/86">Side</legend>
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                ["black", "Black"],
                ["random", "Random"],
                ["white", "White"],
              ] as const
            ).map(([color, label]) => (
              <button
                key={color}
                type="button"
                aria-pressed={(stakedGame ? "random" : setup.color) === color}
                disabled={stakedGame}
                onClick={() => setSetup((current) => ({ ...current, color }))}
                className={`flex min-h-[78px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[3px] border text-[13px] transition-colors ${
                  (stakedGame ? "random" : setup.color) === color
                    ? "border-[#629924] bg-[#34451f] text-white"
                    : "border-white/10 bg-[#262421] text-white/62 hover:border-white/22 hover:text-white/82 disabled:opacity-35"
                }`}
              >
                <SidePiece color={color} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {stakedGame ? (
            <p className="mt-1.5 text-[11px] text-white/38">
              Paid games assign your colour randomly.
            </p>
          ) : null}
        </fieldset>

        {cashier.configured ? (
          <fieldset>
            <legend className="mb-3 text-[14px] font-semibold text-white/86">
              Stake against Stockfish <span className="font-normal text-white/38">(optional)</span>
            </legend>
            {stakingAllowed ? (
              <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <label className="block">
                  <span className="sr-only">Computer stake in USD</span>
                  <div className="flex h-11 items-center rounded-[3px] border border-white/10 bg-[#262421] px-3">
                    <input
                      aria-label="Computer stake in USD"
                      inputMode="decimal"
                      value={stake}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (/^\d*\.?\d{0,6}$/.test(value)) setStake(value);
                      }}
                      placeholder="0"
                      className="tnum min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/28"
                    />
                    <span className="text-[11px] font-semibold text-white/44">USD</span>
                  </div>
                  <span
                    className={`mt-1 block text-[10.5px] ${stakeOverBalance || stakeInvalid ? "text-down" : "text-white/36"}`}
                  >
                    {stakeInvalid
                      ? "Enter a stake greater than 0 USDC."
                      : `Balance ${cashier.available} USD`}
                  </span>
                </label>
                {stakeUsdc && wagerBreakdown ? (
                  <div>
                    <ComputerWagerSummary
                      stakeUsdc={stakeUsdc}
                      availableUsdc={cashier.available}
                      level={setup.level}
                      showDrawPayout
                      chessLevelEightTerms
                    />
                    <p className="mt-1.5 text-[10.5px] leading-4 text-white/36">
                      A reviewed win pays 2x your stake. A draw or loss forfeits your stake to the
                      computer. An abort or system cancellation returns 100%. After engine analysis,
                      every win stays held until a moderator clears it. An approved win is credited
                      to your chess balance and waits there if the cashier wallet needs funding.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11.5px] leading-5 text-white/42">
                    Leave blank for a free game. Hints are disabled whenever money is at stake.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-[3px] border border-white/10 bg-[#262421] px-4 py-3 text-[12px] leading-5 text-white/48">
                Levels 1 to 4 are free-only. Levels 5 to 8 accept stakes, and every paid choice uses
                the maximum-strength level-8 engine.
              </p>
            )}
          </fieldset>
        ) : null}
      </div>

      <div
        data-testid="computer-game-setup-actions"
        className="flex shrink-0 justify-center px-6 py-5"
      >
        <button
          type="button"
          onClick={() => void onPlay()}
          disabled={
            create.isPending ||
            stakeOverBalance ||
            stakeInvalid ||
            (!stakedGame && setup.timeMode === "real_time" && !realTimeValid)
          }
          className="h-12 cursor-pointer rounded-[3px] border border-white/12 bg-[#3a3936] px-6 text-[15px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-[#454441] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {create.isPending ? "Starting..." : "Play against computer"}
        </button>
      </div>
    </ModalShell>
  );
}
