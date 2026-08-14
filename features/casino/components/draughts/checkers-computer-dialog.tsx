"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/ui/modal-shell";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/features/casino/lib/api/cashier";
import { createComputerMatch } from "@/features/casino/lib/api/draughts";
import {
  DRAUGHTS_MINUTE_OPTIONS,
  resolveDraughtsMinutes,
  type DraughtsMinuteChoice,
} from "@/features/casino/lib/draughts/clocks";
import {
  DRAUGHTS_VARIANT_OPTIONS,
  type PlayableDraughtsVariant,
} from "@/features/casino/lib/draughts/variants";
import {
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
} from "@/features/casino/lib/chess/ui";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

interface CheckersComputerDialogProps {
  open: boolean;
  onClose: () => void;
}

function Disc({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className="block h-8 w-8 rounded-full border shadow-[inset_0_-4px_8px_rgba(0,0,0,.3),0_3px_7px_rgba(0,0,0,.28)]"
      style={{
        borderColor: dark ? "rgba(0,0,0,.65)" : "rgba(105,88,55,.55)",
        background: dark
          ? "radial-gradient(circle at 32% 26%,#53535b,#27272d 52%,#0e0e12)"
          : "radial-gradient(circle at 32% 26%,#fffdf7,#eee5d2 52%,#c7b795)",
      }}
    />
  );
}

export function CheckersComputerDialog({ open, onClose }: CheckersComputerDialogProps) {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const [variant, setVariant] = useState<PlayableDraughtsVariant>("standard");
  const [level, setLevel] = useState(3);
  const [color, setColor] = useState<"white" | "black" | "random">("random");
  const [clock, setClock] = useState<DraughtsMinuteChoice>(5);
  const [customMinutes, setCustomMinutes] = useState("20");
  const [stake, setStake] = useState("");
  const [creating, setCreating] = useState(false);

  const stakeUsdc = cashier.configured ? normalizeUsdcAmount(stake) : null;
  const stakeOverBalance = !!stakeUsdc && exceedsUsdcBalance(stakeUsdc, cashier.available);
  const minutes = resolveDraughtsMinutes(clock, customMinutes);

  const play = async () => {
    if (!wallet.address) {
      toast.error("Sign in to play against the computer.");
      return;
    }
    if (minutes === null) {
      toast.error("Choose a clock from 1 to 180 minutes.");
      return;
    }
    setCreating(true);
    const toastId = toast.loading("Preparing your checkers game...");
    try {
      const match = await createComputerMatch(
        {
          level,
          color,
          variant,
          timeMode: "real_time",
          initialSeconds: minutes * 60,
          incrementSeconds: 0,
          ...(stakeUsdc ? { stakeUsdc } : {}),
        },
        wallet.address,
        stakeUsdc ? crypto.randomUUID() : undefined
      );
      toast.success("Game ready.", { id: toastId });
      onClose();
      router.push(`/casino/checkers/play?match=${match.id}`);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't start the computer game."), { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      contentKey="checkers-computer-setup"
      panelClassName={`${CHESS_MODAL_PANEL_CLASS} !flex !max-h-[min(92dvh,820px)] !flex-col !overflow-hidden !rounded-[6px] !px-0 !pt-0 !pb-0 md:!w-[min(720px,calc(100vw-32px))]`}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
    >
      <header className="shrink-0 border-b border-white/10 px-6 py-5 text-center">
        <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-white/92">
          Play against computer
        </h2>
        <p className="mt-1 text-[12px] text-white/42">Native draughts engine, levels 1 to 8</p>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-black/12 px-5 py-5 sm:px-7">
        <fieldset>
          <legend className="mb-3 text-[13px] font-semibold text-white/82">Variant</legend>
          <select
            value={variant}
            onChange={(event) => setVariant(event.target.value as PlayableDraughtsVariant)}
            className="h-11 w-full rounded-[4px] border border-white/12 bg-[#171819] px-3 text-[13px] text-white/82 outline-none focus:border-white/32"
          >
            {DRAUGHTS_VARIANT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.board})
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] leading-4 text-white/38">
            {DRAUGHTS_VARIANT_OPTIONS.find((option) => option.id === variant)?.description}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[13px] font-semibold text-white/82">Strength</legend>
          <div className="grid grid-cols-8 overflow-hidden rounded-[4px] border border-white/10">
            {LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLevel(value)}
                className={`tnum h-10 border-r border-white/10 text-[13px] last:border-r-0 ${
                  level === value
                    ? "bg-white text-black"
                    : "bg-white/[0.025] text-white/62 hover:bg-white/8"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[13px] font-semibold text-white/82">Minutes per side</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {DRAUGHTS_MINUTE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setClock(value)}
                className={`h-12 rounded-[4px] border text-center ${
                  clock === value
                    ? "border-white/55 bg-white/10 text-white"
                    : "border-white/10 bg-white/[0.025] text-white/48"
                }`}
              >
                <strong className="block text-[14px] font-medium">{value}</strong>
                <span className="text-[8px] tracking-[0.08em] uppercase">min</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setClock("custom")}
              className={`h-12 rounded-[4px] border text-[10px] font-semibold uppercase ${
                clock === "custom"
                  ? "border-white/55 bg-white/10 text-white"
                  : "border-white/10 bg-white/[0.025] text-white/48"
              }`}
            >
              Custom
            </button>
          </div>
          {clock === "custom" ? (
            <label className="mt-3 flex h-10 items-center rounded-[4px] border border-white/10 bg-white/[0.025] px-3">
              <input
                inputMode="numeric"
                value={customMinutes}
                onChange={(event) =>
                  setCustomMinutes(event.target.value.replace(/\D/gu, "").slice(0, 3))
                }
                aria-label="Custom minutes per side"
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-white outline-none"
              />
              <span className="text-[10px] text-white/32">minutes, no increment</span>
            </label>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[13px] font-semibold text-white/82">Your side</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["black", "random", "white"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setColor(side)}
                className={`flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-[4px] border text-[12px] capitalize ${
                  color === side
                    ? "border-white/55 bg-white/9 text-white"
                    : "border-white/10 bg-white/[0.025] text-white/48"
                }`}
              >
                {side === "random" ? (
                  <span className="flex -space-x-2">
                    <Disc dark />
                    <Disc />
                  </span>
                ) : (
                  <Disc dark={side === "black"} />
                )}
                {side}
              </button>
            ))}
          </div>
        </fieldset>

        {cashier.configured ? (
          <label className="block">
            <span className="mb-2 block text-[13px] font-semibold text-white/82">
              Stake against the engine <span className="font-normal text-white/34">(optional)</span>
            </span>
            <div className="flex h-11 items-center rounded-[4px] border border-white/10 bg-white/[0.025] px-3">
              <input
                inputMode="decimal"
                value={stake}
                onChange={(event) => {
                  if (/^\d*\.?\d{0,6}$/.test(event.target.value)) setStake(event.target.value);
                }}
                placeholder="0"
                className="tnum min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none"
              />
              <span className="text-[11px] font-semibold text-white/38">USDC</span>
            </div>
            <span
              className={`mt-1 block text-[10.5px] ${stakeOverBalance ? "text-down" : "text-white/32"}`}
            >
              Balance {cashier.available} USDC. Hints are unavailable for staked games.
            </span>
          </label>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-black/20 px-6 py-4">
        <button
          type="button"
          onClick={() => void play()}
          disabled={creating || stakeOverBalance || minutes === null}
          className="text-ink mx-auto block h-11 min-w-[210px] rounded-full bg-white px-6 text-[14px] font-semibold disabled:opacity-40"
        >
          {creating ? "Starting..." : "Play against computer"}
        </button>
      </footer>
    </ModalShell>
  );
}
