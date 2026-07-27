"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { formatEther } from "viem";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LockIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModalShell } from "@/components/ui/modal-shell";
import { useMoney } from "@/components/ui/currency-select";
import { VaultFundSheet } from "@/components/dashboard/vault/vault-fund-sheet";
import { useVaultGame } from "@/hooks/use-vault-game";
import { useVaultActions } from "@/hooks/use-vault-actions";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fetchPendingWinnings } from "@/lib/vault-api";
import { getWalletAddress } from "@/lib/user";
import { truncateAddress } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const EXPLORER_TX_URL = "https://basescan.org/tx/";
const EXPLORER_ADDRESS_URL = "https://basescan.org/address/";
const PENDING_POLL_MS = 15_000;

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Ticks a server-reported "seconds remaining" down locally between updates,
// resetting whenever a fresh value arrives from the socket or REST poll.
function useCountdown(serverSeconds: number, active: boolean): number {
  const [lastServerSeconds, setLastServerSeconds] = useState(serverSeconds);
  const [seconds, setSeconds] = useState(serverSeconds);

  if (serverSeconds !== lastServerSeconds) {
    setLastServerSeconds(serverSeconds);
    setSeconds(serverSeconds);
  }

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

export function VaultSection() {
  const { user } = usePrivy();
  const money = useMoney();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const { status, statusLoading, activities, winners, winnersLoading, connected } = useVaultGame();
  const { wager, wagering, claim, claiming } = useVaultActions();
  const [fundOpen, setFundOpen] = useState(false);

  const address = getWalletAddress(user, "ethereum");
  const pending = useQuery({
    queryKey: ["vault-pending-winnings", address],
    queryFn: () => fetchPendingWinnings(address as string),
    enabled: Boolean(address),
    staleTime: PENDING_POLL_MS,
    refetchInterval: PENDING_POLL_MS,
  });

  // The balance the player spends from is their own money on the platform. We
  // present everything as plain dollars — the underlying asset (ETH on Base)
  // is never shown, so it feels like moving cash between accounts.
  const ethHolding = tokens.find(
    (t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "ETH"
  );
  const balanceEth = ethHolding?.balance ?? 0;
  const balanceUsd = ethHolding?.valueUsd ?? 0;
  const entryFeeEth = status ? Number(status.entryFee.amount) : 0;
  const entryFeeUsd = status?.entryFee.usdValue ?? 0;
  const canPlay = entryFeeEth > 0 && balanceEth >= entryFeeEth;

  // Dollar value of an on-chain (wei) amount, derived from the entry fee's
  // token/USD pair the backend already gives us — so the activity feed and
  // winners read in money, not crypto.
  const unitUsd = status && entryFeeEth > 0 ? entryFeeUsd / entryFeeEth : 0;
  const weiToMoney = (wei: string): string => {
    try {
      return money.format(Number(formatEther(BigInt(wei))) * unitUsd);
    } catch {
      return "—";
    }
  };

  // Only trust timeRemaining while a round is live; between rounds the backend
  // reports a sentinel, so the timer rests at the round length instead.
  const gameActive = status?.gameActive ?? false;
  const countdown = useCountdown(status?.timeRemaining ?? 0, gameActive);
  const timerPct =
    gameActive && status ? Math.min(100, (countdown / Math.max(1, status.timerDuration)) * 100) : 0;
  const urgent = gameActive && countdown <= 10;

  const hasPending = (pending.data?.usdValue ?? 0) > 0;

  const onPlay = async () => {
    if (!canPlay) {
      setFundOpen(true);
      return;
    }
    try {
      await wager();
      toast.success("You're in — last one standing takes the pot.");
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, "That didn't go through."));
    }
  };

  const onClaim = async () => {
    try {
      await claim();
      toast.success("Winnings added to your balance.");
      void refetchPortfolio();
      void pending.refetch();
    } catch (e) {
      toast.error(friendlyError(e, "The claim didn't go through."));
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* Playful layered glow behind the arena, for an arcade-y feel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[520px] max-w-[1000px] bg-[radial-gradient(55%_55%_at_50%_0%,rgba(167,139,250,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-[12%] -z-10 h-64 w-64 animate-pulse rounded-full bg-[#7CE7B0]/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="bg-accent/15 pointer-events-none absolute -top-16 right-[10%] -z-10 h-72 w-72 animate-pulse rounded-full blur-[120px]"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Vault · Winner takes all</Eyebrow>
          <h2 className="ws-serif mt-2.5 bg-[linear-gradient(180deg,#ffffff,#cbbcff)] bg-clip-text text-[clamp(30px,4.4vw,40px)] tracking-[-0.02em] text-transparent">
            Last Standing
          </h2>
          <p className="mt-1.5 max-w-[54ch] text-[13.5px] font-normal text-white/55">
            Play to become the last one standing. When the timer runs out, the last player to play
            takes the whole pot.
          </p>
        </div>
        <span
          className={`ws-glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-white/75 ${
            connected ? "shadow-[0_0_24px_-8px_rgba(124,231,176,0.7)]" : ""
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-up animate-pulse" : "bg-white/25"}`}
          />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 min-[980px]:grid-cols-[1fr_360px] min-[980px]:items-start">
        {/* Game panel */}
        <div className="ws-glass relative overflow-hidden rounded-[26px] p-5 shadow-[0_40px_120px_-50px_rgba(167,139,250,0.55)] sm:p-7">
          <div
            aria-hidden
            className="bg-accent/30 pointer-events-none absolute -top-32 left-1/2 h-64 w-72 -translate-x-1/2 animate-pulse rounded-full blur-[100px]"
          />
          <div className="relative">
            <div className="text-accent/80 text-[11px] font-semibold tracking-[0.18em] uppercase">
              Prize pool
            </div>
            {statusLoading || !status ? (
              <div className="mt-2 h-[62px] w-52 animate-pulse rounded-xl bg-white/8" />
            ) : (
              <div className="ws-serif tnum mt-1.5 bg-[linear-gradient(180deg,#ffffff,#cbbcff)] bg-clip-text text-[clamp(48px,8vw,72px)] leading-none tracking-[-0.02em] text-transparent drop-shadow-[0_0_30px_rgba(167,139,250,0.35)]">
                {money.format(status.vaultBalance.usdValue)}
              </div>
            )}
            <div className="mt-2 text-[13px] font-normal text-white/50">
              The whole pot goes to the last player standing.
            </div>

            {/* Countdown — the arcade centerpiece. */}
            <div
              className={`relative mt-6 overflow-hidden rounded-[20px] border px-4 py-5 transition-colors sm:px-5 ${
                gameActive
                  ? urgent
                    ? "border-down/40 bg-down/10"
                    : "border-accent/30 bg-accent/8"
                  : "border-white/8 bg-black/35"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-white/45 uppercase">
                  Time remaining
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    gameActive
                      ? urgent
                        ? "bg-down/15 text-down"
                        : "bg-accent/15 text-accent"
                      : "bg-white/6 text-white/45"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      gameActive
                        ? urgent
                          ? "bg-down animate-ping"
                          : "bg-accent animate-pulse"
                        : "bg-white/30"
                    }`}
                  />
                  {gameActive
                    ? urgent
                      ? "Ending"
                      : "Live round"
                    : status?.isGameStarted
                      ? "Round ended"
                      : "Idle"}
                </span>
              </div>
              <div
                className={`ws-serif tnum mt-3 text-center text-[clamp(52px,11vw,76px)] leading-none tracking-[-0.01em] ${
                  gameActive
                    ? urgent
                      ? "text-down animate-pulse drop-shadow-[0_0_28px_rgba(246,165,165,0.5)]"
                      : "text-white drop-shadow-[0_0_26px_rgba(167,139,250,0.45)]"
                    : "text-white/30"
                }`}
              >
                {gameActive
                  ? formatCountdown(countdown)
                  : formatCountdown(status?.timerDuration ?? 0)}
              </div>
              <div className="mt-4">
                <ProgressBar
                  pct={gameActive ? timerPct : 0}
                  color={urgent ? "#F6A5A5" : "#A78BFA"}
                />
              </div>
              <div className="mt-3 text-center text-[12px] font-normal text-white/50">
                {gameActive
                  ? "Be the last to play when the clock hits zero to take the pot."
                  : status?.isGameStarted
                    ? "Round ended — the next play starts the clock."
                    : "Be the first to play and start the clock."}
              </div>
            </div>

            {/* Meta row */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="ws-inset px-4 py-3.5">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  Last player
                </div>
                <div className="tnum mt-1 text-[13.5px] font-semibold text-white/85">
                  {status?.lastPlayer ? truncateAddress(status.lastPlayer) : "None yet"}
                </div>
              </div>
              <div className="ws-inset px-4 py-3.5">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  Cost to play
                </div>
                <div className="tnum mt-1 text-[13.5px] font-semibold text-white/85">
                  {status ? money.format(entryFeeUsd) : "—"}
                </div>
              </div>
            </div>

            {/* Play CTA — the primary action, with an inviting glow when ready. */}
            <div className="relative mt-5">
              {canPlay ? (
                <div
                  aria-hidden
                  className="bg-accent/40 pointer-events-none absolute -inset-1 animate-pulse rounded-2xl blur-lg"
                />
              ) : null}
              <button
                onClick={() => void onPlay()}
                disabled={wagering || !status || !address}
                className={`relative w-full cursor-pointer rounded-2xl p-4 font-sans text-[16.5px] font-bold transition-[transform,opacity] hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${
                  canPlay
                    ? "bg-[linear-gradient(180deg,#c3b0ff,#8b6ef0)] text-white shadow-[0_18px_44px_-12px_rgba(167,139,250,0.9),inset_0_1px_0_rgba(255,255,255,0.45)]"
                    : "text-ink bg-white shadow-[0_12px_32px_-14px_rgba(255,255,255,0.5)]"
                }`}
              >
                {wagering
                  ? "Placing your play…"
                  : !status
                    ? "Loading…"
                    : canPlay
                      ? `Play · ${money.format(entryFeeUsd)}`
                      : "Add money to play"}
              </button>
            </div>

            {/* Balance */}
            <div className="ws-inset mt-3 flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  Your balance
                </div>
                <div className="tnum mt-0.5 text-[16px] font-bold text-white/90">
                  {money.format(balanceUsd)}
                </div>
              </div>
              <button
                onClick={() => setFundOpen(true)}
                className="border-accent/40 bg-accent/14 text-accent hover:bg-accent/22 shrink-0 cursor-pointer rounded-xl border px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap transition-colors"
              >
                Add money
              </button>
            </div>

            {/* Winnings to claim */}
            {hasPending ? (
              <div className="border-up/40 bg-up/10 mt-3 rounded-[16px] border px-4 py-3.5 shadow-[0_0_28px_-10px_rgba(124,231,176,0.6)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13.5px] font-bold text-white">You won a round 🎉</div>
                    <div className="tnum text-[12.5px] font-normal text-white/60">
                      {money.format(pending.data?.usdValue ?? 0)} ready to claim
                    </div>
                  </div>
                  <button
                    onClick={() => void onClaim()}
                    disabled={claiming}
                    className="text-up-ink bg-up shrink-0 cursor-pointer rounded-xl px-4 py-2.5 font-sans text-[13px] font-bold whitespace-nowrap transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {claiming ? "Claiming…" : "Claim"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <div className="ws-glass rounded-[22px] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white/80">Recent activity</span>
              <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/40">
                Live feed
              </span>
            </div>
            {activities.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-[13px] font-normal text-white/40">
                No plays yet
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {activities.map((a) => (
                  <a
                    key={a.id}
                    href={`${EXPLORER_TX_URL}${a.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-white/6"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-[13px] font-normal text-white/75">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] ${
                          a.action === "won" ? "bg-up/15 text-up" : "bg-accent/15 text-accent"
                        }`}
                      >
                        {a.action === "won" ? "★" : "↑"}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="tnum">{truncateAddress(a.address)}</span>{" "}
                        {a.action === "won" ? "won" : "played"}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] font-semibold text-white/65">
                      {weiToMoney(a.amountWei)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="ws-glass rounded-[22px] p-5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
              <LockIcon size={14} />
              Hall of Winners
            </div>
            {winnersLoading ? (
              <div className="mt-3 flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[42px] animate-pulse rounded-[10px] bg-white/6" />
                ))}
              </div>
            ) : winners.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-[13px] font-normal text-white/40">
                No rounds settled yet
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {winners.map((w, i) => (
                  <a
                    key={w.id}
                    href={`${EXPLORER_ADDRESS_URL}${w.winnerAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-white/6"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 text-[13px] font-normal text-white/75">
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                          i === 0 ? "bg-accent/20 text-accent" : "bg-white/6 text-white/45"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="tnum truncate">{truncateAddress(w.winnerAddress)}</span>
                    </span>
                    <span className="tnum text-accent shrink-0 text-[12.5px] font-semibold">
                      {weiToMoney(w.winnerPrizeWei)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ModalShell open={fundOpen} onClose={() => setFundOpen(false)} contentKey="vault-fund">
        <VaultFundSheet onClose={() => setFundOpen(false)} />
      </ModalShell>
    </div>
  );
}
