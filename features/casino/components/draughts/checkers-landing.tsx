"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { useDraughtsLobby } from "@/features/casino/hooks/use-draughts-match";
import { joinMatch } from "@/features/casino/lib/api/draughts";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { exceedsUsdcBalance } from "@/features/casino/lib/api/cashier";
import { DraughtsBoardView } from "@/features/casino/components/draughts/draughts-board";
import { CheckersLiveNowDialog } from "@/features/casino/components/draughts/checkers-live-now-dialog";
import { ChessCashierLauncher } from "@/features/casino/components/chess/chess-cashier-launcher";
import { CasinoError } from "@/features/casino/components/casino-state";
import {
  EmptyHint,
  MenuActionButton,
  MenuActionLink,
  MenuHeader,
  MENU_SHELL_BG,
  MENU_SURFACE_BG,
  PlayerBar,
  StateRow,
} from "@/features/casino/components/game-menu";
import { FlagIcon, FlameIcon, GameArrowsIcon } from "@/components/ui/icons";
import { parseFen, STARTING_FEN } from "@/features/casino/lib/draughts/engine";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import type { DraughtsChallenge } from "@/features/casino/lib/draughts/types";

// The board behind the menu is decoration, so it is the opening position and
// never changes. Parsed once at module scope rather than per render.
const LANDING_BOARD = parseFen(STARTING_FEN).board;

function selfLabel(name: string | null, address: string | null): string {
  if (name) return name;
  if (address) return truncateAddress(address);
  return "You";
}

export function CheckersLanding() {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const address = wallet.address ?? null;
  const { challenges, mine, live, error, refetch } = useDraughtsLobby(address);
  const cashier = useChessCashierStatus();
  const [liveOpen, setLiveOpen] = useState(false);
  const [joining, setJoining] = useState(false);

  const onJoin = async (challenge: DraughtsChallenge) => {
    if (!address) {
      toast.error("Sign in to join a game.");
      return;
    }
    // Joining a staked game locks the same amount the creator put up. Checking
    // here turns a rejected request into a clear message plus a way to top up.
    if (challenge.stakeUsdc && exceedsUsdcBalance(challenge.stakeUsdc, cashier.available)) {
      toast.error(`You need ${challenge.stakeUsdc} USDC to join that game.`);
      return;
    }
    if (challenge.stakeUsdc) {
      track("game_staked", { game: "checkers", amount_usd: Number(challenge.stakeUsdc) });
    }
    setJoining(true);
    try {
      await joinMatch(challenge.id, address);
      router.push(`/casino/checkers/play?match=${challenge.id}`);
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't join that game."));
    } finally {
      setJoining(false);
    }
  };

  const quiet = !error && challenges.length === 0 && mine.length === 0 && live.length === 0;

  return (
    <>
      <div className="mx-auto w-full max-w-[1264px] px-4 pb-10">
        {/* Board pinned on the left below the sticky topbar while the menu
            column scrolls on its own, the same arrangement as chess. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,840px)_392px]">
          <section
            className="rounded-[8px] p-4 shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:sticky xl:top-[84px] xl:self-start"
            style={{ background: MENU_SURFACE_BG }}
          >
            <div className="mx-auto w-full max-w-[var(--board-max)] [--board-max:min(100%,780px,calc(100vh_-_255px))] xl:[--board-max:min(100%,780px,calc(100vh_-_350px))]">
              <PlayerBar label="Opponent" />
              <div className="mt-4 overflow-hidden rounded-[2px]">
                <DraughtsBoardView board={LANDING_BOARD} orientation="white" />
              </div>
              <div className="mt-4">
                <PlayerBar label={selfLabel(wallet.name, address)} active={wallet.connected} />
              </div>
            </div>
          </section>

          <aside
            className="overflow-hidden rounded-[8px] shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:sticky xl:top-[84px] xl:max-h-[calc(100vh-116px)] xl:self-start xl:overflow-y-auto"
            style={{ background: MENU_SHELL_BG }}
          >
            <MenuHeader title="Play Checkers" />
            <div className="space-y-3 p-4 sm:p-5">
              <ChessCashierLauncher />
              <div className="space-y-2">
                <MenuActionButton
                  title="Live Now"
                  note="Watch active games and open the live market"
                  icon={<FlameIcon size={20} />}
                  onClick={() => setLiveOpen(true)}
                  ariaLabel="Open live games"
                />
                <MenuActionLink
                  title="Play a Friend"
                  note="Invite a friend to a game of checkers"
                  icon={<GameArrowsIcon size={20} />}
                  href="/casino/checkers/create"
                />
                <MenuActionLink
                  title="Tournaments"
                  note="Browse current events and create a Swiss tournament"
                  icon={<FlagIcon size={20} />}
                  href="/casino/checkers/tournaments"
                />
              </div>

              {/* Your own waiting seats first: the action is to reopen them. */}
              {mine.length > 0 ? (
                <div className="space-y-2">
                  {mine.map((match) => (
                    <StateRow
                      key={match.id}
                      label={
                        match.state === "awaiting_opponent"
                          ? "Waiting for an opponent"
                          : "Your game in progress"
                      }
                      meta={
                        match.wager
                          ? `${match.wager.stakeUsdc} USDC · ${match.timeControl}`
                          : match.timeControl
                      }
                      action="Open"
                      onAction={() => router.push(`/casino/checkers/play?match=${match.id}`)}
                    />
                  ))}
                </div>
              ) : null}

              {challenges.length > 0 ? (
                <div className="space-y-2">
                  <span className="sr-only">Open games</span>
                  {challenges.map((challenge) => (
                    <StateRow
                      key={challenge.id}
                      label={challenge.creator?.username ?? "Open seat"}
                      meta={
                        challenge.stakeUsdc
                          ? `Stake ${challenge.stakeUsdc} USDC · ${challenge.timeControl}`
                          : `Free · ${challenge.timeControl}`
                      }
                      action={challenge.stakeUsdc ? `Stake ${challenge.stakeUsdc}` : "Join"}
                      disabled={joining}
                      onAction={() => void onJoin(challenge)}
                    />
                  ))}
                </div>
              ) : null}

              {error ? <CasinoError error={error} subject="checkers" onRetry={refetch} /> : null}

              {quiet ? (
                <EmptyHint lines={["No games running yet.", "Start one and share the link."]} />
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <CheckersLiveNowDialog open={liveOpen} onClose={() => setLiveOpen(false)} matches={live} />
    </>
  );
}
