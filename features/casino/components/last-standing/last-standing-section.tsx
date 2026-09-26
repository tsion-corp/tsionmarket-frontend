"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useNow, useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSquareAvatar } from "@/hooks/use-square-avatar";
import { Pager } from "@/components/ui/pager";
import { QrCode } from "@/components/ui/qr-code";
import { useMoney } from "@/components/ui/currency-select";
import { HowItWorks } from "@/features/casino/components/last-standing/how-it-works";
import {
  ActivityPanel,
  type ActivityRow,
} from "@/features/casino/components/last-standing/activity-panel";
import {
  StageCard,
  type StageChip,
  type StageLeader,
  type StagePhase,
} from "@/features/casino/components/last-standing/stage-card";
import {
  RailActionCard,
  RailCardFrame,
  RailClaimCard,
  RailInviteCard,
  RailPager,
} from "@/features/casino/components/last-standing/rail-cards";
import { estimateWinnerPayout, isSameAddress } from "@/features/casino/lib/last-standing/split";
import { vaultLog } from "@/features/casino/lib/last-standing/log";
import { readChainGameStatus } from "@/features/casino/lib/last-standing/chain-status";
import {
  detectTier,
  openMiniWindow,
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
import { GAME_ASSET, unitsToUsd, usdToUnits } from "@/features/casino/lib/last-standing/stake";
import { followGame } from "@/features/casino/lib/last-standing/followed-game";
import { useGameShare } from "@/features/casino/components/last-standing/share-game";
import {
  GameBroadcastProvider,
  GoLivePanel,
  isBroadcastOngoing,
  type BroadcastCopy,
} from "@/features/casino/components/broadcast";
import {
  useGameBroadcast,
  type GameBroadcastTarget,
} from "@/features/casino/hooks/use-game-broadcast";
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
import { useVaultActions } from "@/features/casino/hooks/use-vault-actions";
import { useVaultPendingWinnings } from "@/features/casino/hooks/use-vault-winnings";
import { useGameBalance } from "@/features/casino/hooks/use-game-balance";
import { usePayoutRefresh } from "@/features/casino/hooks/use-payout-refresh";
import { useVaultShine } from "@/features/casino/hooks/use-arcade-shine";
import { useVaultParams } from "@/features/casino/hooks/use-vault-params";
import { usdOf } from "@/features/casino/lib/last-standing/pricing";
import { activityAmount } from "@/features/casino/lib/last-standing/activity-payout";
import { usePrices } from "@/hooks/use-prices";
import { usePaged } from "@/hooks/use-paged";
import {
  resolveRoundEndConfirmation,
  resolveChainRoundEnd,
  shouldBeginRoundEnd,
} from "@/features/casino/lib/last-standing/round-end";
import {
  currentRoundCount,
  currentRunActivities,
} from "@/features/casino/lib/last-standing/rounds";
import { useLeavePrompt } from "@/features/casino/hooks/use-leave-prompt";
import { KeepWatchingDialog } from "@/features/casino/components/last-standing/keep-watching-dialog";
import { truncateAddress } from "@/lib/format";
import { friendlyError, isAlreadySettledError } from "@/lib/errors";
import {
  isMusicPlaying,
  setUrgentMode,
  armMusicOnGesture,
  disarmMusic,
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
import { GAME_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";

const EXPLORER_TX_URL = "https://basescan.org/tx/";
// How long to keep re-checking after a win, and how often. The settle window
// drives BOTH the game resync (status/winners/pot — so the table, pool and
// timer converge seconds after the clock dies, not on the socket's ~10s
// cadence) and the balance re-check for the credited winnings.
// Longer than any sponsored wager realistically takes to land, so a wager that
// never confirms cannot hold the verdict back for the rest of the round.
const OWN_WAGER_HOLD_MS = 25_000;
const WIN_POLL_WINDOW_MS = 30_000;
const WIN_POLL_INTERVAL_MS = 2_500;
// Suspense window shown to everyone the moment a round ends, before revealing
// whether this wallet won. Builds anticipation and covers the brief gap while
// the result settles.
const CALCULATING_MS = 1_200;

// How long the winner waits for the backend keeper to settle a finished round
// before settling it from their own wallet. The keeper lands about five
// seconds after expiry (measured 2026-09-10); the grace leaves room for a slow
// block and still keeps the payout in the winner's hands if the keeper is
// down. One settlement transaction per round instead of two.
const KEEPER_GRACE_MS = 15_000;

// How long the arena waits for the service to confirm a round ended before
// trusting its own clock. The service is usually seconds behind; long enough
// to catch a buzzer-beater wager, short enough that 00:00 is never dead air.
const ROUND_END_CONFIRM_MS = 6_000;

// How long an "inactive" report has to hold before the suspense opens. Long
// enough for a buzzer-beater wager to be indexed and put time back on the
// clock, short enough that a real ending does not feel stalled.
const ROUND_END_SETTLE_MS = 2_000;
// How many feed rows to show per page in the activity and winners cards.
const FEED_PAGE_SIZE = 10;
// How often the relative times in the activity table are recomputed. The clock
// beside them already re-renders every second, so this costs nothing.
const FEED_TIME_REFRESH_MS = 60_000;

// An address the contract uses for "nobody". A game with this as its king has
// had no confirmed play, so there is no leader to draw and no face to derive.
const NO_ADDRESS = "0x0000000000000000000000000000000000000000";

// The wall clock, read from inside event handlers. Through a function so the
// compiler does not take a handler defined in the component for render work.
const clockNow = () => Date.now();

// The raised face worn by both controls in the stage card's top-right corner.
// Reproduced from CHROME_PILL and PILL_SHADOW in
// components/last-standing/rail-cards.tsx — same gradient angle (179.583deg)
// and stop positions, same shadow geometry — rather than imported: features
// share through lib/, not sideways, and those values are that card's own.
//
// Two deliberate departures from the rail's pill. The face stays in a dark
// neutral family instead of going chrome or gold: gold is the primary call to
// action's, and a corner control must not compete with the button that starts
// a game. And the lit top edge drops from the rail's 0.95 white to 0.24,
// because 0.95 over a dark face is a bright seam rather than a highlight.
// Every colour for these controls is in this one object.
const CORNER_PILL: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(179.583deg, #3d3d42 2.3594%, #313135 38.566%, #26262a 62.387%, #33333a 97.641%)",
  boxShadow: "inset 0 0.619px 0 rgba(255, 255, 255, 0.24), 0 1.238px 2.477px rgba(0, 0, 0, 0.5)",
};

/**
 * One corner control. Both the sound switch and the pop-out switch render
 * through this, so "exactly like the sound button" is true by construction
 * rather than by a copy that drifts on the next change.
 *
 * Both are toggles that say which state they are in, so both take `pressed`
 * and expose it as `aria-pressed`: the label alone is the state, and a screen
 * reader should hear the same thing the eye reads.
 */
function CornerPill({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      // No border: the lit top edge and the shadow beneath are what say it
      // stands off the card, and an outline on top of them reads as a painted
      // pill again.
      style={CORNER_PILL}
      className="ws-pressable flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white/85 hover:text-white"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        {children}
      </svg>
      {label}
    </button>
  );
}

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
    <CornerPill
      label={playing ? t("soundMute") : t("soundPlay")}
      pressed={playing}
      onClick={toggle}
    >
      {playing ? <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" /> : <path d="M8 5v14l11-7L8 5Z" />}
    </CornerPill>
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
      className="shrink-0 text-white/70"
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

/**
 * The activity table's "when", in the design's short form (844:79535):
 * "Just now" under a minute, then whole minutes, hours and days, each floored
 * ("1 min ago", "3 h ago", "2 d ago"). Intl's relativeTime spells the unit out
 * ("1 minute ago") and says "now", which the design does not, so the wording
 * comes from the catalogue instead. A timestamp slightly ahead of this
 * client's clock (skew) reads as "Just now" rather than a negative count.
 */
export function shortTimeAgo(
  then: Date,
  now: Date,
  t: (
    key: "timeJustNow" | "timeMinutesAgo" | "timeHoursAgo" | "timeDaysAgo",
    values?: { count: number }
  ) => string
): string {
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return t("timeJustNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("timeMinutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("timeHoursAgo", { count: hours });
  return t("timeDaysAgo", { count: Math.floor(hours / 24) });
}

/**
 * The page's own heading: the trail back to the Arkade, the title, the status
 * pill and the tagline. Split out because the error state below draws the same
 * frame, and a screen that fails to load should still say what it is.
 */
/**
 * A named game puts the starter's own name and words in the heading, since
 * that is what says which game you are looking at. An unnamed one falls back
 * to the product's name and tagline.
 */
function PageHeader({
  pill,
  title,
  description,
}: {
  pill: { label: string; live: boolean; ended: boolean };
  title?: string | null;
  description?: string | null;
}) {
  const t = useTranslations("casino.lastStanding");
  const tSections = useTranslations("sections");
  const named = typeof title === "string" && title.trim() !== "";
  const heading = named ? title.trim() : t("title");
  const sub = named && description?.trim() ? description.trim() : t("tagline");

  return (
    <header>
      {/* Figma 844:79664: Mona Sans Bold 14, the trail grey and the current
          page amber in every state, live or not. */}
      <nav
        aria-label={t("title")}
        data-testid="lms-breadcrumb"
        className="flex items-center gap-[0.3em] font-serif text-[14px] leading-none font-bold text-[#8a8a8a]"
      >
        <Link href="/casino" className="transition-colors hover:text-white/70">
          {tSections("casino")}
        </Link>
        <span aria-hidden>/</span>
        <span
          data-testid="lms-crumb-current"
          data-live={String(pill.live)}
          aria-current="page"
          className="text-[#ffe178]"
        >
          {t("title")}
        </span>
      </nav>

      {/* 24 from the trail to the title (914:83409), 17 from the title to the
          pill (844:79666), 12 down to the tagline (844:79665). */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-[17px] gap-y-3">
          {/* Figma 844:79667: Mona Sans Bold 36, leading 1.1, -1.08px (-0.03em).
              Scales down on a phone and settles at 36 on a desktop. */}
          <h1
            data-testid="lms-heading"
            className="min-w-0 font-serif text-[clamp(28px,4.4vw,36px)] leading-[1.1] font-bold tracking-[-0.03em] break-words text-white"
          >
            {heading}
          </h1>
          {/* Figma 844:79668 (Live) and 844:78319 (Ended): one neutral pill.
              Only the live one carries the static yellow dot. */}
          <span
            data-testid="lms-pill"
            data-live={String(pill.live)}
            className={`inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-white/30 bg-white/[0.13] font-serif text-[14px] leading-none font-semibold whitespace-nowrap text-[#e0e0e0] ${
              pill.live ? "pr-[13px] pl-2" : "px-3"
            }`}
          >
            {pill.live ? (
              <span
                aria-hidden
                data-testid="lms-pill-dot"
                className="size-[7.4px] shrink-0 rounded-full bg-[#FBE35C]"
              />
            ) : null}
            {pill.label}
          </span>
        </div>
      </div>

      {/* Figma 844:79670: Mona Sans SemiBold 14, grey, leading 1. */}
      {/* One clamped line, as the lobby card has it. */}
      <p
        data-testid="lms-subheading"
        className="mt-3 line-clamp-1 max-w-[60ch] font-serif text-[14px] leading-[1.35] font-semibold tracking-[-0.01em] text-[#8a8a8a]"
      >
        {sub}
      </p>
    </header>
  );
}

interface LastStandingSectionProps {
  /** Which game this screen is showing. The vault runs many at once. */
  gameId: number;
  /** Opens the deposit flow for a player whose balance is under the entry. */
  onAddFunds?: () => void;
}

/** Which rail card is on screen. The state decides which of these exist. */
type RailCardId = "action" | "claim" | "invite" | "broadcast";

// The copy the broadcast panel needs. It is English while the rest of the page
// is translated: the panel carries no catalogue yet.
const BROADCAST_COPY: BroadcastCopy = {
  subject: "the arena",
  finishedNotice:
    "This game has settled. End the broadcast so you are not streaming a finished game.",
};
/** Which of the bottom panel's three tabs is open. */
type PanelTab = "activity" | "rules";

export function LastStandingSection({ gameId, onAddFunds }: LastStandingSectionProps) {
  const t = useTranslations("casino.lastStanding");
  const { evmAddress: address } = useAuthSession();
  // One identity across the ecosystem: the picture this player set on Market
  // Square is their picture here too. Only ever theirs — the backend has no
  // address-to-avatar mapping yet, so every other player keeps the face drawn
  // from their address. Null is the ordinary answer (see the hook), which is
  // why nothing here waits on it or retries: the drawn face is already right.
  const selfAvatar = useSquareAvatar();
  const money = useMoney();
  // One "now" for every relative time in the table, refreshed on its own slow
  // interval rather than read during render, which would make the render
  // impure and the output untestable.
  const feedNow = useNow({ updateInterval: FEED_TIME_REFRESH_MS });
  // The stake and the payout move the USDC balance, and the portfolio's own
  // receipt path cannot see them, so this hook is told the amounts and confirms
  // them with one read of Base. There is no balance card on this screen any
  // more — the balance is the one the shell already shows — but `balanceUsd`
  // still decides whether the entry is affordable, and `balanceUnits` is the
  // ceiling the stake stepper may not step past.
  const { balanceUsd, balanceUnits, settle: settleBalance } = useGameBalance();
  const {
    game,
    loading: statusLoading,
    error: gameError,
    notFound: gameNotFound,
    connected,
    degraded,
    resync: resyncGame,
  } = useVaultGame(gameId);
  // This game's plays and this game's result, not every game's.
  const { activities, winners, activitiesLoading } = useVaultFeeds(connected, gameId);
  const { wager, wagering, claim, claiming, settle, settling } = useVaultActions();
  const share = useGameShare(gameId);

  // This game's own rows, narrowed to the run being played: the vault reuses a
  // game id when the contract is redeployed, so the feed can also hold a
  // finished game's plays. The round number counts these, and the table shows
  // them.
  // Oldest first, which is the order the round count is measured in.
  const runActivities = useMemo(() => currentRunActivities(activities) ?? [], [activities]);
  // The table reads the other way round: newest at the top.
  const feedActivities = useMemo(() => [...runActivities].reverse(), [runActivities]);
  const roundCount = useMemo(() => currentRoundCount(activities), [activities]);

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
  // When the local clock hit zero and the arena started asking the service
  // whether the round really ended. Null when it is not asking.
  const [confirmingSince, setConfirmingSince] = useState<number | null>(null);
  const [roundPrizeUsd, setRoundPrizeUsd] = useState<number | null>(null);
  // The winner being revealed (full address, held only in memory). youWon and
  // the truncated label are derived from it at render, so the reveal has a
  // single source of truth and no state to keep in sync.
  const [revealWinner, setRevealWinner] = useState<string | null>(null);
  // Shows the "you won, balance updating" banner briefly after a win.
  const [recentWinUsd, setRecentWinUsd] = useState<number | null>(null);
  // Which bottom tab is open, and which rail card the pager is on.
  const [tab, setTab] = useState<PanelTab>("activity");
  // Held as the card the player picked, not an index, so a card appearing or
  // leaving does not slide the rail onto a different one. Tagged with the
  // round state it was picked in: when the round ends the pick lapses and the
  // rail opens on the new state's first card, which is claim for a winner.
  const [railPick, setRailPick] = useState<{ card: RailCardId; roundOver: boolean } | null>(null);

  // The broadcast lives up here rather than inside its panel: whether this
  // session is streaming decides whether the rail offers the broadcast card
  // at all once the round is over. The arena is all motion (the countdown,
  // the pot, the coin flights), so it is published for framerate.
  const broadcastTarget = useMemo<GameBroadcastTarget>(
    () => ({
      game: "last-standing",
      ref: String(gameId),
      title: `The Last Man: game ${gameId}`,
      watchPath: `/casino/last-standing/${gameId}`,
      descriptionLead: "Live on Ark. Outlast everyone:",
      content: "motion",
      creatorApplicationNote: "I play The Last Man on Ark and want to broadcast my games.",
    }),
    [gameId]
  );
  const broadcast = useGameBroadcast(broadcastTarget);

  const reduce = useReducedMotion();

  // Leaving the arena stops the track — background music must not follow the
  // user to the portfolio.
  useEffect(() => stopMusic, []);

  // A payout the contract could not push, straight from the contract. Read
  // once here, and again on the events that can change it: a settlement that
  // names this wallet, and this wallet's own settle or claim.
  // A list, not a number: a wallet can be owed in more than one asset, and a
  // USDC payout never shows in the service's legacy native `pendingWei`.
  const { pending, hasPending, refetch: refetchWinnings } = useVaultPendingWinnings(address);

  // Derived reveal state: did this wallet win, and how to name the winner.
  const youWon = !!(
    revealWinner &&
    address &&
    revealWinner.toLowerCase() === address.toLowerCase()
  );
  const winnerLabel = revealWinner ? truncateAddress(revealWinner) : null;

  // Both feeds page 10 rows at a time so the cards don't grow unbounded.
  const pagedActivities = usePaged(feedActivities, FEED_PAGE_SIZE);

  // The balance the player spends from is their own money on the platform. We
  // present everything as plain dollars — the underlying asset (ETH on Base)
  // is never shown, so it feels like moving cash between accounts.
  // What the entry costs, in dollars.
  //
  // `usdValue` is native-only by the service's own contract and comes back as 0
  // for a token game, so reading it alone would price every USDC entry at
  // nothing and leave canPlay false for a funded player. A USDC amount IS a
  // dollar amount, so for the game asset the amount is the answer.
  // Only an ETH game needs this; a USDC amount is already a dollar figure.
  const ethPrice = usePrices(["ETH"])["ETH"] ?? 0;
  const entryFee = status?.entryFee ?? null;
  const entryFeeUsd = entryFee
    ? entryFee.tokenSymbol === GAME_ASSET.symbol
      ? Number(entryFee.amount)
      : entryFee.usdValue
    : 0;
  const entryFeeEth =
    entryFee && entryFee.tokenSymbol !== GAME_ASSET.symbol ? Number(entryFee.amount) : 0;
  // Affordable in DOLLARS, against the USDC balance. It used to compare the
  // entry against the wallet's ETH, which for a USDC game is a comparison
  // between two different currencies: a funded player reads as broke.
  const canPlay = entryFeeUsd > 0 && balanceUsd >= entryFeeUsd;
  // The primary CTA is in its "Add money to play" state — short on funds but
  // otherwise pressable. This gets the blinking nudge on the rail.
  const luring = !!status && !!address && !wagering && !canPlay;

  // An on-chain amount as money.
  //
  // The game is played in USDC now, which IS dollars, so the common path is a
  // straight divide by the asset's own scale with no price in it. ETH games can
  // still exist on v5 (we never start one, but we render one), and those go on
  // reading through the entry fee's own token/USD pair.
  //
  // What must never happen is the old shape: formatEther on every amount. A 20
  // USDC pot read at 18 decimals is 0.00000000002, which looks like an empty
  // game rather than a wrong one.
  const unitUsd = status && entryFeeEth > 0 ? entryFeeUsd / entryFeeEth : 0;
  const rawToMoney = (raw: string, decimals: number = GAME_ASSET.decimals): string => {
    try {
      const units = BigInt(raw);
      if (decimals === GAME_ASSET.decimals) return money.format(unitsToUsd(units));
      return money.format((Number(units) / 10 ** decimals) * unitUsd);
    } catch {
      return "—";
    }
  };

  // What the winner was actually paid, from the settlement row, falling back to
  // the client's own estimate only until that row lands.
  //
  // Two things here are easy to get wrong and were both wrong:
  //
  //   - `paidToWinner`, never `toWinner`. When the winner also started the
  //     game the contract pays both shares to the same wallet, so `toWinner`
  //     alone under-states it by the starter's tenth. Self-started wins are the
  //     common case here.
  //   - priced by asset, never `usdValue`. That field is native-only by the
  //     service's contract and is 0 for a USDC game, so reading it silently
  //     dropped through to the estimate below — and that estimate is built from
  //     a pot snapshot that goes stale when a wager lands at the buzzer. On
  //     game 3 it showed $0.23 for a $0.46 payout.
  const latestWinner = winners[0];
  const settledPrizeUsd = latestWinner
    ? usdOf(latestWinner.paidToWinner ?? latestWinner.toWinner, ethPrice)
    : null;
  // The pot as the settlement recorded it. The contract keeps a settled game's
  // pot on its own record after paying it out, so the live figure reads as
  // money still on the table; this is the only trustworthy final pot.
  const settledPotUsd = latestWinner ? usdOf(latestWinner.pot, ethPrice) : null;
  const revealPrizeUsd =
    latestWinner &&
    settledPrizeUsd !== null &&
    revealWinner &&
    latestWinner.winner.toLowerCase() === revealWinner.toLowerCase()
      ? settledPrizeUsd
      : (roundPrizeUsd ?? 0);

  // Only trust timeRemaining while a round is live. Once it is over the clock
  // reads 00:00: a v4 game does not have a next round to rest at.
  const gameActive = status?.gameActive ?? false;
  // The clock is out. In v4 a finished game is finished: a wager on it reverts,
  // so the play button has to give way to what can actually be done — settle
  // it, if nobody has, and go start another.
  /**
   * While this client's own wager is unresolved, the local clock reaching zero
   * proves nothing: the wager extends the round the moment it lands.
   *
   * Reported from the arena, 2026-09-22: a wager placed at five seconds was
   * still confirming when the clock hit zero, so the round-end sequence ran
   * and showed the player a winner card — then the wager landed, the pot went
   * to $0.76 and the round carried on. The back-out worked, but only after a
   * verdict had already been shown.
   *
   * Held until the round visibly extends, or until the wager has had longer to
   * land than any sponsored send realistically takes.
   */
  const ownWagerRef = useRef(false);
  const ownWagerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdRoundEnd = () => {
    ownWagerRef.current = true;
    if (ownWagerTimerRef.current) clearTimeout(ownWagerTimerRef.current);
    // A ceiling, not the usual path: a wager that never lands must not hold
    // the verdict back for the rest of the round.
    ownWagerTimerRef.current = setTimeout(() => {
      ownWagerRef.current = false;
    }, OWN_WAGER_HOLD_MS);
  };

  const releaseRoundEnd = () => {
    ownWagerRef.current = false;
    if (ownWagerTimerRef.current) {
      clearTimeout(ownWagerTimerRef.current);
      ownWagerTimerRef.current = null;
    }
  };

  const roundOver = !!status?.isGameStarted && !gameActive;

  // The arena starts its own sound off the first thing the player does here:
  // a move, a scroll, a tap. Calling startMusic outright would set the track
  // "playing" against a context the browser has suspended, and then nothing
  // would ever ask again.
  useEffect(() => {
    if (roundOver) return;
    return armMusicOnGesture();
  }, [roundOver]);

  // Offered only while there is still a round to miss.
  const leaving = useLeavePrompt(!roundOver);

  // The round is over: the groove has nothing left to score, and leaving it
  // running under a results screen reads as a page that did not notice.
  useEffect(() => {
    if (roundOver) {
      stopMusic();
      disarmMusic();
    }
  }, [roundOver]);
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
  // True once the keeper has had its grace after the round ended; only then
  // does the winner's own wallet settle. Reset when a fresh round goes live.
  const [keeperGraceOver, setKeeperGraceOver] = useState(false);

  // The contract's split, from the shared params read: the owner can retune
  // it, and the number a winner sees before settlement has to match what
  // settle() will pay.
  const { split } = useVaultParams();
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
    // The keeper gets its grace before the winner's wallet settles.
    setKeeperGraceOver(false);
    setTimeout(() => setKeeperGraceOver(true), KEEPER_GRACE_MS);
    vaultLog(`round ${gameId} ended`, { winner: winnerAddress, potUsd: potAtEndUsd });
    // Converge immediately: fresh status (pot/timer reset), winners table and
    // feed, not whenever the next socket push arrives. The balance waits for
    // the settlement row, which says exactly what was paid.
    resyncGame();
  };

  useEffect(() => {
    // Remember the pot while the round is live; it resets to 0 once paid out.
    if (gameActive && potUsd > 0) lastPotRef.current = potUsd;

    const wasActive = prevActiveRef.current;
    prevActiveRef.current = gameActive;
    // A fresh round going live re-arms the round-end sequence. The keeper
    // grace is re-armed by beginRoundEnd itself, at the next round end.
    if (gameActive) roundEndedRef.current = false;
    // A live round looks over (active -> inactive). This is a SIGNAL, not the
    // verdict: `active` is derived from endTime, so a wager landing at the
    // buzzer leaves a window where the service says inactive before the
    // extension is indexed. Opening the suspense here directly is what showed
    // a winner card on a round that then carried on, so it goes through the
    // same confirm step the local clock uses.
    if (
      wasActive &&
      !gameActive &&
      phase === null &&
      !roundEndedRef.current &&
      confirmingSince === null
    ) {
      setConfirmingSince(clockNow());
      resyncGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameActive, confirmingSince]);

  // The client's own clock reaching zero is a SIGNAL, not the verdict. The
  // arena used to open the winner suspense on it and back out later if the
  // round turned out to be running; to a player that reads as the game
  // glitching at the exact moment money is decided.
  //
  // So zero starts a confirm step instead: ask the service, keep the timer on
  // screen, and only open the suspense once the service agrees the round has
  // ended. If a buzzer-beater wager put time back on the clock, the timer
  // simply carries on and no winner was ever suggested.
  useEffect(() => {
    // The conditions live in lib/last-standing/round-end, where they are
    // tested: getting this wrong shows a winner card for a running round.
    if (
      !shouldBeginRoundEnd({
        gameActive,
        countdown,
        alreadyEnding: confirmingSince !== null || phase !== null || roundEndedRef.current,
        degraded,
        ownWagerPending: ownWagerRef.current,
      })
    ) {
      return;
    }
    setConfirmingSince(clockNow());
    // Ask now rather than waiting for the next socket push or poll tick.
    resyncGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, gameActive, phase, degraded, confirmingSince]);

  // The confirm step's verdict. Re-runs on every status change and on its own
  // tick, so a service that answers in 200ms is not made to wait for a poll.
  useEffect(() => {
    if (confirmingSince === null) return;
    let done = false;

    const toastId = toast.loading(t("toastCheckingRound"));

    const settle = (verdict: "ended" | "continued") => {
      if (done) return;
      done = true;
      setConfirmingSince(null);
      if (verdict === "ended") {
        toast.dismiss(toastId);
        beginRoundEnd(lastPlayer, lastPotRef.current || potUsd);
        return;
      }
      roundEndedRef.current = false;
      toast.info(t("toastRoundContinued"), { id: toastId });
    };

    // The contract settles it outright when it answers.
    void readChainGameStatus(gameId)
      .then((status) => {
        if (status) settle(resolveChainRoundEnd(status));
      })
      .catch((error: unknown) => vaultLog("round-end chain read failed", { error: String(error) }));

    // The service's answer, for a chain read that fails or is slow.
    const decide = () => {
      const verdict = resolveRoundEndConfirmation({
        gameActive,
        countdown,
        waitedMs: clockNow() - confirmingSince,
        maxWaitMs: ROUND_END_CONFIRM_MS,
        settleMs: ROUND_END_SETTLE_MS,
      });
      if (verdict !== "wait") settle(verdict);
    };

    decide();
    const id = setInterval(decide, 500);
    return () => {
      clearInterval(id);
      if (!done) toast.dismiss(toastId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingSince, gameActive, countdown]);

  // The wager landed and the round is plainly running again, so the hold has
  // done its job. Also cleared on unmount, so no timer fires into a gone
  // component.
  useEffect(() => {
    if (gameActive && countdown > 3) releaseRoundEnd();
  }, [gameActive, countdown]);
  useEffect(() => () => releaseRoundEnd(), []);

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
    // paidToWinner, not toWinner: a self-started win pays both shares to the
    // one wallet. Priced by asset, because usdValue is 0 for a token game.
    const paidUsd = usdOf(latest.paidToWinner ?? latest.toWinner, ethPrice) ?? 0;
    const id = setTimeout(() => {
      setRevealWinner(winnerAddress);
      setRoundPrizeUsd(paidUsd);
      setRecentWinUsd(paidUsd);
      setPhase("won");
      setPollUntil(Date.now() + WIN_POLL_WINDOW_MS);
    }, 0);
    return () => clearTimeout(id);
  }, [winners, address, phase, ethPrice]);

  // The payout, credited the moment the settle frame or the winners row lands.
  usePayoutRefresh(address, winners);

  // Shine: a won round posts itself to Market Square.
  //
  // `phase === "won"` is the one point the three announcements converge on —
  // the live reveal above, the winners-feed fallback above it, and whichever
  // settlement follows. It is also the first point PAST THE BACK-OUT: the
  // reveal re-reads the status after its suspense and abandons the round when
  // a wager landed at the buzzer, and it does that before the phase moves.
  // Reporting from the round-end signal instead would publish a win that the
  // next check retracts, with nothing to retract it with.
  useVaultShine(gameId, phase === "won" && youWon);

  // Brief post-round re-check so the settlement row and the reset status
  // appear quickly; self-clearing once the window passes.
  useEffect(() => {
    if (pollUntil <= Date.now()) return;
    const id = setInterval(() => {
      if (Date.now() > pollUntil) {
        clearInterval(id);
        return;
      }
      resyncGame();
    }, WIN_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollUntil, resyncGame]);

  // Auto-dismiss the "you won" banner after the balance has had time to update.
  useEffect(() => {
    if (recentWinUsd === null) return;
    const id = setTimeout(() => setRecentWinUsd(null), WIN_POLL_WINDOW_MS);
    return () => clearTimeout(id);
  }, [recentWinUsd]);

  // Sweep a payout the contract could not push. Rare: settle() pays wallets
  // directly and only a failed transfer is held in pendingWithdrawals.
  //
  // One claim per asset owed, because claim() takes the asset from v5 on.
  // Guarded so it never fires an empty claim.
  const onClaim = async () => {
    if (!hasPending || claiming) return;
    const id = toast.loading(t("toastClaiming"));
    const owed = pending;
    try {
      for (const payout of owed) await claim(payout.token);
      toast.success(t("toastClaimed"), { id });
      playClaimSound();
      void refetchWinnings();
      void settleBalance();
    } catch (e) {
      toast.error(friendlyError(e, t("toastClaimFailed")), { id });
    }
  };

  // Auto-claim: if a win lands in pendingWithdrawals instead of the wallet,
  // collect it automatically so "winner takes the pot" actually pays out. The
  // claim card in the rail is the fallback for anything left unclaimed.
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
        const pot = lastPotRef.current || potUsd;
        // The three shares from the contract's live split, not from a rate
        // written down here: the owner can retune it, and a report that
        // divided the pot by a hardcoded rate would restate old rounds.
        // The treasury takes whatever the winner and the starter do not.
        track("last_man_ended", {
          game_id: String(gameId),
          pot_usd: pot,
          winner_payout_usd: revealPrizeUsd,
          creator_usd: (pot * splitStarterBps) / 10_000,
          house_usd: (pot * (10_000 - splitWinnerBps - splitStarterBps)) / 10_000,
        });
      }
    }
  }, [phase, youWon, potUsd, revealPrizeUsd, gameId, splitWinnerBps, splitStarterBps]);
  useEffect(() => {
    if (wonPendingRef.current && hasPending && !claiming) {
      wonPendingRef.current = false;
      claimRef.current();
    }
  }, [hasPending, claiming]);

  // Settle the game I just won, if the keeper has not. Every game on this
  // contract sat unsettled for a day before the client could settle at all;
  // now the backend keeper settles within seconds of expiry, so the winner's
  // wallet only steps in after the keeper's grace, when the service still
  // reports the game unsettled. When the keeper gets there first this reverts
  // AlreadySettled, which is the outcome we wanted, not a failure. Anyone may
  // settle once the clock is out; the winner does it here, gasless like every
  // other vault action, and once per game.
  const settledGameRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "won" || !youWon || settling || !keeperGraceOver) return;
    if (settledGameRef.current === gameId) return;
    if (game?.settled) return;
    settledGameRef.current = gameId;
    vaultLog(`round ${gameId}: keeper did not settle within the grace, settling from the wallet`);
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
  }, [phase, youWon, gameId, settling, game?.settled, keeperGraceOver]);

  // The settlement landed, from the keeper or from anyone. A payout the
  // contract could not push is now the only thing left to check, and only
  // for a wallet the settlement paid: the winner and the starter.
  const settledNow = game?.settled === true;
  const paidByThisSettlement =
    !!address &&
    (isSameAddress(address, game?.king ?? null) || isSameAddress(address, game?.starter ?? null));
  useEffect(() => {
    if (!settledNow) return;
    vaultLog(`round ${gameId} settled`, { paidHere: paidByThisSettlement });
    if (paidByThisSettlement) void refetchWinnings();
    // refetchWinnings is stable; the read is keyed on the settlement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledNow, gameId, paidByThisSettlement]);

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

  // One wager, whatever the size: the minimum from the stepper's floor, or
  // more from a stepped-up stake. The contract's wager(gameId) takes any value
  // at or above the game's minimum; either way the sender becomes last
  // standing and the clock resets, so the two share every step after the
  // amount.
  const placeWager = async (amountUnits: bigint, amountUsd: number, from: HTMLElement | null) => {
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
    holdRoundEnd();
    try {
      await wager(gameId, amountUnits);
      followGame(gameId);
      // Buying into the round. `game_staked` is not sent beside it any more:
      // this event carries the money, and both would count one buy-in twice.
      track("last_man_joined", { game_id: String(gameId), entry_fee_usd: amountUsd });
      toast.success(t("toastYoureIn"), { id: toastId });
      playWagerSound();
      // The wager just landed on-chain, but the backend indexes it a moment
      // later — resync now and keep the fast settle-poll running briefly so
      // the pot, timer and last-player reflect this play within seconds
      // (the socket push alone can be ~10s away, or absent when offline).
      resyncGame();
      setPollUntil(clockNow() + WIN_POLL_WINDOW_MS);
      void settleBalance();
      return true;
    } catch (e) {
      // It will never land, so it must not hold the verdict back.
      releaseRoundEnd();
      track("last_man_failed", {
        game_id: String(gameId),
        entry_fee_usd: amountUsd,
        ...reasonFor(GAME_FAILURE, e),
      });
      toast.error(friendlyError(e, t("toastPlayFailed")), { id: toastId });
      return false;
    }
  };

  // The stake, in the game asset's base units, and the steps it moves in.
  //
  // That game's minimum, not a global fee: the starter set it when they opened
  // the game, and the contract rejects anything under it. The entry arrives
  // from the service already at the game's own scale, so it is parsed at that
  // scale. parseEther here would send a 10-cent wager as 100000000000000000
  // base units of a 6-decimal token.
  //
  // Held as bigint, never as a typed dollar string: the number the player sees
  // is derived from these units at the display edge, so what is shown and what
  // is signed can never drift apart.
  const minStakeUnits = usdToUnits(Number(status?.entryFee.amount ?? "0"));
  const [stakeUnits, setStakeUnits] = useState<bigint | null>(null);
  // Null means "whatever the minimum turns out to be", so a stake chosen
  // before the game loaded cannot pin the stepper at zero.
  const stake = stakeUnits !== null && stakeUnits >= minStakeUnits ? stakeUnits : minStakeUnits;
  const stakeUsd = unitsToUsd(stake);
  const canStepStakeUp = minStakeUnits > 0n && stake + minStakeUnits <= balanceUnits;
  const canStepStakeDown = minStakeUnits > 0n && stake - minStakeUnits >= minStakeUnits;

  // Clamped, not rejected: under the game's minimum is what the contract
  // reverts, over the balance is what the player cannot pay.
  const onEditStake = (text: string) => {
    const usd = money.fromInput(text);
    if (usd === null || minStakeUnits <= 0n) return;
    const wanted = usdToUnits(usd);
    if (wanted < minStakeUnits) setStakeUnits(minStakeUnits);
    else if (wanted > balanceUnits)
      setStakeUnits(balanceUnits > minStakeUnits ? balanceUnits : minStakeUnits);
    else setStakeUnits(wanted);
  };

  const onPlay = async () => {
    if (!canPlay) {
      // The CTA already reads "Add money to play", so pressing it opens the
      // deposit flow. Only without one is there nothing to do but say so.
      if (onAddFunds) {
        onAddFunds();
        return;
      }
      toast.error(t("toastBalanceShort"));
      return;
    }
    const ok = await placeWager(stake, stakeUsd, playBtnRef.current);
    // Back to the minimum, so the next play does not silently repeat a stake
    // the player chose once for one round.
    if (ok) setStakeUnits(null);
  };

  // Nothing to draw the arena from: the service could not be reached and the
  // contract could not be read either, or the id was never a game. Said
  // plainly, with the one action that helps, instead of a pot skeleton and a
  // "Loading…" button that never resolve. A game already on screen never
  // comes through here; a failed refetch keeps it up under the degraded
  // banner.
  if (!game && !statusLoading && gameError) {
    return (
      <div className="relative mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
        <PageHeader pill={{ label: t("pillNotStarted"), live: false, ended: false }} />
        <div role="alert" className="ws-inset mt-6 max-w-[560px] px-5 py-6">
          <div className="flex items-center gap-2.5">
            {gameNotFound ? null : <WifiOffIcon size={18} />}
            <div className="text-[15px] font-bold text-white">
              {gameNotFound ? t("gameNotFoundTitle") : t("gameLoadFailedTitle")}
            </div>
          </div>
          <p className="mt-2 text-[13.5px] leading-[1.6] font-normal text-white/60">
            {gameNotFound ? t("gameNotFoundBody") : t("gameLoadFailedBody")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {gameNotFound ? null : (
              <button
                type="button"
                onClick={resyncGame}
                className="bg-accent cursor-pointer rounded-[12px] px-4 py-2 text-[13.5px] font-semibold text-black"
              >
                {t("retry")}
              </button>
            )}
            <Link
              href="/casino/last-standing"
              className="cursor-pointer rounded-[12px] border border-white/15 px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:border-white/35"
            >
              {t("backToLobby")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // What the new frame draws. Every value below is derived from the state
  // machine above and handed down already formatted: the cards hold no logic,
  // so anything that can be got wrong is got wrong here or not at all.
  // ---------------------------------------------------------------------------

  // A game whose king is the zero address has had no confirmed play. The
  // contract's own starter is normally the first king, so this is rare, but a
  // leader strip reading "0x0000…0000" is the alternative.
  const hasLeader = !!lastPlayer && !isSameAddress(lastPlayer, NO_ADDRESS);
  // The round is over and this wallet was the last one standing. Either the
  // reveal said so, or the finished game's own king is this wallet, which is
  // the same fact read from the server for someone coming back later.
  const iAmWinner = roundOver && (youWon || iAmKing);

  const stagePhase: StagePhase = !status
    ? "notStarted"
    : roundOver
      ? iAmWinner
        ? "won"
        : "ended"
      : hasLeader
        ? "live"
        : "notStarted";

  const leaderIsStarter = isSameAddress(lastPlayer, starter);
  // The pot the settlement recorded, or nothing at all once a game is settled:
  // the live figure is the contract's own stale record and would read as money
  // still on the table.
  const potTileUsd = game?.settled ? (settledPotUsd ?? 0) : potUsd;
  const finalPotUsd = settledPotUsd ?? potUsd;
  const winnerShareUsd = roundOver
    ? (settledPrizeUsd ?? estimateWinnerPayout(finalPotUsd, leaderIsStarter, split))
    : estimateWinnerPayout(potUsd, leaderIsStarter, split);

  const leaderName = hasLeader ? truncateAddress(lastPlayer) : "";
  const stageLeader: StageLeader | null = hasLeader
    ? {
        label: roundOver
          ? t("stageRoundWinner")
          : iAmLastStanding
            ? t("stageLeadingYou")
            : t("stageLeadingOther"),
        value: iAmKing ? `${t("youLabel")} - ${leaderName}` : leaderName,
        isYou: iAmKing,
        // Theirs when the king is them; anyone else stays the drawn face.
        avatarUrl: iAmKing ? selfAvatar : null,
        seed: lastPlayer,
      }
    : status
      ? {
          // Nobody leads, so the strip says so rather than naming a wallet.
          // The seed is deliberately empty of address characters: the avatar
          // draws a plain coloured disc instead of somebody's initials.
          label: t("stageNoLeader"),
          value: t("stageNoLeaderBody"),
          isYou: false,
          avatarUrl: null,
          seed: "0x",
        }
      : null;

  // Gold only for THIS wallet: "You" while it leads (#FFD02C) and "Winner" once
  // it has won (#F7A92F, 844:78328). When another player leads or won, the
  // design draws the dark outline pill instead — "Leading" at 916:84111 and
  // "Winner" at 918:86248 (Round Ended). `iAmKing` compares the round's last
  // player to this wallet, and the last player is the winner once it is over.
  const stageChip: StageChip | null = !hasLeader
    ? null
    : roundOver
      ? { label: t("chipWinner"), tone: iAmKing ? "winner" : "other" }
      : iAmKing
        ? { label: t("chipYou"), tone: "leading" }
        : { label: t("chipLeading"), tone: "other" };

  // No caption once the round is over: the ended (918:84758) and won
  // (844:77548) stages carry only their heading and the line under it.
  const stageCaption = roundOver ? "" : hasLeader ? t("stageCaptionLive") : t("stageCaptionStart");

  // The rail. A card is listed only when its action can actually be taken, so
  // the pager's length is the state's own answer to "what can I do here".
  const settleable = roundOver && game?.settled !== true;
  //
  //   live round:  action, invite, broadcast
  //   round over:  claim (when there is something to settle or collect),
  //                invite, and broadcast only while this session is still
  //                streaming, so a finished game's stream can be ended.
  const broadcasting = isBroadcastOngoing(broadcast.phase);
  const railCards: RailCardId[] = [];
  if (!roundOver && !!status) railCards.push("action");
  if (roundOver && (settleable || hasPending)) railCards.push("claim");
  // Always: a game is worth sharing whatever state it is in, and the starter
  // earns from everyone who joins through the link.
  railCards.push("invite");
  // A game is public, so anyone in it can stream it.
  if (!roundOver || broadcasting) railCards.push("broadcast");
  const picked =
    railPick && railPick.roundOver === roundOver && railCards.includes(railPick.card)
      ? railPick.card
      : null;
  const railIndex = picked ? railCards.indexOf(picked) : 0;
  const railCard = railCards[railIndex];
  // The dots sit inside whichever card is showing, at its foot, as every
  // frame of the design draws them.
  const railPager = (
    <RailPager
      count={railCards.length}
      index={railIndex}
      onSelect={(index) => {
        const card = railCards[index];
        if (card) setRailPick({ card, roundOver });
      }}
      itemLabel={(index, count) => t("pagerItem", { index: index + 1, count })}
    />
  );

  // Start or add: the same wager either way. Before the first play it opens
  // the round, which is why the copy changes but the action does not.
  const actionIsStart = !hasLeader;
  const ctaLabel = wagering
    ? t("ctaPlacing")
    : !status
      ? t("loading")
      : !canPlay
        ? t("ctaAddMoney")
        : actionIsStart
          ? t("railStartCta")
          : t("railAddCta");

  const pendingLabel = pending
    .map((payout) => rawToMoney(payout.raw.toString(), payout.amount.decimals))
    .join(" + ");
  // Claimed means the money reached the wallet: the round is settled and
  // nothing was left behind in the contract's pendingWithdrawals.
  const claimed = game?.settled === true && !hasPending;

  // What the panel draws instead of its table. Undefined on the activity tab,
  // and it has to be exactly undefined: the panel falls through to its own
  // table only when it is handed no body at all, and two JSX children would
  // reach it as an array of nulls that renders to nothing.
  const panelBody = tab === "rules" ? <HowItWorks /> : undefined;

  const rows: ActivityRow[] = pagedActivities.pageItems.map((a) => {
    // A win opened and won by the same wallet shows what that wallet
    // received, not the winner's share alone — see
    // lib/last-standing/activity-payout.
    const shown = activityAmount(a, winners);
    const mine = isSameAddress(a.address, address);
    return {
      id: a.id,
      address: a.address,
      addressLabel: truncateAddress(a.address),
      // The reader's own rows carry their Market Square picture. No
      // wallet-to-profile lookup exists on the square yet, so every other face
      // falls back to the mark derived from the address — when that lookup
      // lands, this is the line it replaces.
      avatarUrl: mine ? selfAvatar : null,
      action: a.action === "won" ? t("actionWon") : t("actionPlayed"),
      amount: rawToMoney(shown.raw ?? a.amountWei, shown.decimals),
      time: shortTimeAgo(new Date(a.createdAt), feedNow, t),
      isYou: mine,
      href: `${EXPLORER_TX_URL}${a.transactionHash}`,
    };
  });

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

      {/* Nothing sits beside the title any more. The rail's invite card carries
          the share link, so a second Share here was the same offer twice; the
          pop-out is offered on the way out, where it is actually wanted; and the
          sound switch has moved into the stage card's top-right corner, opposite
          the round label. */}
      <PageHeader
        pill={{
          label: gameActive ? t("pillLive") : roundOver ? t("pillEnded") : t("pillNotStarted"),
          live: gameActive,
          ended: roundOver,
        }}
        title={game?.title}
        description={game?.description}
      />

      {/* The socket is behind, so nothing on this page is evidence of
          anything. The clock is dimmed and frozen beside this; the banner is
          what says why. */}
      {degraded ? (
        <div
          role="status"
          data-testid="lms-degraded"
          className="ws-inset mt-4 flex items-start gap-3 px-4 py-3.5"
        >
          <WifiOffIcon size={18} />
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-white">{t("connectionLostTitle")}</div>
            <div className="mt-0.5 text-[12.5px] leading-[1.5] font-normal text-white/60">
              {t("connectionLostBody")}
            </div>
          </div>
        </div>
      ) : null}

      {/* You won — auto-credited, no claim needed. */}
      {recentWinUsd !== null ? (
        <div className="border-up/40 bg-up/10 mt-4 rounded-[16px] border px-4 py-3.5">
          <div className="text-[13.5px] font-bold text-white">{t("wonBannerTitle")}</div>
          <div className="tnum mt-0.5 text-[12.5px] font-normal text-white/60">
            {t("wonBannerDetail", { amount: money.format(recentWinUsd) })}
          </div>
        </div>
      ) : null}

      {/* Measured off the design's own page (844:78897), not off the isolated
          stage component, which is drawn at a width the page never uses: the
          content row is 1002px, the stage 695px, the rail 295px, 12px apart.
          So the rail is 29.4% of the row, not a fixed 295px. Pinned at 295px
          it kept its width while the stage swallowed every pixel a wide
          monitor added, which is what left the rail's cards — invite, stake,
          claim — looking shrunken. Held as a share, the two grow together and
          keep the drawn proportion at any width. The 295px floor keeps the
          rail readable on a narrow laptop, and below 980px they stack. */}
      <div className="mt-9 grid grid-cols-1 items-start gap-4 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(295px,29.4%)] min-[980px]:gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          {statusLoading && !status ? (
            // A first paint with nothing in hand. Said as a skeleton of the
            // stage's own height rather than an empty clock, which would read
            // as a round waiting to start.
            <div
              role="status"
              aria-label={t("loading")}
              data-testid="stage-loading"
              className="h-[372px] w-full animate-pulse rounded-[15px] bg-[#121314]"
            />
          ) : (
            <StageCard
              phase={stagePhase}
              // The round this game is on, not the game's id. Starting it is
              // round 1 and every stake after that adds one. Omitted rather
              // than guessed while the feed is still out: a number here reads
              // as fact.
              roundLabel={roundCount === null ? null : t("roundLabel", { round: roundCount })}
              // Opposite the round label, in the corner the design leaves
              // empty. Sound only: the pop-out is offered on the way out, by
              // the dialog that catches a click leaving the arena, and a
              // second way in beside the clock was the same offer twice.
              cornerAction={<MusicToggle />}
              countdown={formatCountdown(gameActive ? countdown : 0)}
              progress={timerPct / 100}
              // The ring turns red in the last URGENT_SECONDS (10) of a live round.
              secondsLeft={gameActive ? countdown : 0}
              caption={stageCaption}
              heading={iAmWinner ? t("stageWonTitle") : t("stageEndedTitle")}
              subheading={
                iAmWinner
                  ? t("stageWonBody")
                  : t("stageEndedBody", {
                      player: leaderName || t("noneYet"),
                    })
              }
              leader={stageLeader}
              chip={stageChip}
              pot={{ label: t("tilePot"), value: money.format(potTileUsd) }}
              winnerShare={{ label: t("tileWinnerShare"), value: money.format(winnerShareUsd) }}
              potRef={potRef}
              frozen={degraded}
            >
              {/* Final seconds: the stage's own edge pulses red. It is drawn
                  here rather than around the card so it follows the card's
                  corners exactly. */}
              {urgent && !reduce ? (
                <motion.span
                  aria-hidden
                  className="ring-down/60 pointer-events-none absolute inset-0 rounded-[15px] ring-2 ring-inset"
                  animate={{ opacity: [0.3, 0.9, 0.3] }}
                  transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut" }}
                />
              ) : null}
            </StageCard>
          )}

          {/* Live tension: when this wallet is last to play, it is winning.
              The line sharpens in the final seconds. */}
          {iAmLastStanding ? (
            <div
              className={`rounded-[15px] border px-4 py-3 ${
                urgent ? "border-[#ffe178]/60 bg-[#ffe178]/10" : "border-hairline bg-surface"
              }`}
            >
              <div className="text-[13.5px] font-bold text-[#ffe178]">
                {urgent ? t("standingTitleUrgent") : t("standingTitle")}
              </div>
              <div className="mt-0.5 text-[12.5px] font-normal text-white/60">
                {urgent ? t("standingBodyUrgent") : t("standingBody")}
              </div>
            </div>
          ) : null}

          {/* The round is finished. A wager here would revert on chain, so the
              one thing left to do from this page is open another game. */}
          {roundOver ? (
            <Link
              href="/casino/last-standing"
              className="ws-chrome-pill ws-pressable text-ink flex min-h-11 w-full items-center justify-center rounded-full px-4 text-[13px] font-semibold"
            >
              {t("ctaStartAnother")}
            </Link>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {/* Short on funds: the card keeps its place and its action, and the
              glow behind it is the nudge the old blinking button was. */}
          <div className="relative">
            {luring && !reduce ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-[24px] bg-[#ffe178]/25 blur-lg"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : null}
            <div className="relative">
              {railCard === "action" ? (
                <RailActionCard
                  badge={
                    actionIsStart
                      ? { label: t("railStartBadge"), tone: "waiting" }
                      : iAmKing
                        ? { label: t("railBadgeLead"), tone: "lead" }
                        : { label: t("railBadgeBehind"), tone: "behind" }
                  }
                  heading={actionIsStart ? t("railStartHeading") : t("railAddHeading")}
                  sub={t("railSub")}
                  amountLabel={t("railPlayAmount")}
                  stepper={{
                    amount: money.format(stakeUsd),
                    currency: money.currency.code,
                    onDecrement: () => setStakeUnits(stake - minStakeUnits),
                    onIncrement: () => setStakeUnits(stake + minStakeUnits),
                    canDecrement: canStepStakeDown,
                    canIncrement: canStepStakeUp,
                    disabled: wagering,
                    decrementLabel: t("stepperDecrease"),
                    incrementLabel: t("stepperIncrease"),
                    editValue: money.toInput(stakeUsd),
                    onEdit: onEditStake,
                    editLabel: t("stepperEdit"),
                  }}
                  cta={{
                    label: ctaLabel,
                    icon: actionIsStart ? "play" : null,
                    onPress: () => void onPlay(),
                    disabled: !status || !address,
                    busy: wagering,
                  }}
                  ctaRef={playBtnRef}
                  footer={railPager}
                />
              ) : null}

              {railCard === "claim" ? (
                <RailClaimCard
                  heading={t("railClaimHeading")}
                  shareLabel={t("railClaimShare")}
                  shareValue={money.format(winnerShareUsd)}
                  status={{
                    label: hasPending ? t("railClaimReady") : t("railClaimWaiting"),
                    ready: hasPending,
                  }}
                  rows={[
                    { label: t("rowFinalPot"), value: money.format(finalPotUsd) },
                    { label: t("rowWinnerAllocation"), value: money.format(winnerShareUsd) },
                    {
                      label: t("rowClaimStatus"),
                      value: claimed ? t("claimStatusClaimed") : t("claimStatusNotClaimed"),
                    },
                  ]}
                  cta={
                    settleable
                      ? {
                          // Nobody is paid until this runs, so it stays the
                          // card's action even for a wallet that did not win.
                          label: settling
                            ? t("ctaSettling")
                            : iAmKing
                              ? t("ctaSettleCollect")
                              : t("ctaSettleRound"),
                          onPress: () => void onSettle(),
                          disabled: !address,
                          busy: settling,
                        }
                      : {
                          label: claiming
                            ? t("claiming")
                            : t("railClaimCta", { amount: pendingLabel }),
                          onPress: () => void onClaim(),
                          disabled: !hasPending,
                          busy: claiming,
                        }
                  }
                  footer={railPager}
                />
              ) : null}

              {railCard === "invite" ? (
                <RailInviteCard
                  // "You earn 10%" is the design's own chip (B6) — a borderless
                  // pill on rgba(255,255,255,0.04) — not a status pill. It used
                  // to ship through the status-pill prop, which drew it with a
                  // border at 8.494px.
                  chip={t("railInviteBadge")}
                  heading={t("railInviteHeading")}
                  sub={t("railInviteBody")}
                  // The card supplies the white tile, so the code goes in bare.
                  qr={<QrCode value={share.url} size={112} bare />}
                  caption={t("railInviteCaption")}
                  share={{
                    label: share.copied ? t("shareCopied") : t("railShareCta"),
                    onPress: () => void share.share(),
                  }}
                  footer={railPager}
                />
              ) : null}

              {/* Broadcast to Market Square. No frame of the design draws it,
                  so it wears the rail's own shell and heading, and the panel
                  goes in bare so there is one card edge, not two. */}
              {railCard === "broadcast" ? (
                <RailCardFrame label={t("railBroadcastHeading")} footer={railPager}>
                  <div data-rail-card="broadcast">
                    <GameBroadcastProvider broadcast={broadcast} copy={BROADCAST_COPY}>
                      <GoLivePanel
                        variant="bare"
                        activityOver={game?.settled === true}
                        header={
                          <h3 className="ws-display text-[24px] leading-none tracking-[-0.96px] text-[#f4f4f4]">
                            {t("railBroadcastHeading")}
                          </h3>
                        }
                      />
                    </GameBroadcastProvider>
                  </div>
                </RailCardFrame>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ActivityPanel
          tabs={[
            { id: "activity", label: t("tabActivity") },
            { id: "rules", label: t("tabRules") },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id as PanelTab)}
          columns={{
            player: t("colPlayer"),
            action: t("colAction"),
            amount: t("colAmount"),
            time: t("colTime"),
          }}
          rows={rows}
          emptyLabel={t("noPlays")}
          isLoading={activitiesLoading}
        >
          {panelBody}
        </ActivityPanel>

        {/* The feed is capped per page, and the pager sits under the card
            rather than inside it: the panel's body is the tab's to fill. */}
        {tab === "activity" && pagedActivities.total > FEED_PAGE_SIZE ? (
          <div className="px-4 sm:px-6">
            <Pager
              from={pagedActivities.from}
              to={pagedActivities.to}
              total={pagedActivities.total}
              canPrev={pagedActivities.canPrev}
              canNext={pagedActivities.canNext}
              onPrev={pagedActivities.goPrev}
              onNext={pagedActivities.goNext}
            />
          </div>
        ) : null}
      </div>

      {/* There is no "add money" and no "withdraw" here any more. Both sheets
          existed to convert the player's USDC into the ETH a v4 game needed and
          back again. A v5 game is played in USDC, which IS the spendable
          balance, so the stake comes off it directly and winnings land back on
          it. See ADR-2026-09-15-last-man-v5-usdc, decision 5. */}

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

      {/* Asked on the way out. "Yes" runs inside this click, which is the
          gesture both picture-in-picture APIs require. */}
      <KeepWatchingDialog
        open={leaving.pending !== null}
        onKeep={() =>
          leaving.leave(() => {
            // Point the pop-out at THIS game before raising it. Following is
            // otherwise only set by joining, so a watcher who never wagered
            // took an empty clock with them.
            followGame(gameId);
            openMiniWindow(detectTier());
          })
        }
        onStay={leaving.stay}
      />
    </div>
  );
}
