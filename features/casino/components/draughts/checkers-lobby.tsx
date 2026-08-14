"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/features/casino/lib/api/cashier";
import { createMatch } from "@/features/casino/lib/api/draughts";
import {
  DRAUGHTS_MINUTE_OPTIONS,
  draughtsTimeControl,
  type DraughtsMinuteChoice,
} from "@/features/casino/lib/draughts/clocks";
import {
  DRAUGHTS_VARIANT_OPTIONS,
  type PlayableDraughtsVariant,
} from "@/features/casino/lib/draughts/variants";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const STAKES = [null, "1", "5", "10"] as const;

export function CheckersLobby() {
  const router = useRouter();
  const { address } = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const [clock, setClock] = useState<DraughtsMinuteChoice>(5);
  const [customMinutes, setCustomMinutes] = useState("20");
  const [variant, setVariant] = useState<PlayableDraughtsVariant>("standard");
  const [allowTimeExtensions, setAllowTimeExtensions] = useState(false);
  const [stakeInput, setStakeInput] = useState("");
  const [creating, setCreating] = useState(false);

  const timeControl = draughtsTimeControl(clock, customMinutes);
  const stake = normalizeUsdcAmount(stakeInput);
  const typedStake = stakeInput.trim().length > 0;
  const stakeInvalid = typedStake && stake === null;
  const short = !!stake && exceedsUsdcBalance(stake, cashier.available);
  const blocked = !timeControl || stakeInvalid || short;

  const create = async () => {
    if (!address) {
      toast.error("Sign in to start a game.");
      return;
    }
    if (!timeControl) {
      toast.error("Choose a clock from 1 to 180 minutes.");
      return;
    }
    setCreating(true);
    try {
      const match = await createMatch(
        {
          timeControl,
          variant,
          stakeUsdc: stake,
          allowTimeExtensions: allowTimeExtensions && !stake,
        },
        address
      );
      if (stake) track("game_staked", { game: "checkers", amount_usd: Number(stake) });
      router.push(`/casino/checkers/play?match=${match.id}`);
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't start that game."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[620px] px-4 py-7">
      <section className="overflow-hidden rounded-[5px] border border-white/12 bg-[linear-gradient(145deg,#242629,#111214)] shadow-[0_18px_50px_rgba(0,0,0,.4)]">
        <header className="border-b border-white/10 px-5 py-5 text-center">
          <h1 className="text-[22px] font-semibold text-white/90">Create a game</h1>
          <p className="mt-1 text-[12px] text-white/38">Choose the rules, clock and side.</p>
        </header>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          <label className="block">
            <span className="mb-2 block text-[12px] font-semibold tracking-[0.08em] text-white/42 uppercase">
              Variant
            </span>
            <select
              value={variant}
              onChange={(event) => setVariant(event.target.value as PlayableDraughtsVariant)}
              className="h-11 w-full rounded-[4px] border border-white/12 bg-[#171819] px-3 text-[13px] text-white/82 outline-none focus:border-white/32"
            >
              {DRAUGHTS_VARIANT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-white/42 uppercase">
              Minutes per side
            </legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {DRAUGHTS_MINUTE_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setClock(minutes)}
                  className={`h-14 rounded-[4px] border text-center transition-colors ${
                    clock === minutes
                      ? "border-white/55 bg-white/12 text-white"
                      : "border-white/10 bg-white/[0.025] text-white/48 hover:border-white/22"
                  }`}
                >
                  <strong className="block text-[16px] font-medium">{minutes}</strong>
                  <span className="text-[9px] tracking-[0.08em] uppercase">min</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setClock("custom")}
                className={`h-14 rounded-[4px] border text-[11px] font-semibold uppercase transition-colors ${
                  clock === "custom"
                    ? "border-white/55 bg-white/12 text-white"
                    : "border-white/10 bg-white/[0.025] text-white/48 hover:border-white/22"
                }`}
              >
                Custom
              </button>
            </div>
            {clock === "custom" ? (
              <label className="mt-3 flex h-10 items-center rounded-[4px] border border-white/12 bg-black/15 px-3">
                <input
                  inputMode="numeric"
                  value={customMinutes}
                  onChange={(event) =>
                    setCustomMinutes(event.target.value.replace(/\D/gu, "").slice(0, 3))
                  }
                  aria-label="Custom minutes per side"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-white outline-none"
                />
                <span className="text-[11px] text-white/35">minutes, no increment</span>
              </label>
            ) : null}
          </fieldset>

          {cashier.configured ? (
            <fieldset>
              <legend className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-white/42 uppercase">
                Optional stake
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {STAKES.map((amount) => (
                  <button
                    key={amount ?? "free"}
                    type="button"
                    onClick={() => setStakeInput(amount ?? "")}
                    className={`h-10 rounded-[4px] border text-[11px] ${
                      (amount ?? "") === (stake ?? "")
                        ? "border-white/55 bg-white/12 text-white"
                        : "border-white/10 text-white/45"
                    }`}
                  >
                    {amount ? `$${amount}` : "Free"}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex h-10 items-center rounded-[4px] border border-white/12 bg-black/15 px-3">
                <input
                  value={stakeInput}
                  onChange={(event) => setStakeInput(event.target.value.replace(/[^0-9.]/gu, ""))}
                  inputMode="decimal"
                  placeholder="Custom stake"
                  aria-label="Stake amount in USDC"
                  className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-white outline-none placeholder:text-white/25"
                />
                <span className="text-[11px] text-white/35">USDC</span>
              </label>
              <p
                className={`mt-1 text-[10px] ${stakeInvalid || short ? "text-red-400" : "text-white/30"}`}
              >
                {stakeInvalid
                  ? "Enter a valid amount."
                  : short
                    ? `Balance ${cashier.available} USDC.`
                    : `Balance ${cashier.available} USDC.`}
              </p>
            </fieldset>
          ) : null}

          <button
            type="button"
            role="switch"
            aria-checked={allowTimeExtensions && !stake}
            disabled={!!stake}
            onClick={() => setAllowTimeExtensions((allowed) => !allowed)}
            className="flex w-full items-center justify-between gap-4 rounded-[4px] border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left disabled:opacity-35"
          >
            <span>
              <strong className="block text-[12px] text-white/72">Allow time extensions</strong>
              <span className="mt-0.5 block text-[10px] leading-4 text-white/34">
                Available only in free games.
              </span>
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full ${allowTimeExtensions && !stake ? "bg-white" : "bg-white/14"}`}
            >
              <span
                className={`absolute top-1 h-3 w-3 rounded-full ${allowTimeExtensions && !stake ? "translate-x-5 bg-black" : "translate-x-1 bg-white/70"}`}
              />
            </span>
          </button>
        </div>

        <footer className="border-t border-white/10 bg-black/18 px-5 py-4">
          <button
            type="button"
            disabled={creating || blocked}
            onClick={() => void create()}
            className="mx-auto block h-11 min-w-[220px] rounded-full bg-white px-7 text-[13px] font-semibold text-black disabled:opacity-35"
          >
            {creating ? "Creating..." : "Create game"}
          </button>
          <p className="mt-2 text-center text-[10px] text-white/28">
            {timeControl
              ? `${timeControl.replace("+0", " minutes")}, no increment.`
              : "Enter 1 to 180 minutes."}
          </p>
        </footer>
      </section>
    </main>
  );
}
