"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAcceptChallenge, useChessLobby, useQuickMatch } from "@/hooks/use-casino-chess";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/components/dashboard/casino/casino-state";
import { ChessBoard } from "@/components/dashboard/casino/chess/chess-board";
import { BOARD_THEMES, DEFAULT_THEME } from "@/lib/casino/chess/board-theme";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { initialBoard } from "@/lib/casino/chess/engine";
import { toast } from "@/lib/toast";
import type { ChessChallenge, ChessTimeControl } from "@/lib/casino/api/types";

const SURFACE_BG = "#312E2B";
const SHELL_BG = "rgba(0, 0, 0, 0.20)";
const CARD_BG = "linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.14) 100%)";
const CARD_BG_HOVER = "linear-gradient(180deg, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0.10) 100%)";
const SHADOW = "0 .1rem .1rem 0 rgba(0, 0, 0, 0.20)";
const CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.08), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.14), 0 .2rem .4rem 0 rgba(0, 0, 0, 0.10)";
const CARD_SHADOW_HOVER =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.14), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.14), 0 .2rem .4rem 0 rgba(0, 0, 0, 0.10)";
const LANDING_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;
const LANDING_BOARD = initialBoard();
const QUICK_MATCH_TIME_CONTROL: ChessTimeControl = "5+3";

function timeControlLabel(t: ReturnType<typeof useTranslations>, tc: string): string {
  return tc === "3+2" || tc === "5+3" ? t("blitz", { tc }) : t("rapid", { tc });
}

function LandingIcon({
  src,
  alt,
  className = "h-12 w-12",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  );
}

function MenuHeader() {
  return (
    <div
      className="flex min-h-[72px] items-center gap-4 px-6 py-5"
      style={{ background: SHELL_BG, boxShadow: SHADOW }}
    >
      <LandingIcon src="/chesscom-icons/play-white.svg" alt="" className="h-10 w-10" />
      <div className="font-sans text-[2.6rem] leading-none font-extrabold tracking-[-0.05em] text-white">
        Play Chess
      </div>
    </div>
  );
}

function MenuCard({
  title,
  note,
  icon,
  action,
}: {
  title: string;
  note: string;
  icon: ReactNode;
  action: ReactNode;
}) {
  return (
    <div
      className="rounded-[8px] transition-colors"
      style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = CARD_BG_HOVER;
        event.currentTarget.style.boxShadow = CARD_SHADOW_HOVER;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = CARD_BG;
        event.currentTarget.style.boxShadow = CARD_SHADOW;
      }}
    >
      {action}
      <div className="pointer-events-none flex min-h-[136px] items-center gap-4 px-6 py-6">
        {icon}
        <div className="min-w-0">
          <div className="font-sans text-[1.18rem] leading-none font-extrabold tracking-[-0.03em] text-white sm:text-[1.24rem]">
            {title}
          </div>
          <div className="mt-2 text-[0.92rem] leading-6 text-white/72 sm:text-[0.98rem]">
            {note}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuActionButton({
  title,
  note,
  iconSrc,
  onClick,
  ariaLabel,
}: {
  title: string;
  note: string;
  iconSrc: string;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? title}
        className="absolute inset-0 z-10 cursor-pointer rounded-[8px]"
      />
      <MenuCard
        title={title}
        note={note}
        icon={<LandingIcon src={iconSrc} alt="" />}
        action={null}
      />
    </div>
  );
}

function MenuActionLink({
  title,
  note,
  iconSrc,
  href,
}: {
  title: string;
  note: string;
  iconSrc: string;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-[8px]">
      <MenuCard
        title={title}
        note={note}
        icon={<LandingIcon src={iconSrc} alt="" />}
        action={null}
      />
    </Link>
  );
}

function MenuCoachLink() {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => toast.error("Play Coach isn't wired yet here.")}
        className="absolute inset-0 z-10 cursor-pointer rounded-[8px]"
        aria-label="Play Coach"
      />
      <MenuCard
        title="Play Coach"
        note="Learn as you play a game with Coach"
        icon={<LandingIcon src="/chesscom-icons/coachdavid-icon.png" alt="" />}
        action={null}
      />
    </div>
  );
}

function MiniLink({ href, iconSrc, label }: { href: string; iconSrc: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[0.95rem] font-semibold text-white/76 transition-colors hover:text-white"
    >
      <LandingIcon src={iconSrc} alt="" className="h-7 w-7" />
      <span>{label}</span>
    </Link>
  );
}

function PlayerBar({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="flex items-center gap-4 rounded-[8px] px-3 py-3"
      style={{ background: SHELL_BG, boxShadow: SHADOW }}
    >
      <span className="grid h-14 w-14 place-items-center rounded-[4px] bg-[#4B4847]">
        <LandingIcon src="/chesscom-icons/play-white.svg" alt="" className="h-8 w-8 opacity-35" />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-sans text-[1.05rem] font-bold text-white">{label}</span>
        {active ? (
          <span aria-hidden className="inline-flex gap-[3px]">
            <span className="h-4 w-[8px] rounded-[2px] bg-[#81B64C]" />
            <span className="h-4 w-[8px] rounded-[2px] bg-[#5D9948]" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

function StateRow({
  label,
  meta,
  action,
  onAction,
  disabled = false,
}: {
  label: string;
  meta: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[8px] px-4 py-3"
      style={{ background: CARD_BG, boxShadow: SHADOW }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[0.95rem] font-bold text-white">{label}</div>
        <div className="truncate text-[0.82rem] text-white/64">{meta}</div>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="cursor-pointer rounded-full bg-white px-4 py-2 text-[0.75rem] font-bold text-[#1f1d1a] disabled:opacity-45"
      >
        {action}
      </button>
    </div>
  );
}

function EmptyHint({ lines }: { lines: string[] }) {
  return (
    <div
      className="rounded-[8px] px-4 py-3 text-[0.92rem] leading-6 text-white/72"
      style={{ background: CARD_BG, boxShadow: SHADOW }}
    >
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function selfLabel(name: string | null | undefined, wallet: string | null): string {
  if (name && name !== "Account" && name !== "World Street user") return name;
  return wallet ? truncateAddress(wallet) : "You";
}

export function LobbySection() {
  const t = useTranslations("casino.chess.lobby");
  const tCommon = useTranslations("casino.chess.common");
  const router = useRouter();
  const wallet = useCasinoWallet();
  const { challenges, myActiveGames, myOpenGames, liveMatches, isLoading, error, refetch } =
    useChessLobby(wallet.address ?? null);
  const accept = useAcceptChallenge();
  const quickMatch = useQuickMatch();

  const activeGame = myActiveGames[0] ?? null;
  const openGame = myOpenGames[0] ?? null;
  const joinableChallenges = challenges.slice(0, 2);
  const showQuietLobbyHint =
    !error &&
    !isLoading &&
    !activeGame &&
    !openGame &&
    joinableChallenges.length === 0 &&
    liveMatches.length === 0;

  const onQuickMatch = async () => {
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    const id = toast.loading(t("toastFinding"));
    try {
      const { matchId, waitingOn } = await quickMatch.mutateAsync({
        timeControl: QUICK_MATCH_TIME_CONTROL,
        mode: "auto",
      });
      if (matchId) {
        toast.success(t("toastFound"), { id });
        router.push(`/casino/chess/play?match=${matchId}`);
        return;
      }
      toast.success(t("toastOpened"), { id });
      router.push(`/casino/chess/matchmaking?ticket=${waitingOn}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastQuickFailed")), { id });
    }
  };

  const onJoin = async (challenge: ChessChallenge) => {
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }
    const id = toast.loading(t("toastJoining"));
    try {
      const match = await accept.mutateAsync(challenge.id);
      toast.success(tCommon("youAreIn"), { id });
      router.push(`/casino/chess/play?match=${match.id}`);
    } catch (e) {
      toast.error(friendlyError(e, t("toastJoinFailed")), { id });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,944px)_392px]">
        <section
          className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: SURFACE_BG }}
        >
          <div className="mx-auto max-w-[944px]">
            <PlayerBar label={t("colOpponent")} />
            <div className="mt-4 overflow-hidden rounded-[2px]">
              <ChessBoard board={LANDING_BOARD} theme={LANDING_THEME} />
            </div>
            <div className="mt-4">
              <PlayerBar
                label={selfLabel(wallet.name, wallet.address ?? null)}
                active={wallet.connected}
              />
            </div>
          </div>
        </section>

        <aside
          className="overflow-hidden rounded-[8px] shadow-[0_1px_1px_rgba(0,0,0,0.20)]"
          style={{ background: SHELL_BG }}
        >
          <MenuHeader />
          <div className="space-y-4 p-4 sm:p-6">
            <div className="space-y-4">
              <MenuActionButton
                title="Play Online"
                note="Play vs a person of similar skill"
                iconSrc="/chesscom-icons/time-blitz.svg"
                onClick={() => void onQuickMatch()}
                ariaLabel={t("findOpponent")}
              />
              <MenuActionButton
                title="Play Bots"
                note="Challenge a bot from Easy to Master"
                iconSrc="/chesscom-icons/device-bot.svg"
                onClick={() => toast.error("Play Bots isn't wired yet here.")}
              />
              <MenuCoachLink />
              <MenuActionLink
                title="Play a Friend"
                note="Invite a friend to a game of chess"
                iconSrc="/chesscom-icons/hand-shake.svg"
                href="/casino/chess/create"
              />
              <MenuActionLink
                title="Tournaments"
                note="Join an Arena where anyone can win"
                iconSrc="/chesscom-icons/tournaments.svg"
                href="/casino/chess/swiss"
              />
              <MenuActionButton
                title="Chess Variants"
                note="Find fun new ways to play chess"
                iconSrc="/chesscom-icons/variants.svg"
                onClick={() => toast.error("Chess Variants isn't wired yet here.")}
              />
            </div>

            {joinableChallenges.length > 0 ? (
              <div className="space-y-2">
                <span className="sr-only">{t("openChallenges")}</span>
                {joinableChallenges.map((challenge) => {
                  const details = challenge.stakeUsdc
                    ? `${tCommon("stakedFor", { amount: challenge.stakeUsdc })} · ${timeControlLabel(tCommon, challenge.timeControl)}`
                    : timeControlLabel(tCommon, challenge.timeControl);
                  return (
                    <StateRow
                      key={challenge.id}
                      label={challenge.creator.username}
                      meta={details}
                      action={t("join")}
                      disabled={accept.isPending}
                      onAction={() => void onJoin(challenge)}
                    />
                  );
                })}
              </div>
            ) : null}

            {error ? <CasinoError error={error} subject={t("subject")} onRetry={refetch} /> : null}

            {isLoading ? (
              <div
                style={{ background: CARD_BG, boxShadow: CARD_SHADOW }}
                className="rounded-[8px] px-4 py-4"
              >
                <CasinoLoading label={t("loading")} rows={2} />
              </div>
            ) : null}

            {showQuietLobbyHint ? (
              <>
                <EmptyHint lines={[t("liveEmpty"), t("challengesEmpty")]} />
                <span className="sr-only">{t("liveEmpty")}</span>
                <span className="sr-only">{t("challengesEmpty")}</span>
              </>
            ) : liveMatches.length === 0 ? (
              <>
                <span className="sr-only">{t("liveEmpty")}</span>
                <span className="sr-only">{t("challengesEmpty")}</span>
              </>
            ) : null}

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <MiniLink
                href="/casino/chess/history"
                iconSrc="/chesscom-icons/board-archive.svg"
                label="Game History"
              />
              <MiniLink
                href="/casino/chess/history"
                iconSrc="/chesscom-icons/leaderboard.svg"
                label="Leaderboard"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
