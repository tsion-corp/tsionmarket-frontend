"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { formatEther } from "viem";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModalShell } from "@/components/ui/modal-shell";
import { Pager } from "@/components/ui/pager";
import { MoneyTicker } from "@/components/ui/money-ticker";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { FundSheet } from "@/components/dashboard/casino/last-standing/fund-sheet";
import {
  RoundOverlay,
  type RoundPhase,
} from "@/components/dashboard/casino/last-standing/round-overlay";
import { PlayOverlay } from "@/components/dashboard/casino/last-standing/play-overlay";
import { useVaultGame } from "@/hooks/use-vault-game";
import { useVaultActions } from "@/hooks/use-vault-actions";
import { useVaultPendingWinnings } from "@/hooks/use-vault-winnings";
import { useInvalidateOnBlock } from "@/hooks/use-base-block";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePaged } from "@/hooks/use-paged";
import { getWalletAddress } from "@/lib/user";
import { timeAgo, truncateAddress } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const EXPLORER_TX_URL = "https://basescan.org/tx/";
const EXPLORER_ADDRESS_URL = "https://basescan.org/address/";
// How long to keep re-checking after a win, and how often. The settle window
// drives BOTH the game resync (status/winners/pot — so the table, pool and
// timer converge seconds after the clock dies, not on the socket's ~10s
// cadence) and the balance re-check for the credited winnings.
const WIN_POLL_WINDOW_MS = 30_000;
const WIN_POLL_INTERVAL_MS = 2_500;
// Suspense window shown to everyone the moment a round ends, before revealing
// whether this wallet won. Builds anticipation and covers the brief gap while
// the result settles.
const CALCULATING_MS = 1_200;

// On-chain-derived queries the block watcher refreshes each new Base block while
// the vault is open, so balance and claimable winnings react within ~2s.
const BLOCK_WATCH_KEYS = [["portfolio"], ["vault-winnings"]] as const;
// How many feed rows to show per page in the activity and winners cards.
const FEED_PAGE_SIZE = 10;

// Decorative sparkle field drifting behind the arena. Fixed positions/timings
// keep the layout deterministic — no per-render randomness.
const SPARKLES = [
  { left: "8%", top: "20%", size: 10, dur: 3.4, delay: 0 },
  { left: "23%", top: "64%", size: 7, dur: 4.2, delay: 0.8 },
  { left: "70%", top: "22%", size: 8, dur: 3.8, delay: 1.4 },
  { left: "89%", top: "56%", size: 11, dur: 4.6, delay: 0.4 },
  { left: "52%", top: "80%", size: 6, dur: 3.2, delay: 2.0 },
  { left: "41%", top: "12%", size: 7, dur: 4.0, delay: 1.1 },
];

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

export function LastStandingSection() {
  const t = useTranslations("casino.lastStanding");
  const { user } = usePrivy();
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const { status, statusLoading, activities, winners, winnersLoading, resyncGame } = useVaultGame();
  const { wager, wagering, claim, claiming } = useVaultActions();
  const [fundOpen, setFundOpen] = useState(false);
  // Shows the "you're in!" arcade takeover the moment a play confirms.
  const [playEntering, setPlayEntering] = useState(false);
  // End-of-round overlay: null (idle), "calculating" (5s suspense), or "won"
  // (the reveal, shown to everyone). Prize is USD, formatted to money only at
  // render. `youWon` switches the reveal from a personal jackpot to a "someone
  // won" announcement; `winnerLabel` is the winner's truncated address.
  const [phase, setPhase] = useState<RoundPhase>(null);
  const [roundPrizeUsd, setRoundPrizeUsd] = useState<number | null>(null);
  // The winner being revealed (full address, held only in memory). youWon and
  // the truncated label are derived from it at render, so the reveal has a
  // single source of truth and no state to keep in sync.
  const [revealWinner, setRevealWinner] = useState<string | null>(null);
  // Shows the "you won, balance updating" banner briefly after a win.
  const [recentWinUsd, setRecentWinUsd] = useState<number | null>(null);

  const reduce = useReducedMotion();
  const address = getWalletAddress(user, "ethereum");

  // Unclaimed winnings straight from the contract (winners take the pot via
  // claim(), it is not auto-credited). Refreshed on each new block so it clears
  // right after a claim lands.
  const { pendingWei, refetch: refetchWinnings } = useVaultPendingWinnings(address);
  useInvalidateOnBlock(BLOCK_WATCH_KEYS);

  // Derived reveal state: did this wallet win, and how to name the winner.
  const youWon = !!(
    revealWinner &&
    address &&
    revealWinner.toLowerCase() === address.toLowerCase()
  );
  const winnerLabel = revealWinner ? truncateAddress(revealWinner) : null;

  // Both feeds page 10 rows at a time so the cards don't grow unbounded.
  const pagedActivities = usePaged(activities, FEED_PAGE_SIZE);
  const pagedWinners = usePaged(winners, FEED_PAGE_SIZE);

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
  // The primary CTA is in its "Add money to play" state — short on funds but
  // otherwise pressable. This gets the blinking, coin-tagged nudge.
  const luring = !!status && !!address && !wagering && !canPlay;

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
  const weiToUsd = (wei: string): number => {
    try {
      return Number(formatEther(BigInt(wei))) * unitUsd;
    } catch {
      return 0;
    }
  };

  // The reveal amount, preferring the backend's exact winnerPrizeWei over the
  // client-captured pot snapshot — that snapshot goes stale when the final wager
  // lands right at round-end (the "$0.38 instead of $1.15" bug).
  const latestWinner = winners[0];
  const revealPrizeUsd =
    latestWinner &&
    revealWinner &&
    latestWinner.winnerAddress.toLowerCase() === revealWinner.toLowerCase()
      ? weiToUsd(latestWinner.winnerPrizeWei)
      : (roundPrizeUsd ?? 0);

  // Only trust timeRemaining while a round is live; between rounds the backend
  // reports a sentinel, so the timer rests at the round length instead.
  const gameActive = status?.gameActive ?? false;
  const countdown = useCountdown(status?.timeRemaining ?? 0, gameActive);
  const timerPct =
    gameActive && status ? Math.min(100, (countdown / Math.max(1, status.timerDuration)) * 100) : 0;
  const urgent = gameActive && countdown <= 10;

  // Round-end handling. The winner is whoever was the last to play when the
  // clock ran out, and the contract credits their balance automatically — no
  // claim needed. The moment a live round ends we show the "calculating"
  // suspense to everyone; after it, only the winning wallet sees the jackpot.
  const potUsd = status?.vaultBalance.usdValue ?? 0;
  const lastPlayer = status?.lastPlayer ?? null;
  // This wallet is the last to have played, so it wins if the clock hits zero.
  // Drives the live "last standing" tension state on the game panel.
  const iAmLastStanding =
    gameActive && !!address && !!lastPlayer && lastPlayer.toLowerCase() === address.toLowerCase();
  const prevActiveRef = useRef(false);
  const lastPotRef = useRef(0);
  const winnerAtEndRef = useRef<string | null>(null);
  // One round-end sequence per round: set when the sequence starts, cleared
  // when a fresh round goes live, so a dismissed overlay can't re-fire from
  // the server's late active->inactive flip.
  const roundEndedRef = useRef(false);
  // Freshest status for the reveal timeout to consult without re-arming it.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  // Newest winner id we've already reacted to, so the winners feed (when it
  // works) reveals a fresh win without re-firing on load or on repeat polls.
  const seenWinnerIdRef = useRef<string | null>(null);
  const [pollUntil, setPollUntil] = useState(0);

  // Starts the end-of-round sequence: suspense now, winner reveal after it.
  // Stable so the effects below can depend on their real inputs without
  // re-arming on every render.
  const beginRoundEnd = useCallback(
    (winnerAddress: string | null, prizeUsd: number) => {
      roundEndedRef.current = true;
      winnerAtEndRef.current = winnerAddress;
      setRoundPrizeUsd(prizeUsd);
      setPhase("calculating");
      setPollUntil(Date.now() + WIN_POLL_WINDOW_MS);
      // Converge immediately: fresh status (pot/timer reset), winners table and
      // feed, plus the balance — not whenever the next socket push arrives.
      resyncGame();
      void refetchPortfolio();
    },
    [resyncGame, refetchPortfolio]
  );

  useEffect(() => {
    // Remember the pot while the round is live; it resets to 0 once paid out.
    if (gameActive && potUsd > 0) lastPotRef.current = potUsd;

    const wasActive = prevActiveRef.current;
    prevActiveRef.current = gameActive;
    // A fresh round going live re-arms the round-end sequence.
    if (gameActive) roundEndedRef.current = false;
    // A live round just ended (active -> inactive). Only start once per round.
    if (wasActive && !gameActive && phase === null && !roundEndedRef.current) {
      beginRoundEnd(lastPlayer, lastPotRef.current || potUsd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameActive]);

  // The client's own clock reaching zero IS the round-end signal — the server
  // confirmation (socket push or poll) can be ~10s behind, which is exactly
  // the dead air the user sits through at 00:00. Start the suspense right at
  // zero; if a buzzer-beater wager actually continued the round, the reveal
  // below notices and quietly backs out.
  useEffect(() => {
    if (!gameActive || countdown > 0 || phase !== null || roundEndedRef.current) return;
    beginRoundEnd(lastPlayer, lastPotRef.current || potUsd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, gameActive, phase]);

  // Reveal after the suspense: everyone sees who won. If a winner is known we
  // announce them by truncated address; the winning wallet gets the personal
  // jackpot treatment. With no known winner we just close.
  useEffect(() => {
    if (phase !== "calculating") return;
    const id = setTimeout(() => {
      // Backed out: a wager landed at the buzzer and the round continued —
      // the server now reports a live clock, so nobody actually won yet.
      const fresh = statusRef.current;
      if (fresh?.gameActive && fresh.timeRemaining > 3) {
        winnerAtEndRef.current = null;
        roundEndedRef.current = false;
        setPhase(null);
        return;
      }
      const winner = winnerAtEndRef.current;
      if (!winner) {
        setPhase(null);
        return;
      }
      const me = address?.toLowerCase();
      const iWon = !!(me && winner.toLowerCase() === me);
      setRevealWinner(winner);
      if (iWon) setRecentWinUsd(roundPrizeUsd);
      setPhase("won");
    }, CALCULATING_MS);
    return () => clearTimeout(id);
  }, [phase, address, roundPrizeUsd]);

  // Fallback reveal: if the winners feed surfaces a fresh win for this wallet
  // (e.g. we missed the live round), jackpot straight away, deduped by id.
  useEffect(() => {
    const latest = winners[0];
    if (!latest) return;
    if (seenWinnerIdRef.current === null) {
      // First load — mark as seen so we never celebrate an old win.
      seenWinnerIdRef.current = latest.id;
      return;
    }
    if (seenWinnerIdRef.current === latest.id) return;
    seenWinnerIdRef.current = latest.id;
    // The live sequence already celebrated this round here; the lagging feed
    // row is the same win, not a new one — without this it re-fired the
    // overlay after dismissal.
    if (roundEndedRef.current) return;
    const me = address?.toLowerCase();
    if (!(me && latest.winnerAddress.toLowerCase() === me && phase === null)) return;
    const winnerAddress = latest.winnerAddress;
    // Fire the reveal on the next tick rather than synchronously inside this
    // polled-data effect, matching the timed primary-reveal path above and
    // keeping the state updates out of the effect body.
    const id = setTimeout(() => {
      setRevealWinner(winnerAddress);
      setRoundPrizeUsd(lastPotRef.current);
      setRecentWinUsd(lastPotRef.current);
      setPhase("won");
      setPollUntil(Date.now() + WIN_POLL_WINDOW_MS);
    }, 0);
    void refetchPortfolio();
    return () => clearTimeout(id);
  }, [winners, address, phase, refetchPortfolio]);

  // Brief post-win balance re-check so the auto-credited winnings appear
  // quickly; self-clearing once the window passes.
  useEffect(() => {
    if (pollUntil <= Date.now()) return;
    const id = setInterval(() => {
      if (Date.now() > pollUntil) {
        clearInterval(id);
        return;
      }
      resyncGame();
      void refetchPortfolio();
    }, WIN_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollUntil, refetchPortfolio, resyncGame]);

  // Auto-dismiss the "you won" banner after the balance has had time to update.
  useEffect(() => {
    if (recentWinUsd === null) return;
    const id = setTimeout(() => setRecentWinUsd(null), WIN_POLL_WINDOW_MS);
    return () => clearTimeout(id);
  }, [recentWinUsd]);

  // Sweep a won pot to the wallet with a gasless claim(); the contract holds it
  // in pendingWinnings until then. Guarded so it never fires an empty claim.
  const onClaim = async () => {
    if (pendingWei <= 0n || claiming) return;
    const id = toast.loading(t("toastClaiming"));
    try {
      await claim();
      toast.success(t("toastClaimed"), { id });
      void refetchWinnings();
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, t("toastClaimFailed")), { id });
    }
  };

  // Auto-claim: when a win credits pendingWinnings, collect it automatically so
  // "winner takes the pot" actually pays out. The persistent banner below is the
  // fallback for anything left unclaimed. Latest handler kept in a ref, updated
  // in an effect, so the trigger effect doesn't re-bind every render.
  const claimRef = useRef<() => void>(() => {});
  useEffect(() => {
    claimRef.current = () => void onClaim();
  });
  const wonPendingRef = useRef(false);
  useEffect(() => {
    if (phase === "won" && youWon) wonPendingRef.current = true;
  }, [phase, youWon]);
  useEffect(() => {
    if (wonPendingRef.current && pendingWei > 0n && !claiming) {
      wonPendingRef.current = false;
      claimRef.current();
    }
  }, [pendingWei, claiming]);

  const onPlay = async () => {
    if (!canPlay) {
      setFundOpen(true);
      return;
    }
    // One processing toast that resolves in place. Signing is headless (no Privy
    // modal), so this toast plus the button's "Placing your play…" state is the
    // only feedback the player sees while the gasless wager settles.
    const toastId = toast.loading(t("ctaPlacing"));
    try {
      await wager();
      toast.success(t("toastYoureIn"), { id: toastId });
      setPlayEntering(true);
      // The wager just landed on-chain, but the backend indexes it a moment
      // later — resync now and keep the fast settle-poll running briefly so
      // the pot, timer and last-player reflect this play within seconds
      // (the socket push alone can be ~10s away, or absent when offline).
      resyncGame();
      setPollUntil(Date.now() + WIN_POLL_WINDOW_MS);
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, t("toastPlayFailed")), { id: toastId });
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* Playful layered glow behind the arena, for an arcade-y feel. */}
      <div
        aria-hidden
        className="bg-[radial-gradient(55%_55%_at_50%_0%,rgba(255, 255, 255, 0.22),transparent_70%)] pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[520px] max-w-[1000px]"
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
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="ws-display mt-2.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(30px,4.4vw,40px)] tracking-[-0.02em] text-transparent">
            {t("title")}
          </h2>
          <p className="mt-1.5 max-w-[54ch] text-[13.5px] font-normal text-white/55">
            {t("intro")}
          </p>
        </div>
        <span
          className={`ws-glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-white/75 ${
            gameActive ? "shadow-[0_0_24px_-8px_rgba(124,231,176,0.7)]" : ""
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${gameActive ? "bg-up animate-pulse" : "bg-white/25"}`}
          />
          {gameActive ? t("live") : t("offline")}
        </span>
      </div>

      {/* Winners take the pot via a gasless claim(); the contract holds it in
          pendingWinnings until then. Auto-claim usually collects it on the win;
          this persistent banner sweeps up anything left unclaimed. */}
      {pendingWei > 0n ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[linear-gradient(110deg,rgba(216, 216, 220, 0.16),rgba(216, 216, 220, 0.04))] relative mt-5 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[20px] border border-[#d8d8dc]/40 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <span className="shadow-[0_8px_22px_-8px_rgba(216, 216, 220, 0.9)] grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,#d8d8dc,#a8a8ae)] text-[22px]">
              🏆
            </span>
            <div>
              <div className="text-[14px] font-bold text-white">{t("claimTitle")}</div>
              <div className="tnum text-[13px] font-normal text-[#d8d8dc]">
                {t("claimWaiting", { amount: weiToMoney(pendingWei.toString()) })}
              </div>
            </div>
          </div>
          <button
            onClick={() => void onClaim()}
            disabled={claiming}
            className="shadow-[0_12px_30px_-10px_rgba(216, 216, 220, 0.9)] shrink-0 cursor-pointer rounded-xl bg-[linear-gradient(180deg,#f0f0f2,#d8d8dc,#b0b0b6)] px-6 py-2.5 font-sans text-[14px] font-bold text-[#1a1a1a] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {claiming ? t("claiming") : t("claimNow")}
          </button>
        </motion.div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 min-[980px]:grid-cols-[1fr_360px] min-[980px]:items-start">
        {/* Game panel */}
        <div className="ws-glass shadow-[0_40px_120px_-50px_rgba(255, 255, 255, 0.55)] relative overflow-hidden rounded-[26px] p-5 sm:p-7">
          <div
            aria-hidden
            className="bg-accent/30 pointer-events-none absolute -top-32 left-1/2 h-64 w-72 -translate-x-1/2 animate-pulse rounded-full blur-[100px]"
          />
          {/* Drifting sparkles for a living, arcade-y arena. */}
          {reduce ? null : (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {SPARKLES.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute text-[#d8d8dc]/45"
                  style={{ left: s.left, top: s.top, fontSize: s.size }}
                  animate={{ y: [0, -16, 0], opacity: [0, 0.85, 0], scale: [0.8, 1.05, 0.8] }}
                  transition={{
                    duration: s.dur,
                    repeat: Infinity,
                    delay: s.delay,
                    ease: "easeInOut",
                  }}
                >
                  ✦
                </motion.span>
              ))}
            </div>
          )}
          {/* Final-seconds tension: the whole arena edge pulses red. */}
          {urgent && !reduce ? (
            <motion.div
              aria-hidden
              className="ring-down/50 pointer-events-none absolute inset-0 rounded-[26px] ring-2 ring-inset"
              animate={{ opacity: [0.3, 0.9, 0.3] }}
              transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
          <div className="relative">
            <div className="text-accent/80 text-[11px] font-semibold tracking-[0.18em] uppercase">
              {t("prizePool")}
            </div>
            {statusLoading || !status ? (
              <div className="mt-2 h-[62px] w-52 animate-pulse rounded-xl bg-white/8" />
            ) : gameActive ? (
              // Live round: the pot pulses between white and gold so it reads as
              // hot money on the line.
              <motion.div
                className="ws-display tnum drop-shadow-[0_0_34px_rgba(216, 216, 220, 0.4)] mt-1.5 text-[clamp(48px,8vw,72px)] leading-none tracking-[-0.02em]"
                animate={
                  reduce ? { color: "#d8d8dc" } : { color: ["#ffffff", "#d8d8dc", "#ffffff"] }
                }
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <MoneyTicker value={status.vaultBalance.usdValue} format={money.format} />
              </motion.div>
            ) : (
              <div className="ws-display tnum drop-shadow-[0_0_30px_rgba(255, 255, 255, 0.35)] mt-1.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(48px,8vw,72px)] leading-none tracking-[-0.02em] text-transparent">
                <MoneyTicker value={status.vaultBalance.usdValue} format={money.format} />
              </div>
            )}
            <div className="mt-2 text-[13px] font-normal text-white/50">{t("potNote")}</div>

            {/* Live tension: when this wallet is last to play, it's winning. The
                banner ramps up in the final seconds. */}
            {iAmLastStanding ? (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative mt-4 overflow-hidden rounded-[16px] border px-4 py-3 ${
                  urgent
                    ? "border-[#d8d8dc]/60 bg-[#d8d8dc]/15"
                    : "border-[#d8d8dc]/35 bg-[#d8d8dc]/10"
                }`}
              >
                <motion.div
                  aria-hidden
                  className="bg-[radial-gradient(55%_60%_at_50%_50%,rgba(216, 216, 220, 0.4),transparent_70%)] pointer-events-none absolute -inset-3 blur-md"
                  animate={reduce ? { opacity: 0.5 } : { opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: urgent ? 0.7 : 1.5, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative flex items-center gap-2.5">
                  <motion.span
                    className="text-[22px]"
                    animate={reduce || !urgent ? {} : { scale: [1, 1.18, 1] }}
                    transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
                  >
                    👑
                  </motion.span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-[#d8d8dc]">
                      {urgent ? t("standingTitleUrgent") : t("standingTitle")}
                    </div>
                    <div className="text-[12px] font-normal text-white/70">
                      {urgent ? t("standingBodyUrgent") : t("standingBody")}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}

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
                  {t("timeRemaining")}
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
                      ? t("statusEnding")
                      : t("statusLiveRound")
                    : status?.isGameStarted
                      ? t("statusRoundEnded")
                      : t("statusIdle")}
                </span>
              </div>
              <div
                className={`ws-display tnum mt-3 text-center text-[clamp(52px,11vw,76px)] leading-none tracking-[-0.01em] ${
                  gameActive
                    ? urgent
                      ? "text-down animate-pulse drop-shadow-[0_0_28px_rgba(246,165,165,0.5)]"
                      : "drop-shadow-[0_0_26px_rgba(255, 255, 255, 0.45)] text-white"
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
                  color={urgent ? "#F6A5A5" : "#d4d4d8"}
                />
              </div>
              <div className="mt-3 text-center text-[12px] font-normal text-white/50">
                {gameActive
                  ? t("hintActive")
                  : status?.isGameStarted
                    ? t("hintEnded")
                    : t("hintIdle")}
              </div>
            </div>

            {/* Meta row */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="ws-inset px-4 py-3.5">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("lastPlayer")}
                </div>
                <div className="tnum mt-1 text-[13.5px] font-semibold text-white/85">
                  {status?.lastPlayer ? truncateAddress(status.lastPlayer) : t("noneYet")}
                </div>
              </div>
              <div className="ws-inset px-4 py-3.5">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("costToPlay")}
                </div>
                <div className="tnum mt-1 text-[13.5px] font-semibold text-white/85">
                  {status ? money.format(entryFeeUsd) : "—"}
                </div>
              </div>
            </div>

            {/* Play CTA — the primary action, silver whether you're playing or
                being nudged to add money. The add-money state carries a coin and
                blinks to pull the eye. */}
            <div className="relative mt-5">
              {canPlay || luring ? (
                <div
                  aria-hidden
                  className="bg-accent/40 pointer-events-none absolute -inset-1 animate-pulse rounded-2xl blur-lg"
                />
              ) : null}
              <motion.button
                onClick={() => void onPlay()}
                disabled={wagering || !status || !address}
                animate={luring && !reduce ? { opacity: [1, 0.5, 1] } : undefined}
                transition={
                  luring && !reduce
                    ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
                className={`relative w-full cursor-pointer overflow-hidden rounded-2xl p-4 font-sans text-[16.5px] font-bold transition-[transform] hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${
                  canPlay || luring
                    ? "text-ink shadow-[0_18px_44px_-12px_rgba(255, 255, 255, 0.9),inset_0_1px_0_rgba(255,255,255,0.45)] bg-[linear-gradient(180deg,#e8e8ea,#b6b6bc)]"
                    : "text-ink bg-white shadow-[0_12px_32px_-14px_rgba(255,255,255,0.5)]"
                }`}
              >
                {/* Light sweeps across the button whenever it's inviting a press. */}
                {(canPlay || luring) && !reduce ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]"
                    animate={{ x: ["0%", "420%"] }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      repeatDelay: 1.2,
                      ease: "easeInOut",
                    }}
                  />
                ) : null}
                <span className="relative inline-flex items-center justify-center gap-2">
                  {luring ? (
                    <span aria-hidden className="text-xl">
                      💰
                    </span>
                  ) : null}
                  {wagering
                    ? t("ctaPlacing")
                    : !status
                      ? t("loading")
                      : canPlay
                        ? t("ctaPlay", { amount: money.format(entryFeeUsd) })
                        : t("ctaAddMoney")}
                </span>
              </motion.button>
            </div>

            {/* Balance */}
            <div className="ws-inset mt-3 flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("yourBalance")}
                </div>
                <div className="tnum mt-0.5 text-[16px] font-bold text-white/90">
                  {mask(money.format(balanceUsd))}
                </div>
              </div>
              {/* Only a top-up affordance here. When the player can't afford a
                  play the primary CTA above already reads "Add money to play",
                  so showing a second "Add money" here would just duplicate it. */}
              {canPlay ? (
                <button
                  onClick={() => setFundOpen(true)}
                  className="border-accent/40 bg-accent/14 text-accent hover:bg-accent/22 shrink-0 cursor-pointer rounded-xl border px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap transition-colors"
                >
                  {t("addMoney")}
                </button>
              ) : null}
            </div>

            {/* You won — auto-credited, no claim needed. */}
            {recentWinUsd !== null ? (
              <div className="border-up/40 bg-up/10 mt-3 rounded-[16px] border px-4 py-3.5 shadow-[0_0_28px_-10px_rgba(124,231,176,0.6)]">
                <div className="text-[13.5px] font-bold text-white">{t("wonBannerTitle")}</div>
                <div className="tnum mt-0.5 text-[12.5px] font-normal text-white/60">
                  {t("wonBannerDetail", { amount: money.format(recentWinUsd) })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Side rail */}
        <div className="flex flex-col gap-4">
          <div className="ws-glass rounded-[22px] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white/80">{t("recentActivity")}</span>
              <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/40">
                {t("liveFeed")}
              </span>
            </div>
            {activities.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-[13px] font-normal text-white/40">
                {t("noPlays")}
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                {pagedActivities.pageItems.map((a) => (
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
                        {a.action === "won" ? t("actionWon") : t("actionPlayed")}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[12.5px] font-semibold text-white/65">
                      {weiToMoney(a.amountWei)}
                    </span>
                  </a>
                ))}
              </div>
            )}
            {pagedActivities.total > FEED_PAGE_SIZE ? (
              <Pager
                from={pagedActivities.from}
                to={pagedActivities.to}
                total={pagedActivities.total}
                canPrev={pagedActivities.canPrev}
                canNext={pagedActivities.canNext}
                onPrev={pagedActivities.goPrev}
                onNext={pagedActivities.goNext}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Hall of Winners — champions of past rounds, given the main stage rather
          than a cramped side slot. Chronological (newest first), not a ranking. */}
      <div className="ws-glass relative mt-4 overflow-hidden rounded-[24px] p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-16 h-52 w-52 rounded-full bg-[#d8d8dc]/10 blur-[80px]"
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[30px]">👑</span>
            <div>
              <div className="text-[14px] font-semibold text-white/90">{t("hallTitle")}</div>
              <div className="text-[11.5px] font-normal text-white/45">{t("hallSubtitle")}</div>
            </div>
          </div>
          {winners.length > 0 ? (
            <span className="tnum rounded-full bg-[#d8d8dc]/12 px-2.5 py-1 text-[11px] font-semibold text-[#d8d8dc]/80 ring-1 ring-[#d8d8dc]/20">
              {t("settledCount", { count: winners.length })}
            </span>
          ) : null}
        </div>

        {winnersLoading ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-x-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-white/6" />
            ))}
          </div>
        ) : winners.length === 0 ? (
          <div className="grid place-items-center py-12 text-center text-[13px] font-normal text-white/40">
            {t("hallEmpty")}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-x-5">
              {pagedWinners.pageItems.map((w, idx) => {
                // Only the very newest settled round (page 1, first row) is the
                // "latest" — everything else is just chronological history.
                const isLatest = pagedWinners.page === 0 && idx === 0;
                return (
                  <motion.a
                    key={w.id}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.28 }}
                    href={`${EXPLORER_ADDRESS_URL}${w.winnerAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`relative flex items-center gap-3 overflow-hidden rounded-[14px] px-3 py-2.5 transition-colors ${
                      isLatest
                        ? "bg-[linear-gradient(110deg,rgba(216, 216, 220, 0.14),rgba(216, 216, 220, 0.02))] ring-1 ring-[#d8d8dc]/25"
                        : "bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    {/* A light sweeps across the most recent winner's row. */}
                    {isLatest && !reduce ? (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)]"
                        animate={{ x: ["0%", "360%"] }}
                        transition={{
                          duration: 2.8,
                          repeat: Infinity,
                          repeatDelay: 1.8,
                          ease: "easeInOut",
                        }}
                      />
                    ) : null}
                    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d8d8dc]/12 text-[15px] ring-1 ring-[#d8d8dc]/20">
                      🏆
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="tnum block truncate text-[13.5px] font-semibold text-white/90">
                        {truncateAddress(w.winnerAddress)}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] font-normal text-white/45">
                        {/* Historical rounds don't always carry a player count;
                            only show it when it's real so we never read "0 players". */}
                        {w.playerCount > 0
                          ? `${t("playersCount", { count: w.playerCount })} · `
                          : ""}
                        {timeAgo(w.endedAt)}
                      </span>
                    </span>
                    <span className="relative shrink-0 text-right">
                      <span className="tnum block text-[14px] font-bold text-[#d8d8dc]">
                        {weiToMoney(w.winnerPrizeWei)}
                      </span>
                      {isLatest ? (
                        <span className="block text-[9.5px] font-semibold tracking-[0.12em] text-[#d8d8dc]/70 uppercase">
                          {t("latest")}
                        </span>
                      ) : null}
                    </span>
                  </motion.a>
                );
              })}
            </div>
            {pagedWinners.total > FEED_PAGE_SIZE ? (
              <Pager
                from={pagedWinners.from}
                to={pagedWinners.to}
                total={pagedWinners.total}
                canPrev={pagedWinners.canPrev}
                canNext={pagedWinners.canNext}
                onPrev={pagedWinners.goPrev}
                onNext={pagedWinners.goNext}
                label={t("pagerWinners")}
              />
            ) : null}
          </>
        )}
      </div>

      <ModalShell open={fundOpen} onClose={() => setFundOpen(false)} contentKey="vault-fund">
        <FundSheet onClose={() => setFundOpen(false)} />
      </ModalShell>

      <PlayOverlay
        open={playEntering}
        potValue={potUsd}
        formatMoney={money.format}
        secondsToSurvive={status?.timerDuration ?? 0}
        onClose={() => setPlayEntering(false)}
      />

      <RoundOverlay
        phase={phase}
        youWon={youWon}
        winnerLabel={winnerLabel}
        prizeValue={revealPrizeUsd}
        prizeLabel={money.format(revealPrizeUsd)}
        formatMoney={money.format}
        onClose={() => setPhase(null)}
      />
    </div>
  );
}
