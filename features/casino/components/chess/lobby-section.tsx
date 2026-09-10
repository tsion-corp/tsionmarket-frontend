"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useAcceptChallenge,
  useChessLobby,
  useQuickMatch,
} from "@/features/casino/hooks/use-casino-chess";
import { ChessComputerDialog } from "@/features/casino/components/chess/chess-computer-dialog";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { PlayerBar, StateRow } from "@/features/casino/components/game-menu";
import { ArrowRightIcon, GameArrowsIcon } from "@/components/ui/icons";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
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

function LobbyGroupIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3.5 19c.2-3.7 2.2-5.6 5.5-5.6s5.3 1.9 5.5 5.6M14 14.2c.8-.7 1.8-1 3-1 2.4 0 3.8 1.5 4 4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LobbyActionContent({
  title,
  note,
  icon,
  pending = false,
}: {
  title: string;
  note: string;
  icon: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-[8px] border border-white/[0.055] bg-black/20 text-white/48 transition-colors group-hover:text-[#c6ccd0] sm:size-12">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-sans text-[16px] font-semibold tracking-[-0.01em] text-white/90">
          {pending ? "Finding a game…" : title}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-white/44">{note}</span>
      </span>
      <ArrowRightIcon className="shrink-0 text-white/28 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
    </>
  );
}

const LOBBY_ACTION_CLASS =
  "group flex w-full cursor-pointer items-center gap-3.5 rounded-[8px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] px-4 py-3.5 transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-white/14 disabled:cursor-wait disabled:opacity-60";

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
  // The home screen only renders open seats. Live games have their own Watch
  // page, so polling that second list here doubled the lobby traffic for data
  // this component never read.
  const { challenges, isLoading, error, refetch } = useChessLobby(wallet.address ?? null, {
    liveMatches: false,
  });
  const accept = useAcceptChallenge();
  const quickMatch = useQuickMatch();
  const [computerOpen, setComputerOpen] = useState(() => searchParams.get("computer") === "1");

  const joinableChallenges = challenges.slice(0, 2);

  const onQuickMatch = async () => {
    if (!wallet.connected) {
      toast.error(t("toastConnect"));
      return;
    }

    const id = toast.loading(t("toastFinding"));
    try {
      const result = await quickMatch.mutateAsync({
        timeControl: "10+0",
        mode: "auto",
        rated: true,
        allowTimeExtensions: true,
      });
      if (result.matchId) {
        toast.success(t("toastFound"), { id });
        router.push(`/casino/chess/play?match=${result.matchId}`);
        return;
      }
      if (result.waitingOn) {
        toast.success(t("toastOpened"), { id });
        router.push(`/casino/chess/matchmaking?ticket=${result.waitingOn}`);
      }
    } catch (error) {
      toast.error(friendlyError(error, t("toastQuickFailed")), { id });
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
    <>
      <div className="mx-auto w-full max-w-[1520px] px-4 pt-5 pb-8 sm:px-6 lg:px-8">
        {/* On xl the board column is pinned below the sticky topbar and the
            menu column scrolls on its own, chess.com style, so the board never
            leaves the screen while browsing the menu. The 84px offset clears
            the sticky topbar and back link; 116px adds the bottom gap. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,840px)_392px]">
          <section
            className="rounded-[8px] p-3 shadow-[0_1px_1px_rgba(0,0,0,0.20)] sm:p-4 xl:sticky xl:top-[84px] xl:self-start"
            style={{ background: SURFACE_BG }}
          >
            {/* The board caps its own width to what fits the viewport height.
                Around it sit two player bars plus paddings (224px) and the
                topbar, page gaps (126px); the base 255px reserve
                is not enough on xl where the whole column must fit without
                page scroll, so the reserve grows to 350px there. */}
            <div className="mx-auto w-full max-w-[var(--board-max)] [--board-max:min(100%,780px)] xl:[--board-max:min(100%,780px,calc(100dvh_-_350px))]">
              <PlayerBar label={t("colOpponent")} />
              <div className="mt-4 overflow-hidden rounded-[2px]">
                <video
                  className="aspect-square w-full bg-[#769656] object-cover"
                  src="https://assets-configurator.chess.com/video/configurator/hero_1780586045036.webm"
                  aria-label="Animated chess game"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  disablePictureInPicture
                />
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
            className="flex min-h-[300px] flex-col overflow-hidden rounded-[8px] border border-white/[0.055] shadow-[0_1px_1px_rgba(0,0,0,0.20)] xl:min-h-0 xl:self-stretch"
            style={{ background: SHELL_BG }}
          >
            <div className="my-auto w-full space-y-2.5 p-3 sm:p-5">
              <button
                type="button"
                onClick={() => void onQuickMatch()}
                disabled={quickMatch.isPending}
                className={LOBBY_ACTION_CLASS}
                aria-label="Create a lobby game"
              >
                <LobbyActionContent
                  title="Create a lobby game"
                  note="Public lobby · 10+0 Rapid"
                  icon={<LobbyGroupIcon />}
                  pending={quickMatch.isPending}
                />
              </button>

              <Link href="/casino/chess/create" className={LOBBY_ACTION_CLASS}>
                <LobbyActionContent
                  title="Challenge a friend"
                  note="Create a private challenge link"
                  icon={<GameArrowsIcon size={22} />}
                />
              </Link>

              <button
                type="button"
                onClick={() => setComputerOpen(true)}
                className={LOBBY_ACTION_CLASS}
                aria-label="Set up a computer game"
              >
                <LobbyActionContent
                  title="Play against computer"
                  note="Choose a Stockfish level from 1 to 8"
                  icon={<ComputerIcon size={22} />}
                />
              </button>

              {joinableChallenges.length > 0 || error || isLoading ? (
                <div className="mt-4 border-t border-white/[0.065] pt-4">
                  <div className="mb-2.5 px-1 text-[10px] font-bold tracking-[0.14em] text-white/32 uppercase">
                    Open lobby games
                  </div>

                  {joinableChallenges.length > 0 ? (
                    <div className="space-y-2">
                      <span className="sr-only">{t("openChallenges")}</span>
                      {joinableChallenges.map((challenge) => {
                        const details = challenge.stakeUsdc
                          ? `${tCommon("stakedFor", { amount: challenge.stakeUsdc })} · ${timeControlLabel(tCommon, challenge.timeControl)}`
                          : timeControlLabel(tCommon, challenge.timeControl);
                        const matchDetails = challenge.videoEnabled
                          ? `${details} · Video`
                          : details;
                        return (
                          <StateRow
                            key={challenge.id}
                            label={challenge.creator.username}
                            meta={matchDetails}
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
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      {computerOpen ? <ChessComputerDialog open onClose={() => setComputerOpen(false)} /> : null}
    </>
  );
}
