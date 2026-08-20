"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSwissTournament } from "@/features/casino/hooks/use-casino-swiss";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import { FlagIcon, PlayIcon } from "@/components/ui/icons";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { SwissBettingPanel } from "@/features/casino/components/chess/swiss/betting-panel";
import { SwissStandings } from "@/features/casino/components/chess/swiss/standings";
import { SwissRoundPairings } from "@/features/casino/components/chess/swiss/pairings";
import { BOARD_THEMES, DEFAULT_THEME } from "@/features/casino/lib/chess/board-theme";
import { initialBoard } from "@/features/casino/lib/chess/engine";
import {
  parseFen as parseDraughtsFen,
  STARTING_FEN as DRAUGHTS_STARTING_FEN,
} from "@/features/casino/lib/draughts/engine";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance, hasPositiveUsdc } from "@/features/casino/lib/api/cashier";
import { copyText } from "@/lib/clipboard";
import {
  currentRound,
  defaultPlayerName,
  hasOngoingPairing,
  isSeated,
  playerNameError,
  PLAYER_NAME_MAX,
  swissSurfaceRoutes,
  type SwissDetail,
  type SwissGameKind,
  type SwissSurfaceRoutes,
} from "@/features/casino/lib/api/swiss";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PAGE_BOARD_MAX_WIDTH,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SECONDARY_BUTTON_CLASS,
  CHESS_SHELL_BG,
  CHESS_SHELL_SHADOW,
  CHESS_SIDEBAR_BG,
  CHESS_SURFACE_BG,
} from "@/features/casino/lib/chess/ui";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

type Translator = ReturnType<typeof useTranslations>;
type RailTab = "standings" | "games" | "info";

const STATE_KEY: Record<SwissDetail["state"], string> = {
  open: "statusOpen",
  running: "statusRunning",
  finished: "statusFinished",
};

const TOURNAMENT_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;
const TOURNAMENT_BOARD = initialBoard();
const TOURNAMENT_DRAUGHTS_BOARD = parseDraughtsFen(DRAUGHTS_STARTING_FEN).board;

function headerLine(t: Translator, detail: SwissDetail): string {
  const parts = [
    detail.state === "open"
      ? t("notStarted")
      : t("roundOf", { round: detail.round, total: detail.nbRounds }),
    detail.timeControl,
    t("playersCount", { count: detail.participantCount }),
    t("organizerLine", { name: detail.organizer }),
  ];
  return parts.join(" · ");
}

function viewerLabel(name: string | null | undefined, address: string | null): string {
  return name || defaultPlayerName(address) || "You";
}

function ShellPlayerBar({
  label,
  meta,
  icon,
}: {
  label: string;
  meta: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5"
      style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-white/8 text-white/60">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate font-sans text-[13.5px] font-medium text-white">{label}</div>
        <div className="truncate text-[12px] text-white/58">{meta}</div>
      </div>
    </div>
  );
}

function ShellBadge({ label }: { label: string }) {
  return (
    <div
      className="tnum flex min-w-[118px] shrink-0 items-center justify-center rounded-[8px] px-3.5 py-2 text-center text-[13.5px] font-semibold text-white/88"
      style={{ background: CHESS_SHELL_BG, boxShadow: CHESS_SHELL_SHADOW }}
    >
      {label}
    </div>
  );
}

function RailTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer px-4 py-4 text-center font-sans text-[14px] font-semibold transition-colors ${
        active ? "border-b-4 border-white text-white" : "text-white/56 hover:text-white/82"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-white/6 bg-black/10 px-3 py-3">
      <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">{label}</div>
      <div className="text-[13.5px] font-semibold text-white">{value}</div>
    </div>
  );
}

function CompactMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[16px] border border-white/6 px-4 py-4 text-[13px] leading-6 text-white/62"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      {children}
    </div>
  );
}

function JoinPanel({
  join,
  joining,
  entryFeeUsdc,
  game,
}: {
  join: (input: { name: string; password?: string }) => Promise<unknown>;
  joining: boolean;
  entryFeeUsdc: string;
  game: SwissGameKind;
}) {
  const t = useTranslations("casino.chess.swiss");
  const wallet = useCasinoWallet();
  const cashier = useChessCashierStatus();
  const [typedName, setTypedName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);

  const name = typedName ?? defaultPlayerName(wallet.address);
  const nameError = playerNameError(name);
  const paid = hasPositiveUsdc(entryFeeUsdc);
  const insufficient = paid && exceedsUsdcBalance(entryFeeUsdc, cashier.available);

  const onJoin = async () => {
    setTouched(true);
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    if (nameError || joining || insufficient || (paid && cashier.balanceLoading)) return;
    const id = toast.loading(t("toastJoining"));
    try {
      await join({ name, password: password || undefined });
      toast.success(t("toastJoined"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastJoinFailed")), { id });
    }
  };

  const inputClass =
    "w-full rounded-[12px] border border-white/8 bg-black/12 px-3 py-3 font-sans text-[13px] text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none";

  return (
    <div
      className="rounded-[16px] border border-white/6 px-4 py-4"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      <div className="mb-3 text-[16px] font-semibold text-white">{t("joinTitle")}</div>
      {paid ? (
        <div className="mb-3 rounded-[10px] border border-white/8 bg-black/12 px-3 py-2.5 text-[11.5px] leading-5 text-white/58">
          Joining locks <strong className="tnum text-white/82">{entryFeeUsdc} USDC</strong> from
          your {game === "draughts" ? "checkers" : "chess"} balance. It is refunded if you leave
          before round 1 starts.
          <div className={`mt-1 ${insufficient ? "text-down" : "text-white/42"}`}>
            Available: {cashier.available} USD
          </div>
        </div>
      ) : null}
      <div className="space-y-3">
        <div>
          <div className="mb-2 text-[11px] tracking-[0.05em] text-white/38 uppercase">
            {t("joinNameLabel")}
          </div>
          <input
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={PLAYER_NAME_MAX}
            className={inputClass}
          />
          <div className="mt-1.5 text-[11.5px] text-white/48">
            {touched && nameError ? t("nameInvalid") : t("joinNameNote")}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] tracking-[0.05em] text-white/38 uppercase">
            {t("joinPasswordLabel")}
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("joinPasswordPlaceholder")}
            className={inputClass}
          />
          <div className="mt-1.5 text-[11.5px] text-white/48">{t("joinPasswordNote")}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void onJoin()}
        disabled={joining || insufficient || (paid && cashier.balanceLoading)}
        className={`${CHESS_PRIMARY_BUTTON_CLASS} mt-4 w-full px-4 py-3 font-sans text-[13.5px] font-medium`}
      >
        {joining ? t("joiningLabel") : t("joinSubmit")}
      </button>
      {paid ? (
        <div className="mt-3">
          <ChessCashierLauncher compact />
        </div>
      ) : null}
    </div>
  );
}

function OrganizerPanel({
  state,
  round,
  participantCount,
  minimumPlayers,
  manual,
  setManual,
  onStartRound,
  startingRound,
  onReconcile,
  reconciling,
}: {
  state: SwissDetail["state"];
  round: number;
  participantCount: number;
  minimumPlayers: number;
  manual: string;
  setManual: (value: string) => void;
  onStartRound: () => Promise<void>;
  startingRound: boolean;
  onReconcile: () => Promise<void>;
  reconciling: boolean;
}) {
  const t = useTranslations("casino.chess.swiss");
  const title = state === "open" ? "Start the tournament" : "Start the next round";
  const ctaLabel = state === "open" ? "Start round 1" : t("startRound");
  const description =
    state === "open"
      ? `${t("organizerHint")} Round 1 starts when you click the button below, and Play now appears as soon as the board is paired.`
      : `Round ${round} is live. Start the next round only after every board in the current round is done.`;
  const ready = state !== "open" || participantCount >= minimumPlayers;

  return (
    <div
      className="rounded-[16px] border border-white/6 px-4 py-4"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      <div className="mb-2 text-[16px] font-semibold text-white">{title}</div>
      <div className="text-[13px] leading-6 text-white/60">{description}</div>
      {state === "open" ? (
        <div className="mt-3 rounded-[12px] border border-white/8 bg-black/12 px-3 py-3 text-[13px] text-white/68">
          {ready
            ? `${participantCount} players are ready. Click Start round 1 now.`
            : `At least ${minimumPlayers} players must join before round 1 can start.`}
        </div>
      ) : null}
      <div className="mt-4">
        <div className="mb-2 text-[11px] tracking-[0.05em] text-white/38 uppercase">
          {t("manualLabel")}
        </div>
        <textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={t("manualPlaceholder")}
          rows={3}
          className="w-full resize-y rounded-[12px] border border-white/8 bg-black/12 px-3 py-3 font-mono text-[13px] text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => void onStartRound()}
        disabled={startingRound || !ready}
        className={`${CHESS_PRIMARY_BUTTON_CLASS} mt-4 w-full px-4 py-3 font-sans text-[13px] font-medium`}
      >
        {startingRound ? t("startingRound") : ctaLabel}
      </button>
      {state === "running" ? (
        <button
          type="button"
          onClick={() => void onReconcile()}
          disabled={reconciling}
          className={`${CHESS_SECONDARY_BUTTON_CLASS} mt-2.5 w-full px-4 py-3 font-sans text-[13px] font-semibold`}
        >
          {reconciling ? t("reconcilingRound") : t("reconcileRound")}
        </button>
      ) : null}
    </div>
  );
}

function ShareCard({
  title,
  url,
  onCopy,
  onClose,
  overlay = false,
}: {
  title: string;
  url: string;
  onCopy: () => Promise<void>;
  onClose?: () => void;
  overlay?: boolean;
}) {
  return (
    <div
      className={`rounded-[22px] border border-white/8 px-5 py-5 ${overlay ? "mx-auto max-w-[460px]" : ""}`}
      style={
        overlay
          ? {
              background: CHESS_SHELL_BG,
              boxShadow: "0 28px 72px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.06)",
            }
          : { background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex min-w-0 items-center gap-3 ${overlay ? "w-full flex-col text-center" : ""}`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/8 text-white/80">
            <FlagIcon size={20} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-sans text-[17px] font-semibold tracking-[-0.03em] text-white">
              {title}
            </div>
            <div className="mt-1 text-[13px] leading-6 text-white/60">
              Send this link manually. Anyone who opens it can join the tournament.
            </div>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={`cursor-pointer rounded-full border border-white/10 text-[12px] font-semibold text-white/70 transition-colors hover:border-white/22 hover:text-white ${
              overlay ? "h-9 w-9 shrink-0 px-0 py-0" : "px-3 py-1"
            }`}
          >
            {overlay ? "×" : "Close"}
          </button>
        ) : null}
      </div>

      <div className="tnum mt-4 truncate rounded-[14px] border border-white/10 bg-black/14 px-4 py-3 text-[13px] text-white/76">
        {url}
      </div>

      <div className={`mt-4 flex gap-2 ${overlay ? "justify-center" : ""}`}>
        <button
          type="button"
          onClick={() => void onCopy()}
          className={`${CHESS_PRIMARY_BUTTON_CLASS} px-4 py-2.5 font-sans text-[13px] font-medium`}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function InfoPanel({
  detail,
  shareUrl,
  isOrganizer,
  onCopyShare,
  routes,
}: {
  detail: SwissDetail;
  shareUrl: string;
  isOrganizer: boolean;
  onCopyShare: () => Promise<void>;
  routes: SwissSurfaceRoutes;
}) {
  const t = useTranslations("casino.chess.swiss");

  return (
    <div className="space-y-4">
      {isOrganizer && detail.state === "open" ? (
        <ShareCard title="Tournament Link" url={shareUrl} onCopy={onCopyShare} />
      ) : null}

      <div
        className="rounded-[16px] border border-white/6 px-4 py-4"
        style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
      >
        <div className="mb-3 text-[16px] font-semibold text-white">Tournament Info</div>
        <div className="space-y-3 text-[13px] leading-6 text-white/66">
          <div>{headerLine(t, detail)}</div>
          {detail.state === "finished" && detail.winner ? (
            <div className="font-semibold text-white">{t("winner", { name: detail.winner })}</div>
          ) : null}
          <div>
            Players join from this page directly. The organizer can copy the tournament page link
            and send it out.
          </div>
          {hasPositiveUsdc(detail.entryFeeUsdc) ? (
            <div className="rounded-[10px] border border-white/8 bg-black/12 px-3 py-2.5">
              <strong className="tnum text-white/82">{detail.entryFeeUsdc} USDC</strong> per entrant
              · {detail.prizePoolBps / 100}% winner pool · {detail.platformShareBps / 100}% platform
              · minimum {detail.minimumPlayers} players.
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={routes.tournaments}
            className={`${CHESS_SECONDARY_BUTTON_CLASS} px-4 py-2.5 font-sans text-[12px] font-semibold`}
          >
            ← {t("allTournaments")}
          </Link>
          <Link
            href={routes.home}
            className={`${CHESS_SECONDARY_BUTTON_CLASS} px-4 py-2.5 font-sans text-[12px] font-semibold`}
          >
            Back to {routes.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function SwissDetailSection({
  tournamentId,
  showCreatedShare = false,
  game,
}: {
  tournamentId: string;
  showCreatedShare?: boolean;
  game?: SwissGameKind;
}) {
  const t = useTranslations("casino.chess.swiss");
  const wallet = useCasinoWallet();
  const router = useRouter();
  const pathname = usePathname();
  const {
    detail,
    yourName,
    isOrganizer,
    isLoading,
    error,
    refetch,
    join,
    joining,
    withdraw,
    withdrawing,
    startNextRound,
    startingRound,
    reconcile,
    reconciling,
  } = useSwissTournament(tournamentId);

  const surfaceGame = detail?.game ?? game ?? "chess";
  const routes = swissSurfaceRoutes(surfaceGame);
  const [manual, setManual] = useState("");
  const [railTabChoice, setRailTabChoice] = useState<RailTab | null>(null);
  const [shareDismissed, setShareDismissed] = useState(!showCreatedShare);
  const shareUrl =
    typeof window === "undefined"
      ? routes.detail(tournamentId)
      : `${window.location.origin}${routes.detail(tournamentId)}`;
  const shareVisible = !!detail && isOrganizer && detail.state === "open" && !shareDismissed;

  const onStartRound = async () => {
    if (startingRound) return;
    const id = toast.loading(t("toastStartingRound"));
    try {
      await startNextRound(manual.trim() || undefined);
      toast.success(t("toastRoundStarted"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastRoundFailed")), { id });
    }
  };

  const onReconcile = async () => {
    if (reconciling) return;
    const id = toast.loading(t("toastReconcilingRound"));
    try {
      await reconcile();
      toast.success(t("toastRoundReconciled"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastRoundReconcileFailed")), { id });
    }
  };

  const onWithdraw = async () => {
    if (!detail || withdrawing) return;
    const forfeit = hasOngoingPairing(detail, yourName);
    const id = toast.loading(t("toastWithdrawing"));
    try {
      await withdraw({ forfeit });
      toast.success(t("toastWithdrawn"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastWithdrawFailed")), { id });
    }
  };

  const onCopyShare = async () => {
    const copied = await copyText(shareUrl);
    if (copied) toast.success("Link copied.");
    else toast.error("Couldn't copy — copy the link from the address bar.");
  };

  const closeShare = () => {
    setShareDismissed(true);
    if (showCreatedShare) router.replace(pathname, { scroll: false });
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-20 sm:px-6">
        <CasinoError error={error} subject={t("subjectDetail")} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading || !detail) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pt-10 pb-20 sm:px-6">
        <CasinoLoading label={t("loadingDetail")} rows={5} />
      </div>
    );
  }

  const rounds = [...detail.rounds].sort((a, b) => b.round - a.round);
  const joined = yourName !== null;
  const viewer = viewerLabel(wallet.name, wallet.address);
  const pairingOngoing = hasOngoingPairing(detail, yourName);
  const liveRound = currentRound(detail);
  const yourPairing =
    liveRound?.pairings.find(
      (pairing) => pairing.status === "ongoing" && isSeated(pairing, yourName)
    ) ?? null;
  const opponentName =
    yourPairing && yourName
      ? yourPairing.white === yourName
        ? yourPairing.black
        : yourPairing.white
      : null;
  const boardFooter =
    detail.state === "open"
      ? "Share the tournament page to gather players."
      : detail.state === "running"
        ? "Rounds and live boards are managed from the rail."
        : "Tournament complete.";
  const railTab: RailTab =
    railTabChoice ??
    (detail.state === "running" && liveRound?.pairings.length ? "games" : "standings");

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,944px)_430px]">
        <section
          className="relative rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: CHESS_SURFACE_BG }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: CHESS_PAGE_BOARD_MAX_WIDTH }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <ShellPlayerBar
                label={detail.name}
                meta={t(STATE_KEY[detail.state])}
                icon={<FlagIcon size={18} />}
              />
              <div className="flex shrink-0 items-center gap-3">
                <ShellBadge label={detail.timeControl} />
                <ShellBadge label={t("playersCount", { count: detail.participantCount })} />
              </div>
            </div>

            <div
              className={`relative rounded-[2px] ${
                surfaceGame === "draughts" ? "overflow-visible" : "overflow-hidden"
              }`}
            >
              {surfaceGame === "draughts" ? (
                <DraughtsBoardView board={TOURNAMENT_DRAUGHTS_BOARD} />
              ) : (
                <ChessBoard board={TOURNAMENT_BOARD} theme={TOURNAMENT_THEME} />
              )}
              {shareVisible ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/26 p-5">
                  <ShareCard
                    title={detail.name}
                    url={shareUrl}
                    onCopy={onCopyShare}
                    onClose={closeShare}
                    overlay
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <ShellPlayerBar
                label={viewer}
                meta={joined ? t("youPlayAs", { name: yourName as string }) : t("notStarted")}
                icon={<PlayIcon size={18} />}
              />
              <ShellBadge
                label={
                  detail.state === "finished" ? "Final" : `R${detail.round}/${detail.nbRounds}`
                }
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[12px] text-white/55">{boardFooter}</span>
              <Link
                href={routes.tournaments}
                className="shrink-0 text-[12px] font-semibold text-white/68 transition-colors hover:text-white"
              >
                ← {t("allTournaments")}
              </Link>
            </div>
          </div>
        </section>

        <aside
          className="flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-white/6 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: CHESS_SIDEBAR_BG }}
        >
          <div className="grid grid-cols-4 border-b border-white/6 bg-black/10">
            <div className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white">
              <span className="mb-2 block text-[16px] font-medium">T</span>
              <span className="font-sans text-[14px] font-semibold">Tournament</span>
            </div>
            <Link
              href={routes.create}
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">+</span>
              <span className="font-sans text-[14px] font-semibold">New Game</span>
            </Link>
            <Link
              href={routes.games}
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">#</span>
              <span className="font-sans text-[14px] font-semibold">Games</span>
            </Link>
            <Link
              href={routes.home}
              className="grid min-h-[78px] place-items-center px-4 py-3 text-center text-white/65 transition-colors hover:bg-white/4 hover:text-white"
            >
              <span className="mb-2 block text-[16px] font-medium">U</span>
              <span className="font-sans text-[14px] font-semibold">Players</span>
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <div
              className="rounded-[16px] border border-white/6 px-4 py-4"
              style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
            >
              <div className="mb-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[19px] font-semibold text-white">{detail.name}</div>
                  <div className="mt-1 text-[12.5px] leading-6 text-white/58">
                    {headerLine(t, detail)}
                  </div>
                </div>
                <span className="rounded-full border border-white/12 px-3 py-1 text-[11px] font-semibold text-white/72">
                  {t(STATE_KEY[detail.state])}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <SummaryStat label="Rounds" value={`${detail.round}/${detail.nbRounds}`} />
                <SummaryStat
                  label="Players"
                  value={`${detail.participantCount}/${detail.maxPlayers}`}
                />
                <SummaryStat label="Time Control" value={detail.timeControl} />
                <SummaryStat
                  label="Entry"
                  value={
                    hasPositiveUsdc(detail.entryFeeUsdc) ? `${detail.entryFeeUsdc} USDC` : "Free"
                  }
                />
              </div>

              {detail.state === "finished" && detail.winner ? (
                <div className="mt-4 rounded-[12px] border border-white/8 bg-black/12 px-3 py-3 text-[13.5px] font-semibold text-white">
                  {t("winner", { name: detail.winner })}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-4">
              {detail.state === "open" && !joined ? (
                <JoinPanel
                  join={join}
                  joining={joining}
                  entryFeeUsdc={detail.entryFeeUsdc}
                  game={surfaceGame}
                />
              ) : null}

              {detail.state === "open" && joined && !isOrganizer ? (
                <CompactMessage>
                  You&apos;re in. Only the organizer, {detail.organizer}, can start round 1. Ask
                  them to open this page and click Start round 1. Your board will appear
                  automatically here once they do.
                </CompactMessage>
              ) : null}

              {isOrganizer && detail.state === "open" ? (
                <ShareCard title="Tournament Link" url={shareUrl} onCopy={onCopyShare} />
              ) : null}

              {yourPairing?.matchId ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/6 px-4 py-4"
                  style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-white">
                      Round {yourPairing.round}, board {yourPairing.board} is live
                    </div>
                    <div className="mt-1 text-[13px] leading-6 text-white/62">
                      {opponentName
                        ? `You are paired against ${opponentName}.`
                        : "Your board is ready."}{" "}
                      Open the game now.
                    </div>
                  </div>
                  <Link
                    href={routes.play(yourPairing.matchId, yourName)}
                    className={`${CHESS_PRIMARY_BUTTON_CLASS} shrink-0 px-4 py-2.5 font-sans text-[13px] font-medium`}
                  >
                    Play now
                  </Link>
                </div>
              ) : null}

              {detail.state === "running" &&
              !!liveRound?.pairings.length &&
              !yourPairing?.matchId ? (
                <CompactMessage>
                  Round {liveRound.round} is live. Open the Games tab below to see the pairings and
                  watch the active boards.
                </CompactMessage>
              ) : null}

              {isOrganizer && detail.state !== "finished" ? (
                <OrganizerPanel
                  state={detail.state}
                  round={detail.round}
                  participantCount={detail.participantCount}
                  minimumPlayers={detail.minimumPlayers}
                  manual={manual}
                  setManual={setManual}
                  onStartRound={onStartRound}
                  startingRound={startingRound}
                  onReconcile={onReconcile}
                  reconciling={reconciling}
                />
              ) : null}

              {joined && detail.state === "running" && !pairingOngoing ? (
                <CompactMessage>
                  You&apos;re joined. Open the Games tab to watch pairings and wait for your next
                  board to appear.
                </CompactMessage>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-3 border-b border-white/6 bg-black/8">
              <RailTabButton
                active={railTab === "standings"}
                label="Standings"
                onClick={() => setRailTabChoice("standings")}
              />
              <RailTabButton
                active={railTab === "games"}
                label="Games"
                onClick={() => setRailTabChoice("games")}
              />
              <RailTabButton
                active={railTab === "info"}
                label="Info"
                onClick={() => setRailTabChoice("info")}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-1">
              <div className="space-y-4">
                {railTab === "standings" ? (
                  <div className="space-y-4">
                    <SwissStandings standings={detail.standings} yourName={yourName} />
                    <SwissBettingPanel detail={detail} yourName={yourName} />
                  </div>
                ) : railTab === "games" ? (
                  <div className="space-y-4">
                    {rounds.length > 0 ? (
                      <div className="space-y-4">
                        {rounds.map((round) => (
                          <SwissRoundPairings key={round.round} round={round} yourName={yourName} />
                        ))}
                      </div>
                    ) : (
                      <CompactMessage>No boards have been paired yet.</CompactMessage>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <InfoPanel
                      detail={detail}
                      shareUrl={shareUrl}
                      isOrganizer={isOrganizer}
                      onCopyShare={onCopyShare}
                      routes={routes}
                    />

                    {joined && detail.state !== "finished" ? (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/6 px-4 py-4"
                        style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
                      >
                        <div className="text-[13px] text-white/70">
                          {t("youPlayAs", { name: yourName as string })}
                        </div>
                        <button
                          type="button"
                          onClick={() => void onWithdraw()}
                          disabled={withdrawing}
                          className={`${CHESS_SECONDARY_BUTTON_CLASS} px-4 py-2 text-[12px] font-semibold`}
                        >
                          {withdrawing ? t("withdrawingLabel") : t("withdrawButton")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {detail.state === "open" && railTab === "games" && rounds.length === 0 ? (
                  <CompactMessage>
                    Games appear here after the first round is paired.
                  </CompactMessage>
                ) : null}
              </div>
            </div>

            <div className="mt-5 shrink-0 border-t border-white/6 pt-5">
              <ChessCashierLauncher compact />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
