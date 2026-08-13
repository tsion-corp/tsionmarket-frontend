"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAcceptChallenge, useChessLobby } from "@/features/casino/hooks/use-casino-chess";
import { ChessLiveNowDialog } from "@/features/casino/components/chess/chess-live-now-dialog";
import { ChessComputerDialog } from "@/features/casino/components/chess/chess-computer-dialog";
import { ChessTournamentsDialog } from "@/features/casino/components/chess/chess-tournaments-dialog";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { ChessBoard } from "@/features/casino/components/chess/chess-board";
import {
  EmptyHint,
  MenuActionButton,
  MenuActionLink,
  MenuHeader,
  PlayerBar,
  StateRow,
} from "@/features/casino/components/game-menu";
import { BulbIcon, FlagIcon, FlameIcon, GameArrowsIcon } from "@/components/ui/icons";
import { BOARD_THEMES, DEFAULT_THEME } from "@/features/casino/lib/chess/board-theme";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { initialBoard } from "@/features/casino/lib/chess/engine";
import { CHESS_SURFACE_BG } from "@/features/casino/lib/chess/ui";
import { toast } from "@/lib/toast";
import type { ChessChallenge } from "@/features/casino/lib/api/types";

function ComputerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9 3h6M12 3v3M8 12h.01M16 12h.01M9 16h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const SURFACE_BG = CHESS_SURFACE_BG;
const SHELL_BG = "rgba(0, 0, 0, 0.20)";
const CARD_BG = "linear-gradient(180deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0.14) 100%)";
const CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.08), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.14), 0 .2rem .4rem 0 rgba(0, 0, 0, 0.10)";
const LANDING_THEME = BOARD_THEMES.find((theme) => theme.id === "green") ?? DEFAULT_THEME;
const LANDING_BOARD = initialBoard();

function timeControlLabel(t: ReturnType<typeof useTranslations>, tc: string): string {
  return tc === "3+2" || tc === "5+3" ? t("blitz", { tc }) : t("rapid", { tc });
}

function publicLabel(
  name: string | null | undefined,
  wallet: string | null | undefined,
  fallback = "Player"
): string {
  if (name && name !== "Account" && name !== "World Street user") return name;
  return wallet ? truncateAddress(wallet) : fallback;
}

function selfLabel(name: string | null | undefined, wallet: string | null): string {
  return publicLabel(name, wallet, "You");
}

export function LobbySection() {
  const t = useTranslations("casino.chess.lobby");
  const tCommon = useTranslations("casino.chess.common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useCasinoWallet();
  const { challenges, myActiveGames, myOpenGames, liveMatches, isLoading, error, refetch } =
    useChessLobby(wallet.address ?? null);
  const accept = useAcceptChallenge();
  const [liveOpen, setLiveOpen] = useState(false);
  const [computerOpen, setComputerOpen] = useState(() => searchParams.get("computer") === "1");
  const [tournamentsOpen, setTournamentsOpen] = useState(false);

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
    <>
      <div className="mx-auto w-full max-w-[1520px] px-4 pt-5 pb-8 sm:px-6 lg:px-8">
        {/* On xl the board column is pinned below the sticky topbar and the
            menu column scrolls on its own, chess.com style, so the board never
            leaves the screen while browsing the menu. The 84px offset clears
            the sticky topbar and back link; 116px adds the bottom gap. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,840px)_392px]">
          <section
            className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:sticky xl:top-[84px] xl:self-start"
            style={{ background: SURFACE_BG }}
          >
            {/* The board caps its own width to what fits the viewport height.
                Around it sit two player bars plus paddings (224px) and the
                topbar, page gaps (126px); the base 255px reserve
                is not enough on xl where the whole column must fit without
                page scroll, so the reserve grows to 350px there. */}
            <div className="mx-auto w-full max-w-[var(--board-max)] [--board-max:min(100%,780px,calc(100vh_-_255px))] xl:[--board-max:min(100%,780px,calc(100vh_-_350px))]">
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
            className="overflow-hidden rounded-[8px] shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:sticky xl:top-[84px] xl:max-h-[calc(100vh-116px)] xl:self-start xl:overflow-y-auto"
            style={{ background: SHELL_BG }}
          >
            <MenuHeader title="Play Chess" />
            <div className="space-y-3 p-4 sm:p-5">
              <ChessCashierLauncher />
              <div className="space-y-2">
                <MenuActionButton
                  title="Play against computer"
                  note="Choose a Stockfish level from 1 to 8"
                  icon={<ComputerIcon size={20} />}
                  onClick={() => setComputerOpen(true)}
                  ariaLabel="Set up a computer game"
                />
                <MenuActionLink
                  title="Learn how to play chess"
                  note="Master every piece with interactive lessons"
                  icon={<BulbIcon size={20} />}
                  href="/casino/chess/learn"
                />
                <MenuActionButton
                  title="Live Now"
                  note="Watch active games and open the live market"
                  icon={<FlameIcon size={20} />}
                  onClick={() => setLiveOpen(true)}
                  ariaLabel="Open live games"
                />
                <MenuActionLink
                  title="Play a Friend"
                  note="Invite a friend to a game of chess"
                  icon={<GameArrowsIcon size={20} />}
                  href="/casino/chess/create"
                />
                <MenuActionButton
                  title="Tournaments"
                  note="Browse current events and create a Swiss tournament"
                  icon={<FlagIcon size={20} />}
                  onClick={() => setTournamentsOpen(true)}
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

              {error ? (
                <CasinoError error={error} subject={t("subject")} onRetry={refetch} />
              ) : null}

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
            </div>
          </aside>
        </div>
      </div>

      <ChessLiveNowDialog
        open={liveOpen}
        onClose={() => setLiveOpen(false)}
        myMatches={myActiveGames}
        matches={liveMatches}
      />
      <ChessComputerDialog open={computerOpen} onClose={() => setComputerOpen(false)} />
      <ChessTournamentsDialog open={tournamentsOpen} onClose={() => setTournamentsOpen(false)} />
    </>
  );
}
