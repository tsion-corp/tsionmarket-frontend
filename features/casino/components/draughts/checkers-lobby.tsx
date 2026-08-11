"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useDraughtsLobby } from "@/features/casino/hooks/use-draughts-match";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { createMatch } from "@/features/casino/lib/api/draughts";
import { exceedsUsdcBalance, normalizeUsdcAmount } from "@/features/casino/lib/api/cashier";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// The per-move budgets offered. The service holds an equal base and increment,
// so each of these is "about this long to make every move" rather than a bank
// that runs down across the game.
const TIME_CONTROLS = ["15s", "30s", "1m", "2m"] as const;

// Per-player stakes. Both sides lock the same amount at create and join; a draw
// or an abort refunds, and a decisive result pays the winner minus the platform
// fee. "Free" sends no wager at all rather than a zero one.
const STAKES = [null, "1", "5", "10"] as const;

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function CheckersLobby() {
  const router = useRouter();
  const { address } = useCasinoWallet();
  const wallet = address ?? null;

  const { challenges, mine, error } = useDraughtsLobby(wallet);
  const cashier = useChessCashierStatus();
  const [timeControl, setTimeControl] = useState<string>("30s");
  // The amount as typed. Empty means a free game; the presets below just fill
  // this in, so a player can take a shortcut or name their own figure.
  const [stakeInput, setStakeInput] = useState("");
  const [creating, setCreating] = useState(false);

  // Parsed in exact base units, never floating point: this is the figure that
  // gets locked. Null when the box is empty or the text is not a valid amount.
  const stake = normalizeUsdcAmount(stakeInput);
  const typed = stakeInput.trim().length > 0;
  const stakeInvalid = typed && stake === null;
  // A staked game locks the stake the moment it is created, so an unaffordable
  // one is blocked here rather than failing upstream after the click.
  const short = !!stake && exceedsUsdcBalance(stake, cashier.available);
  const blocked = stakeInvalid || short;

  const create = async () => {
    if (!wallet) {
      toast.error("Sign in to start a game.");
      return;
    }
    setCreating(true);
    try {
      const match = await createMatch({ timeControl, stakeUsdc: stake }, wallet);
      router.push(`/casino/checkers/play?match=${match.id}`);
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't start that game."));
    } finally {
      setCreating(false);
    }
  };

  const openMatch = (id: string) => router.push(`/casino/checkers/play?match=${id}`);

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pb-12">
      <header className="pt-2 pb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-sans text-[22px] font-semibold text-white">Checkers</h1>
          <Link
            href="/casino/checkers/tournaments"
            className="shrink-0 rounded-[12px] border border-white/15 px-3.5 py-1.5 font-sans text-[13px] text-white/70 hover:bg-white/5"
          >
            Tournaments
          </Link>
        </div>
        <p className="mt-1 font-sans text-[13px] text-white/50">
          International draughts on a 10×10 board. Captures are compulsory, and you always have to
          take the longest one available.
        </p>
      </header>

      {/* The balance sits above the form, so a short wallet is topped up before
          picking a stake rather than after the create button refuses. */}
      <div className="mb-4">
        <ChessCashierLauncher compact />
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 font-sans text-[12px] tracking-wide text-white/40 uppercase">
          New game
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIME_CONTROLS.map((label) => (
            <button
              key={label}
              onClick={() => setTimeControl(label)}
              className={`cursor-pointer rounded-[12px] border px-4 py-2 font-sans text-[14px] transition-colors ${
                timeControl === label
                  ? "border-white/70 bg-white/10 text-white"
                  : "border-white/12 text-white/60 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {cashier.configured ? (
          <>
            <h2 className="mb-3 font-sans text-[12px] tracking-wide text-white/40 uppercase">
              Stake
            </h2>
            <div className="mb-2.5 flex flex-wrap gap-2">
              {STAKES.map((amount) => (
                <button
                  key={amount ?? "free"}
                  onClick={() => setStakeInput(amount ?? "")}
                  className={`cursor-pointer rounded-[12px] border px-4 py-2 font-sans text-[14px] transition-colors ${
                    (amount ?? "") === (stake ?? "")
                      ? "border-white/70 bg-white/10 text-white"
                      : "border-white/12 text-white/60 hover:bg-white/5"
                  }`}
                >
                  {amount ? `${amount} USDC` : "Free"}
                </button>
              ))}
            </div>

            {/* Any amount, not just the shortcuts above. */}
            <div className="mb-1.5 flex items-center gap-2">
              <input
                value={stakeInput}
                onChange={(event) => setStakeInput(event.target.value.replace(/[^0-9.]/gu, ""))}
                inputMode="decimal"
                placeholder="Or enter an amount"
                aria-label="Stake amount in USDC"
                className="min-w-0 flex-1 rounded-[12px] border border-white/12 bg-transparent px-3 py-2 font-mono text-[14px] text-white tabular-nums placeholder:font-sans placeholder:text-white/25 focus:border-white/30 focus:outline-none"
              />
              <span className="shrink-0 font-sans text-[13px] text-white/40">USDC</span>
            </div>
            <p className="mb-4 font-sans text-[12px] text-white/35">
              {stakeInvalid
                ? "Enter a valid amount."
                : short
                  ? `You have ${cashier.available} USDC.`
                  : `Balance ${cashier.available} USDC`}
            </p>
          </>
        ) : null}

        <button
          disabled={creating || blocked}
          onClick={create}
          className="text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {creating
            ? "Starting…"
            : stakeInvalid
              ? "Enter a valid amount"
              : short
                ? `Need ${stake} USDC`
                : stake
                  ? `Stake ${stake} USDC & create`
                  : "Create free game"}
        </button>
        <p className="mt-2 text-center font-sans text-[12px] text-white/35">
          You get {timeControl} for every move.
          {stake
            ? ` Both players stake ${stake} USDC${cashier.feePct !== null ? `, winner takes the pot minus ${cashier.feePct}%` : ""}.`
            : ""}
        </p>
      </section>

      {mine.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 font-sans text-[12px] tracking-wide text-white/40 uppercase">
            Your games
          </h2>
          <ul className="space-y-2">
            {mine.map((match) => (
              <li key={match.id}>
                <button
                  onClick={() => openMatch(match.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-left hover:bg-white/[0.05]"
                >
                  <span className="font-sans text-[14px] text-white/85">
                    {match.state === "awaiting_opponent"
                      ? "Waiting for an opponent"
                      : "In progress"}
                  </span>
                  <span className="font-sans text-[13px] text-white/45">{match.timeControl}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 font-sans text-[12px] tracking-wide text-white/40 uppercase">
          Open seats
        </h2>
        {error ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-3 font-sans text-[13px] text-red-400">
            {error}
          </p>
        ) : challenges.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-6 text-center font-sans text-[13px] text-white/40">
            Nobody is waiting right now. Create a game and share the invite.
          </p>
        ) : (
          <ul className="space-y-2">
            {challenges.map((challenge) => (
              <li key={challenge.id}>
                <button
                  onClick={() => openMatch(challenge.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-left hover:bg-white/[0.05]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-[14px] text-white/85">
                      {challenge.creator?.username ?? "Open seat"}
                    </span>
                    <span className="font-sans text-[12px] text-white/40">
                      {relativeTime(challenge.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-sans text-[13px] text-white/70">
                      {challenge.timeControl}
                    </span>
                    {challenge.stakeUsdc ? (
                      <span className="font-sans text-[12px] text-emerald-400">
                        {challenge.stakeUsdc} USDC
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
