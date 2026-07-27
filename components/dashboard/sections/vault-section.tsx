"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { formatEther } from "viem";
import { Eyebrow } from "@/components/ui/eyebrow";
import { LockIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useMoney } from "@/components/ui/currency-select";
import { useVaultGame } from "@/hooks/use-vault-game";
import { useVaultActions } from "@/hooks/use-vault-actions";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fetchPendingWinnings } from "@/lib/vault-api";
import { getWalletAddress } from "@/lib/user";
import { truncateAddress } from "@/lib/format";
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
// resetting whenever a fresh value arrives from the socket or REST poll. The
// reset happens during render (comparing against the last seen server value)
// rather than in an effect, so a fresh push shows instantly instead of one
// render behind.
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

function formatWeiEth(wei: string): string {
  try {
    return `${Number(formatEther(BigInt(wei))).toFixed(4)} ETH`;
  } catch {
    return "—";
  }
}

export function VaultSection() {
  const { user } = usePrivy();
  const money = useMoney();
  const { refetch: refetchPortfolio } = usePortfolio();
  const { status, statusLoading, activities, winners, winnersLoading, connected } = useVaultGame();
  const { wager, wagering, claim, claiming } = useVaultActions();

  const address = getWalletAddress(user, "ethereum");
  const pending = useQuery({
    queryKey: ["vault-pending-winnings", address],
    queryFn: () => fetchPendingWinnings(address as string),
    enabled: Boolean(address),
    staleTime: PENDING_POLL_MS,
    refetchInterval: PENDING_POLL_MS,
  });

  // Gotcha: a paused game reports a huge sentinel timeRemaining, not a real
  // countdown — only trust it while gameActive is true.
  const gameActive = status?.gameActive ?? false;
  const countdown = useCountdown(status?.timeRemaining ?? 0, gameActive);
  const timerPct =
    gameActive && status ? Math.min(100, (countdown / Math.max(1, status.timerDuration)) * 100) : 0;

  const hasPending = (pending.data?.usdValue ?? 0) > 0;

  const onWager = async () => {
    try {
      await wager();
      toast.success("Wager placed — you're now the last player.");
      void refetchPortfolio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The wager wasn't sent.");
    }
  };

  const onClaim = async () => {
    try {
      await claim();
      toast.success("Winnings claimed to your wallet.");
      void refetchPortfolio();
      void pending.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The claim wasn't sent.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Vault</Eyebrow>
          <h2 className="ws-serif mt-2.5 text-[30px] tracking-[-0.02em]">Last Standing</h2>
          <p className="mt-1.5 max-w-[52ch] text-[13.5px] font-normal text-white/55">
            Wager to become the last player. If the clock runs out before anyone else wagers, you
            take the vault.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-white/60">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-up" : "bg-white/25"}`} />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 min-[980px]:grid-cols-[1fr_380px] min-[980px]:items-start">
        <div className="ws-card p-5 sm:p-[26px]">
          <div className="text-[13px] font-normal text-white/60">Vault balance</div>
          {statusLoading || !status ? (
            <div className="mt-2 h-[52px] w-44 animate-pulse rounded-xl bg-white/8" />
          ) : (
            <div className="ws-serif tnum mt-2 text-[clamp(36px,5vw,52px)] leading-none tracking-[-0.02em]">
              {money.format(status.vaultBalance.usdValue)}
            </div>
          )}
          {status ? (
            <div className="tnum mt-1 text-[13px] font-normal text-white/45">
              {status.vaultBalance.amount} {status.vaultBalance.tokenSymbol}
            </div>
          ) : null}

          <div className="mt-6">
            {gameActive ? (
              <>
                <div className="mb-2 flex items-center justify-between text-[13px] font-normal text-white/55">
                  <span>Time remaining</span>
                  <span className="tnum text-white">{formatCountdown(countdown)}</span>
                </div>
                <ProgressBar pct={timerPct} color={countdown <= 10 ? "#F6A5A5" : "#A78BFA"} />
              </>
            ) : (
              <div className="border-down/25 bg-down/10 rounded-[14px] border px-4 py-3 text-[12.5px] font-normal text-white/70">
                {status?.isGameStarted
                  ? "This round has ended. Waiting for the next one."
                  : "Waiting for the first wager to start the round."}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between text-[13px] font-normal text-white/55">
            <span>Last player</span>
            <span className="tnum text-white/85">
              {status?.lastPlayer ? truncateAddress(status.lastPlayer) : "None yet"}
            </span>
          </div>

          <button
            onClick={() => void onWager()}
            disabled={wagering || !status || !address}
            className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wagering
              ? "Placing wager…"
              : status
                ? `Wager ${status.entryFee.amount} ${status.entryFee.tokenSymbol} (${status.entryFee.formattedUsd})`
                : "Loading…"}
          </button>

          {hasPending ? (
            <div className="border-accent/20 bg-accent/8 mt-3 rounded-[14px] border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-medium text-white">You have winnings</div>
                  <div className="tnum text-[12.5px] font-normal text-white/60">
                    {pending.data?.amount} {pending.data?.tokenSymbol} ({pending.data?.formattedUsd}
                    )
                  </div>
                </div>
                <button
                  onClick={() => void onClaim()}
                  disabled={claiming}
                  className="text-ink shrink-0 cursor-pointer rounded-xl bg-white px-4 py-2 font-sans text-[13px] font-semibold whitespace-nowrap hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {claiming ? "Claiming…" : "Claim"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <div className="ws-card p-5">
            <div className="text-[13px] font-normal text-white/60">Recent activity</div>
            {activities.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-[13px] font-normal text-white/40">
                No wagers yet
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {activities.map((a) => (
                  <a
                    key={a.id}
                    href={`${EXPLORER_TX_URL}${a.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1 hover:bg-white/4"
                  >
                    <span className="min-w-0 truncate text-[13px] font-normal text-white/75">
                      {a.action === "won" ? "🏆 " : ""}
                      <span className="tnum">{truncateAddress(a.address)}</span>{" "}
                      {a.action === "won" ? "won" : "wagered"}
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] font-normal text-white/55">
                      {formatWeiEth(a.amountWei)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="ws-card p-5">
            <div className="flex items-center gap-2 text-[13px] font-normal text-white/60">
              <LockIcon size={14} />
              Hall of Kings
            </div>
            {winnersLoading ? (
              <div className="mt-3 flex flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[38px] animate-pulse rounded-[10px] bg-white/6" />
                ))}
              </div>
            ) : winners.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-[13px] font-normal text-white/40">
                No rounds settled yet
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {winners.map((w) => (
                  <a
                    key={w.id}
                    href={`${EXPLORER_ADDRESS_URL}${w.winnerAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1 hover:bg-white/4"
                  >
                    <span className="tnum truncate text-[13px] font-normal text-white/75">
                      {truncateAddress(w.winnerAddress)}
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] font-normal text-white/55">
                      {formatWeiEth(w.winnerPrizeWei)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
