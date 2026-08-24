"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { SellPayload } from "@/lib/modal-types";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { parseEther } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { formatEther } from "viem";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ModalShell } from "@/components/ui/modal-shell";
import { Pager } from "@/components/ui/pager";
import { MoneyTicker } from "@/features/casino/components/last-standing/money-ticker";
import { useMoney } from "@/components/ui/currency-select";
import { FundSheet } from "@/features/casino/components/last-standing/fund-sheet";
import { GameBalanceCard } from "@/features/casino/components/last-standing/game-balance-card";
import { WinnersList } from "@/features/casino/components/last-standing/winners-list";
import {
  DEFAULT_SPLIT_BPS,
  estimateWinnerPayout,
  isSameAddress,
} from "@/features/casino/lib/last-standing/split";
import {
  MiniTimerLauncher,
  formatCountdown,
} from "@/features/casino/components/last-standing/mini-timer";
import { useCountdown } from "@/features/casino/components/last-standing/use-countdown";
import {
  RoundOverlay,
  type RoundPhase,
} from "@/features/casino/components/last-standing/round-overlay";
import { useVaultGame } from "@/features/casino/hooks/use-vault-game";
import { useVaultFeeds } from "@/features/casino/hooks/use-vault-feeds";
import { rememberRoundLength, secondsUntil } from "@/features/casino/lib/last-standing/clock";
import { usdToWei } from "@/features/casino/lib/last-standing/stake";
import { followGame } from "@/features/casino/lib/last-standing/followed-game";
import { ShareGame, ShareGameButton } from "@/features/casino/components/last-standing/share-game";
import type { TokenAmount } from "@/features/casino/lib/vault-api";

// The shape the round visuals below consume, kept local now that the API
// speaks in games rather than one global status.
interface VaultGameStatus {
  timeRemaining: number;
  isGameStarted: boolean;
  lastPlayer: string | null;
  vaultBalance: TokenAmount;
  entryFee: TokenAmount;
  timerDuration: number;
  gameActive: boolean;
}
import { useVaultActions, readSplitBps } from "@/features/casino/hooks/use-vault-actions";
import { useVaultPendingWinnings } from "@/features/casino/hooks/use-vault-winnings";
import { useInvalidateOnBlock } from "@/hooks/use-base-block";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePaged } from "@/hooks/use-paged";
import { getWalletAddress } from "@/lib/user";
import { truncateAddress } from "@/lib/format";
import { friendlyError, isAlreadySettledError } from "@/lib/errors";
import {
  isMusicPlaying,
  setUrgentMode,
  startMusic,
  stopMusic,
  subscribeMusic,
} from "@/features/casino/lib/last-standing/music";
import {
  playClaimSound,
  playDethronedSound,
  playRevealSound,
  playRoundEndSound,
  playWagerSound,
  setSoundEnabled,
} from "@/features/casino/lib/last-standing/sound";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";

const EXPLORER_TX_URL = "https://basescan.org/tx/";
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

// The wall clock, read from inside event handlers. Through a function so the
// compiler does not take a handler defined in the component for render work.
const clockNow = () => Date.now();

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

// Play/pause for the arena's looping background track. The track (and every
// event cue) is synthesised live with the Web Audio API — no audio file ships
// or downloads. One switch governs all game audio: pausing the loop also mutes
// the cues. Playback can only start from this click; autoplay policy blocks
// anything earlier.
function MusicToggle() {
  const t = useTranslations("casino.lastStanding");
  const playing = useSyncExternalStore(subscribeMusic, isMusicPlaying, () => false);
  const toggle = () => {
    if (playing) {
      stopMusic();
      setSoundEnabled(false);
    } else {
      startMusic();
      setSoundEnabled(true);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? t("soundMute") : t("soundPlay")}
      aria-pressed={playing}
      className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 text-[11.5px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {playing ? <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" /> : <path d="M8 5v14l11-7L8 5Z" />}
      </svg>
      {playing ? t("soundMute") : t("soundPlay")}
    </button>
  );
}

// The wager's coin flight: fixed launch offsets and stagger, so the burst is
// deterministic (no per-render randomness) and reads as a handful of coins
// rather than a single dot. Coordinates are viewport-relative; the layer that
// renders them is position:fixed.
const COIN_FLIGHTS = [
  { dx: -26, delay: 0 },
  { dx: -8, delay: 0.07 },
  { dx: 10, delay: 0.13 },
  { dx: 26, delay: 0.05 },
  { dx: 0, delay: 0.19 },
];
const COIN_FLIGHT_SECONDS = 0.75;

function WifiOffIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-white/70"
    >
      <path
        d="M2 8.5C4.8 6 8.2 4.6 12 4.6c3.8 0 7.2 1.4 10 3.9M5.2 12c1.9-1.7 4.2-2.6 6.8-2.6 2.6 0 4.9.9 6.8 2.6M8.4 15.4a6.4 6.4 0 0 1 3.6-1.2c1.3 0 2.6.4 3.6 1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="18.6" r="1.3" fill="currentColor" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

interface LastStandingSectionProps {
  /** Which game this screen is showing. v4 runs many at once. */
  gameId: number;
  renderWithdrawSheet: (payload: SellPayload, onClose: () => void) => ReactNode;
}

export function LastStandingSection({ gameId, renderWithdrawSheet }: LastStandingSectionProps) {
  const t = useTranslations("casino.lastStanding");
  const tBuySell = useTranslations("buySell");
  const tBuySellNotEnough = tBuySell("notEnoughBalance");
  const { user } = usePrivy();
  const money = useMoney();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();
  const {
    game,
    loading: statusLoading,
    connected,
    degraded,
    resync: resyncGame,
  } = useVaultGame(gameId);
  // This game's plays and this game's result, not every game's.
  const { activities, winners, winnersLoading } = useVaultFeeds(connected, gameId);
  const { wager, wagering, claim, claiming, settle, settling } = useVaultActions();

  // The round visuals below were written against v3's single-game status. v4
  // gives one game at a time instead, so it is mapped here rather than
  // rewriting every reference to it: the shapes carry the same facts under
  // different names.
  //
  // timerDuration is the one v4 does not report. It is only used for the
  // progress ring, so the longest countdown seen on this game stands in for it
  // — after the first wager that is exactly the round length.
  const status = useMemo<VaultGameStatus | null>(() => {
    if (!game) return null;
    const remaining = secondsUntil(game.endTime);
    const roundLength = rememberRoundLength(game.gameId, remaining);
    return {
      timeRemaining: remaining,
      isGameStarted: true,
      lastPlayer: game.king,
      vaultBalance: game.pot,
      entryFee: game.minWager,
      timerDuration: roundLength || remaining,
      gameActive: game.active,
    };
  }, [game]);
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  // One coin flight per wager click: viewport coordinates captured from the
  // button and the pot at the moment of the click. Null when nothing flies.
  const [flight, setFlight] = useState<{
    id: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const potRef = useRef<HTMLDivElement | null>(null);
  const flightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
    };
  }, []);
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

  // Leaving the arena stops the track — background music must not follow the
  // user to the portfolio.
  useEffect(() => stopMusic, []);

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

  // The reveal amount, preferring the backend's exact winnerPrizeWei over the
  // client-captured pot snapshot — that snapshot goes stale when the final wager
  // lands right at round-end (the "$0.38 instead of $1.15" bug).
  const latestWinner = winners[0];
  const revealPrizeUsd =
    latestWinner && revealWinner && latestWinner.winner.toLowerCase() === revealWinner.toLowerCase()
      ? latestWinner.toWinner.usdValue
      : (roundPrizeUsd ?? 0);

  // Only trust timeRemaining while a round is live. Once it is over the clock
  // reads 00:00: a v4 game does not have a next round to rest at.
  const gameActive = status?.gameActive ?? false;
  // The clock is out. In v4 a finished game is finished: a wager on it reverts,
  // so the play button has to give way to what can actually be done — settle
  // it, if nobody has, and go start another.
  const roundOver = !!status?.isGameStarted && !gameActive;
  const iAmKing =
    !!address && !!status?.lastPlayer && status.lastPlayer.toLowerCase() === address.toLowerCase();
  const countdown = useCountdown(status?.timeRemaining ?? 0, gameActive, degraded);
  const timerPct =
    gameActive && status ? Math.min(100, (countdown / Math.max(1, status.timerDuration)) * 100) : 0;
  const urgent = gameActive && countdown <= 10;

  // The red zone changes the music itself: at ten seconds the groove hands
  // over to a clock tick-tock, the audible version of the red ring the arena
  // already shows, and hands back if a wager saves the round.
  useEffect(() => {
    setUrgentMode(urgent && countdown > 0 && !degraded);
    return () => setUrgentMode(false);
  }, [urgent, countdown, degraded]);

  // Round-end handling. The winner is whoever was the last to play when the
  // clock ran out. Nothing is paid until someone calls settle(), and the
  // contract does not do that itself: the backend keeper is meant to, and the
  // winner's client does too, so the payout never waits on the keeper. So the
  // moment a live round ends we show the "calculating" suspense to everyone;
  // after it, only the winning wallet sees the jackpot, and that wallet
  // settles the game. settle() pushes the payout straight to the wallet; the
  // claim path below is only for a push that failed.
  const potUsd = status?.vaultBalance.usdValue ?? 0;
  const lastPlayer = status?.lastPlayer ?? null;
  // This wallet is the last to have played, so it wins if the clock hits zero.
  // Drives the live "last standing" tension state on the game panel.
  const iAmLastStanding =
    gameActive && !!address && !!lastPlayer && lastPlayer.toLowerCase() === address.toLowerCase();

  // The dethroned alert: this wallet was last standing and someone else played.
  // Only while the round stays live — losing the flag because the round ended
  // is the reveal's moment, not this one.
  const wasLastStandingRef = useRef(false);
  useEffect(() => {
    if (wasLastStandingRef.current && !iAmLastStanding && gameActive) {
      playDethronedSound();
    }
    wasLastStandingRef.current = iAmLastStanding;
  }, [iAmLastStanding, gameActive]);

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
  // Freshest connection verdict, for the timed reveal to consult without
  // re-arming itself.
  const degradedRef = useRef(degraded);
  useEffect(() => {
    degradedRef.current = degraded;
  }, [degraded]);
  // Newest winner id we've already reacted to, so the winners feed (when it
  // works) reveals a fresh win without re-firing on load or on repeat polls.
  const seenWinnerIdRef = useRef<string | null>(null);
  const [pollUntil, setPollUntil] = useState(0);

  // The contract's split, read once: the owner can retune it, and the number a
  // winner sees before settlement has to match what settle() will pay.
  const splitBps = useQuery({
    queryKey: ["vault", "split-bps"],
    queryFn: readSplitBps,
    staleTime: Infinity,
  });
  const split = splitBps.data ?? DEFAULT_SPLIT_BPS;
  const splitWinnerBps = split.winner;
  const splitStarterBps = split.starter;
  // The starter is paid a share too, and is often the winner as well.
  const starter = game?.starter ?? null;
  const winnerIsStarter = isSameAddress(revealWinner, starter);

  // Starts the end-of-round sequence: suspense now, winner reveal after it.
  // The effects below call it without listing it, so it is a plain function
  // and the compiler memoises it; a manual useCallback here is what it could
  // not reconcile.
  const beginRoundEnd = (winnerAddress: string | null, potAtEndUsd: number) => {
    roundEndedRef.current = true;
    winnerAtEndRef.current = winnerAddress;
    // The winner's share of the pot, not the pot: half, plus the starter's
    // tenth when the same wallet opened the game. The exact figure lands
    // with the settlement row and takes over as soon as it does.
    setRoundPrizeUsd(
      estimateWinnerPayout(potAtEndUsd, isSameAddress(winnerAddress, starter), {
        winner: splitWinnerBps,
        starter: splitStarterBps,
      })
    );
    setPhase("calculating");
    // The arena falls silent for the verdict: the loop stops (the next wager
    // restarts it) and the buzzer-plus-suspense carries the audio instead.
    stopMusic();
    playRoundEndSound();
    setPollUntil(clockNow() + WIN_POLL_WINDOW_MS);
    // Converge immediately: fresh status (pot/timer reset), winners table and
    // feed, plus the balance — not whenever the next socket push arrives.
    resyncGame();
    void refetchPortfolio();
  };

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
    // On a degraded connection the local zero is not evidence: wagers this
    // client never heard about may have extended the round. The clock stays
    // frozen under the reconnect overlay; the resync on reconnection brings
    // the truth, and the active->inactive transition above runs the round
    // end from fresh data if it really is over.
    if (degraded) return;
    beginRoundEnd(lastPlayer, lastPotRef.current || potUsd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, gameActive, phase, degraded]);

  // Reveal after the suspense: everyone sees who won. If a winner is known we
  // announce them by truncated address; the winning wallet gets the personal
  // jackpot treatment. With no known winner we just close.
  useEffect(() => {
    if (phase !== "calculating") return;
    const id = setTimeout(() => {
      // The connection died during the suspense: a stale snapshot can neither
      // confirm the end nor name a winner. Back out to the frozen state; the
      // reconnect resync re-runs the round end from the truth.
      if (degradedRef.current) {
        winnerAtEndRef.current = null;
        roundEndedRef.current = false;
        setPhase(null);
        return;
      }
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
      playRevealSound(iWon);
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
      seenWinnerIdRef.current = latest.settlementTx;
      return;
    }
    if (seenWinnerIdRef.current === latest.settlementTx) return;
    seenWinnerIdRef.current = latest.settlementTx;
    // The live sequence already celebrated this round here; the lagging feed
    // row is the same win, not a new one — without this it re-fired the
    // overlay after dismissal.
    if (roundEndedRef.current) return;
    const me = address?.toLowerCase();
    if (!(me && latest.winner.toLowerCase() === me && phase === null)) return;
    const winnerAddress = latest.winner;
    // Fire the reveal on the next tick rather than synchronously inside this
    // polled-data effect, matching the timed primary-reveal path above and
    // keeping the state updates out of the effect body.
    // The winners row carries what was actually paid, so it is the amount.
    const paidUsd = latest.toWinner.usdValue;
    const id = setTimeout(() => {
      setRevealWinner(winnerAddress);
      setRoundPrizeUsd(paidUsd);
      setRecentWinUsd(paidUsd);
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

  // Sweep a payout the contract could not push, with a gasless claim(). Rare:
  // settle() pays wallets directly and only a failed transfer is held in
  // pendingWithdrawals. Guarded so it never fires an empty claim.
  const onClaim = async () => {
    if (pendingWei <= 0n || claiming) return;
    const id = toast.loading(t("toastClaiming"));
    try {
      await claim();
      toast.success(t("toastClaimed"), { id });
      playClaimSound();
      void refetchWinnings();
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, t("toastClaimFailed")), { id });
    }
  };

  // Auto-claim: if a win lands in pendingWithdrawals instead of the wallet,
  // collect it automatically so "winner takes the pot" actually pays out. The
  // persistent banner below is the fallback for anything left unclaimed.
  // Latest handler kept in a ref, updated in an effect, so the trigger effect
  // doesn't re-bind every render.
  const claimRef = useRef<() => void>(() => {});
  useEffect(() => {
    claimRef.current = () => void onClaim();
  });
  const wonPendingRef = useRef(false);
  // Reported once per win. The reveal effect below re-runs as the claim
  // settles, and a second event would double the pot in any total built on it.
  const wonReportedRef = useRef(false);
  useEffect(() => {
    if (phase === "won" && youWon) {
      wonPendingRef.current = true;
      if (!wonReportedRef.current) {
        wonReportedRef.current = true;
        track("last_man_won", {
          pot_usd: lastPotRef.current || potUsd,
          winnings_usd: revealPrizeUsd,
          started_it: winnerIsStarter,
        });
      }
    }
  }, [phase, youWon, potUsd, revealPrizeUsd, winnerIsStarter]);
  useEffect(() => {
    if (wonPendingRef.current && pendingWei > 0n && !claiming) {
      wonPendingRef.current = false;
      claimRef.current();
    }
  }, [pendingWei, claiming]);

  // Settle the game I just won, so the payout lands. Every game on this
  // contract sat unsettled for a day until this existed: the reveal fired,
  // the "updating your balance" banner showed, and the balance never moved,
  // because nobody had asked the contract to pay. The backend keeper is meant
  // to settle within seconds of expiry, and when it gets there first this
  // reverts AlreadySettled, which is the outcome we wanted, not a failure.
  // Anyone may settle once the clock is out; the winner does it here, gasless
  // like every other vault action, and once per game.
  const settledGameRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "won" || !youWon || settling) return;
    if (settledGameRef.current === gameId) return;
    if (game?.settled) return;
    settledGameRef.current = gameId;
    const id = toast.loading(t("toastSettling"));
    void settle(gameId)
      .then(() => {
        toast.success(t("toastSettled"), { id });
        // The credit lands on the next block; nudge the watchers rather than
        // wait for the poll so the claim follows within seconds.
        void refetchWinnings();
        resyncGame();
      })
      .catch((e) => {
        if (isAlreadySettledError(e)) {
          // The keeper beat us to it. Paid is paid.
          toast.success(t("toastSettled"), { id });
          void refetchWinnings();
          resyncGame();
          return;
        }
        // Let it be tried again: a failed settle has not paid anyone.
        settledGameRef.current = null;
        toast.error(friendlyError(e, t("toastSettleFailed")), { id });
      });
    // settle/refetchWinnings/resyncGame are stable callbacks; t is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, youWon, gameId, settling, game?.settled]);

  // Settle a finished game from its page. Anyone may; it pays the winner
  // whoever presses it. The reveal path settles a win as it happens; this is
  // for coming back to a finished game later, and for every game that ended
  // before the client knew how to settle at all.
  const onSettle = async () => {
    if (settling) return;
    const id = toast.loading(t("toastSettling"));
    try {
      await settle(gameId);
      toast.success(t("toastSettled"), { id });
      void refetchWinnings();
      resyncGame();
    } catch (e) {
      if (isAlreadySettledError(e)) {
        toast.success(t("toastSettled"), { id });
        resyncGame();
        return;
      }
      toast.error(friendlyError(e, t("toastSettleFailed")), { id });
    }
  };

  // One wager, whatever the size: the minimum from the Play button, or more
  // from the liquidity control. The contract's wager(gameId) takes any value
  // at or above the game's minimum; either way the sender becomes last
  // standing and the clock resets, so the two share every step after the
  // amount.
  const placeWager = async (amountWei: bigint, amountUsd: number, from: HTMLElement | null) => {
    // Entering the round starts the arena's audio, unconditionally — placing a
    // wager IS asking for the game, sound and all, and this click is the user
    // gesture autoplay policy wants. The mute button governs everything after;
    // an earlier mute is deliberately overridden by choosing to play again.
    startMusic();
    setSoundEnabled(true);
    // The wager visualised: coins leave the button and land in the pot. Fired
    // on the click rather than on confirmation so the money reads as leaving
    // the player's hand immediately; a failed wager costs only a cosmetic.
    const btnRect = from?.getBoundingClientRect();
    const potRect = potRef.current?.getBoundingClientRect();
    if (btnRect && potRect && !reduce) {
      setFlight({
        id: clockNow(),
        from: { x: btnRect.left + btnRect.width / 2, y: btnRect.top + 8 },
        to: { x: potRect.left + potRect.width / 2, y: potRect.top + potRect.height / 2 },
      });
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
      flightTimerRef.current = setTimeout(
        () => setFlight(null),
        (COIN_FLIGHT_SECONDS + 0.3) * 1000
      );
    }
    // One processing toast that resolves in place. Signing is headless (no Privy
    // modal), so this toast plus the button's "Placing your play…" state is the
    // only feedback the player sees while the gasless wager settles.
    const toastId = toast.loading(t("ctaPlacing"));
    try {
      await wager(gameId, amountWei);
      followGame(gameId);
      // `game_staked` is the generic "money went into a game" event the
      // catalog uses across all of them, so it rides alongside the
      // last-man-specific one.
      track("last_man_played", { cost_usd: amountUsd });
      track("game_staked", { game: "last_man", amount_usd: amountUsd });
      toast.success(t("toastYoureIn"), { id: toastId });
      playWagerSound();
      // The wager just landed on-chain, but the backend indexes it a moment
      // later — resync now and keep the fast settle-poll running briefly so
      // the pot, timer and last-player reflect this play within seconds
      // (the socket push alone can be ~10s away, or absent when offline).
      resyncGame();
      setPollUntil(clockNow() + WIN_POLL_WINDOW_MS);
      void refetchPortfolio();
      return true;
    } catch (e) {
      toast.error(friendlyError(e, t("toastPlayFailed")), { id: toastId });
      return false;
    }
  };

  const onPlay = async () => {
    if (!canPlay) {
      setFundOpen(true);
      return;
    }
    // That game's minimum, not a global fee: the starter set it when they
    // opened the game, and the contract rejects anything under it.
    await placeWager(parseEther(status?.entryFee.amount ?? "0"), entryFeeUsd, playBtnRef.current);
  };

  // Adding liquidity: a play of the player's own size. Typed in dollars,
  // priced at the same rate as the entry fee, never under the game's minimum
  // and never over what the wallet holds.
  const [liquidityUsd, setLiquidityUsd] = useState("");
  const liquidityAmountUsd = Number.parseFloat(liquidityUsd) || 0;
  const liquidityWei = unitUsd > 0 ? usdToWei(liquidityAmountUsd, unitUsd) : 0n;
  const liquidityBelowMin = liquidityAmountUsd > 0 && liquidityAmountUsd < entryFeeUsd - 1e-9;
  const liquidityOverBalance = liquidityAmountUsd > 0 && liquidityAmountUsd > balanceUsd + 1e-9;
  const liquidityReady =
    liquidityAmountUsd > 0 &&
    !liquidityBelowMin &&
    !liquidityOverBalance &&
    liquidityWei > 0n &&
    !wagering;
  const liquidityBtnRef = useRef<HTMLButtonElement | null>(null);

  const onAddLiquidity = async () => {
    if (!liquidityReady) return;
    const ok = await placeWager(liquidityWei, liquidityAmountUsd, liquidityBtnRef.current);
    if (ok) setLiquidityUsd("");
  };

  return (
    <div className="relative mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      {/* The wager in flight: coins arc from the play button into the pot.
          Viewport coordinates, so the layer is fixed and pointer-transparent;
          keyed by flight id so a rapid second wager restarts the burst. */}
      {flight ? (
        <div key={flight.id} aria-hidden className="pointer-events-none fixed inset-0 z-[85]">
          {COIN_FLIGHTS.map((coin, i) => (
            <motion.span
              key={i}
              className="text-ink absolute grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold shadow-[0_0_12px_rgba(255,255,255,0.65)]"
              style={{ left: -10, top: -10 }}
              initial={{
                x: flight.from.x + coin.dx,
                y: flight.from.y,
                scale: 0.5,
                opacity: 0,
              }}
              animate={{
                x: [flight.from.x + coin.dx, flight.from.x + coin.dx, flight.to.x],
                y: [flight.from.y, flight.from.y - 46, flight.to.y],
                scale: [0.5, 1, 0.4],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: COIN_FLIGHT_SECONDS,
                delay: coin.delay,
                ease: "easeInOut",
                times: [0, 0.35, 1],
              }}
            >
              $
            </motion.span>
          ))}
        </div>
      ) : null}
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
          {gameActive ? t("live") : status ? t("statusRoundEnded") : t("offline")}
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
            {/* Wraps on a narrow phone: the label plus both pills do not fit
                one line there, and forcing them to overlapped the pot below. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="text-accent/80 text-[11px] font-semibold tracking-[0.18em] uppercase">
                {t("prizePool")}
              </div>
              <div className="flex items-center gap-2">
                <ShareGameButton gameId={gameId} />
                <MiniTimerLauncher />
                <MusicToggle />
              </div>
            </div>
            <motion.div
              ref={potRef}
              key={flight?.id ?? "idle"}
              className="inline-block"
              animate={flight && !reduce ? { scale: [1, 1, 1.05, 1] } : undefined}
              transition={
                flight && !reduce
                  ? { duration: COIN_FLIGHT_SECONDS + 0.2, times: [0, 0.8, 0.92, 1] }
                  : undefined
              }
            >
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
                // The contract keeps the pot on a settled game's record after
                // paying it out, so the figure has to be zeroed here or a
                // finished game reads as money still on the table.
                <div className="ws-display tnum drop-shadow-[0_0_30px_rgba(255, 255, 255, 0.35)] mt-1.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(48px,8vw,72px)] leading-none tracking-[-0.02em] text-transparent">
                  <MoneyTicker
                    value={game?.settled ? 0 : status.vaultBalance.usdValue}
                    format={money.format}
                  />
                </div>
              )}
            </motion.div>
            <div className="mt-2 text-[13px] font-normal text-white/50">
              {game?.settled && game.king
                ? t("potPaidOut", { winner: truncateAddress(game.king) })
                : t("potNote")}
            </div>

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
              {degraded ? (
                <div className="absolute inset-0 z-[1] grid place-items-center bg-black/72 backdrop-blur-[2px]">
                  <div className="flex flex-col items-center gap-1.5 px-6 text-center">
                    <WifiOffIcon />
                    <div className="text-[13.5px] font-bold text-white">
                      {t("connectionLostTitle")}
                    </div>
                    <div className="max-w-[36ch] text-[12px] leading-[1.5] font-normal text-white/60">
                      {t("connectionLostBody")}
                    </div>
                  </div>
                </div>
              ) : null}
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
                {formatCountdown(gameActive ? countdown : 0)}
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
                    ? game?.settled
                      ? t("hintSettled")
                      : t("hintEnded")
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

            {/* Every player brought in grows the pot the starter takes 10% of,
                so the invite sits with the game. On a laptop the same card
                heads the side rail instead, where the QR is in view without
                scrolling. */}
            <ShareGame gameId={gameId} className="mt-4 min-[980px]:hidden" />

            {/* Play CTA — the primary action, silver whether you're playing or
                being nudged to add money. The add-money state carries a coin and
                blinks to pull the eye. */}
            <div className="relative mt-5">
              {roundOver ? (
                // The round is over. A play here would revert on-chain, so the
                // button does what is actually left to do.
                game?.settled ? (
                  <Link
                    href="/casino/last-standing"
                    className="text-ink block w-full rounded-2xl bg-white p-4 text-center font-sans text-[16.5px] font-bold shadow-[0_12px_32px_-14px_rgba(255,255,255,0.5)] transition-[transform] hover:-translate-y-0.5"
                  >
                    {t("ctaStartAnother")}
                  </Link>
                ) : (
                  <button
                    onClick={() => void onSettle()}
                    disabled={settling || !address}
                    className="text-ink w-full cursor-pointer rounded-2xl bg-[linear-gradient(180deg,#e8e8ea,#b6b6bc)] p-4 font-sans text-[16.5px] font-bold shadow-[0_18px_44px_-12px_rgba(255,255,255,0.9),inset_0_1px_0_rgba(255,255,255,0.45)] transition-[transform] hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {settling
                      ? t("ctaSettling")
                      : iAmKing
                        ? t("ctaSettleCollect")
                        : t("ctaSettleRound")}
                  </button>
                )
              ) : null}
              {!roundOver && (canPlay || luring) ? (
                <div
                  aria-hidden
                  className="bg-accent/40 pointer-events-none absolute -inset-1 animate-pulse rounded-2xl blur-lg"
                />
              ) : null}
              {roundOver ? null : (
                <motion.button
                  ref={playBtnRef}
                  onClick={() => void onPlay()}
                  disabled={wagering || !status || !address}
                  animate={
                    reduce
                      ? undefined
                      : luring
                        ? { opacity: [1, 0.5, 1] }
                        : canPlay
                          ? {
                              // A slow breath of light: the button glows brighter
                              // and settles, so a live round reads as alive even
                              // between shimmer sweeps.
                              boxShadow: [
                                "0 18px 40px -14px rgba(255,255,255,0.45), inset 0 1px 0 rgba(255,255,255,0.45)",
                                "0 18px 64px -8px rgba(255,255,255,0.95), inset 0 1px 0 rgba(255,255,255,0.45)",
                                "0 18px 40px -14px rgba(255,255,255,0.45), inset 0 1px 0 rgba(255,255,255,0.45)",
                              ],
                            }
                          : undefined
                  }
                  transition={
                    reduce
                      ? undefined
                      : luring
                        ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
                        : canPlay
                          ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
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
              )}
            </div>

            {/* Add liquidity: a play of any size above the minimum. The input
                is dollars; the button says what it would send. */}
            {roundOver || !gameActive ? null : (
              <div className="ws-inset mt-3 px-4 py-3.5">
                <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
                  {t("liquidityLabel")}
                </div>
                <div className="mt-2 flex flex-wrap items-stretch gap-2">
                  <label
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border bg-black/35 px-3.5 transition-colors ${
                      liquidityBelowMin || liquidityOverBalance
                        ? "border-[#e3a49a]/60"
                        : "focus-within:border-accent/45 border-white/10"
                    }`}
                  >
                    <span className="text-[14px] font-medium text-white/45">$</span>
                    <input
                      inputMode="decimal"
                      value={liquidityUsd}
                      onChange={(e) => {
                        if (/^\d*\.?\d*$/.test(e.target.value)) setLiquidityUsd(e.target.value);
                      }}
                      placeholder={t("liquidityPlaceholder", { amount: money.format(entryFeeUsd) })}
                      className="tnum w-full min-w-0 bg-transparent py-2.5 font-sans text-[14px] text-white outline-none placeholder:text-white/30"
                    />
                  </label>
                  <button
                    ref={liquidityBtnRef}
                    type="button"
                    onClick={() => void onAddLiquidity()}
                    disabled={!liquidityReady}
                    className="border-accent/40 bg-accent/14 text-accent hover:bg-accent/22 shrink-0 cursor-pointer rounded-[12px] border px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {wagering
                      ? t("ctaPlacing")
                      : liquidityReady
                        ? t("liquidityCtaAmount", { amount: money.format(liquidityAmountUsd) })
                        : t("liquidityCta")}
                  </button>
                </div>
                <div
                  className={`mt-2 text-[12px] leading-relaxed font-normal ${
                    liquidityBelowMin || liquidityOverBalance ? "text-[#e3a49a]" : "text-white/45"
                  }`}
                >
                  {liquidityBelowMin
                    ? t("liquidityMin", { amount: money.format(entryFeeUsd) })
                    : liquidityOverBalance
                      ? tBuySellNotEnough
                      : t("liquidityHint", { amount: money.format(entryFeeUsd) })}
                </div>
              </div>
            )}

            {/* Balance. Add money only shows when the play CTA isn't already
                saying it. */}
            <div className="mt-3">
              <GameBalanceCard
                balanceUsd={balanceUsd}
                canWithdraw={balanceEth > 0}
                showAddMoney={canPlay}
                onWithdraw={() => setWithdrawOpen(true)}
                onAddMoney={() => setFundOpen(true)}
              />
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
          <ShareGame gameId={gameId} className="hidden min-[980px]:block" />
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
              <div className="text-[11.5px] font-normal text-white/45">
                {t("hallSubtitleRound")}
              </div>
            </div>
          </div>
        </div>

        <WinnersList winners={winners} loading={winnersLoading} emptyLabel={t("hallEmpty")} />
      </div>

      <ModalShell open={fundOpen} onClose={() => setFundOpen(false)} contentKey="vault-fund">
        <FundSheet onClose={() => setFundOpen(false)} />
      </ModalShell>

      <ModalShell
        open={withdrawOpen && !!ethHolding}
        onClose={() => setWithdrawOpen(false)}
        contentKey="vault-withdraw"
      >
        {ethHolding
          ? renderWithdrawSheet(
              {
                symbol: ethHolding.symbol,
                name: ethHolding.name,
                network: ethHolding.network,
                address: ethHolding.address,
                decimals: ethHolding.decimals,
                balance: ethHolding.balance,
                rawBalance: ethHolding.rawBalance,
                priceUsd: ethHolding.priceUsd,
                logo: ethHolding.logo,
              },
              () => setWithdrawOpen(false)
            )
          : null}
      </ModalShell>

      <RoundOverlay
        phase={phase}
        youWon={youWon}
        winnerIsStarter={winnerIsStarter}
        winnerPct={split.winner / 100}
        starterPct={split.starter / 100}
        winnerLabel={winnerLabel}
        prizeValue={revealPrizeUsd}
        prizeLabel={money.format(revealPrizeUsd)}
        formatMoney={money.format}
        onClose={() => setPhase(null)}
      />
    </div>
  );
}
