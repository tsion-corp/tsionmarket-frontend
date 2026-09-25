"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  ArenaClock,
  formatArenaDuration,
  useArenaCountdown,
} from "@/features/casino/components/chess/arena/arena-clock";
import { useArenaTournament } from "@/features/casino/hooks/use-casino-arena";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import type { ArenaDetail, ArenaPairing, ArenaStanding } from "@/features/casino/lib/api/arena";
import { copyText } from "@/lib/clipboard";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

function gameHref(matchId: string, playerName: string): string {
  return `/casino/chess/play?match=${encodeURIComponent(matchId)}&player=${encodeURIComponent(playerName)}`;
}

function spectatorHref(pairing: ArenaPairing): string {
  if (!pairing.matchId) return "#";
  return pairing.status === "ongoing"
    ? `/casino/chess/watch?match=${encodeURIComponent(pairing.matchId)}`
    : `/casino/chess/review?match=${encodeURIComponent(pairing.matchId)}`;
}

function tournamentState(detail: ArenaDetail, startsIn: number): { title: string; note: string } {
  if (detail.status === "finished") {
    return {
      title: detail.winner ? `${detail.winner} wins` : "Arena complete",
      note: "Final standings",
    };
  }
  if (detail.status === "started") {
    return { title: "Arena in progress", note: "Time remaining" };
  }
  if (startsIn === 0 && detail.participantCount < 2) {
    return { title: "Waiting for players", note: "Two players are required" };
  }
  return { title: "Arena starts in", note: "Join before pairing begins" };
}

function ArenaHero({ detail }: { detail: ArenaDetail }) {
  const startsIn = useArenaCountdown(detail.status === "created" ? detail.startsAt : null);
  const state = tournamentState(detail, startsIn);
  const target = detail.status === "created" ? detail.startsAt : detail.finishesAt;

  return (
    <header className="relative overflow-hidden border-b border-white/[0.07] px-5 py-7 text-center sm:px-8 sm:py-9">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 50% -20%, rgba(169,178,185,0.15), transparent 48%), linear-gradient(180deg, rgba(255,255,255,.025), transparent)",
        }}
      />
      <div className="relative">
        <div
          className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-[#7e878e]/45 bg-[linear-gradient(145deg,rgba(111,119,125,0.28),rgba(39,44,48,0.3))] text-[24px] text-[#d0d5d8] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          aria-hidden
        >
          ♜
        </div>
        <h1 className="font-serif text-[clamp(25px,5vw,38px)] font-bold tracking-[-0.03em] text-white">
          {detail.name}
        </h1>
        <div className="mt-2 text-[11.5px] text-white/43">
          {detail.timeControl} · {formatArenaDuration(detail.durationSeconds)} · Free entry ·{" "}
          {detail.participantCount.toLocaleString()} players
        </div>
        <div className="mt-6">
          {detail.status === "finished" ? (
            <div className="font-serif text-[clamp(34px,7vw,62px)] font-bold tracking-[-0.04em] text-[#d2d7da]">
              {state.title}
            </div>
          ) : (
            <ArenaClock target={target} />
          )}
        </div>
        <div className="mt-1 text-[10px] font-bold tracking-[0.14em] text-white/30 uppercase">
          {detail.status === "finished" ? state.note : state.title}
        </div>
      </div>
    </header>
  );
}

function ResultMarks({ standing }: { standing: ArenaStanding }) {
  const marks = [
    ...Array(Math.min(standing.wins, 4)).fill("W"),
    ...Array(Math.min(standing.draws, 3)).fill("D"),
    ...Array(Math.min(standing.losses, 3)).fill("L"),
  ].slice(-6) as string[];
  if (marks.length === 0) return <span className="text-white/22">No games</span>;
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${standing.wins} wins, ${standing.draws} draws, ${standing.losses} losses`}
    >
      {marks.map((mark, index) => (
        <span
          key={`${mark}-${index}`}
          className={`grid size-[18px] place-items-center rounded-[4px] text-[8px] font-bold ${
            mark === "W"
              ? "bg-[#a8c964]/18 text-[#c3dd8c]"
              : mark === "D"
                ? "bg-white/10 text-white/56"
                : "bg-[#d67d70]/12 text-[#d99b91]"
          }`}
        >
          {mark}
        </span>
      ))}
    </span>
  );
}

function countryFlag(countryCode: string): string {
  return String.fromCodePoint(
    ...countryCode
      .toUpperCase()
      .split("")
      .map((letter) => 127397 + letter.charCodeAt(0))
  );
}

function CountryTag({ countryCode }: { countryCode: string | null }) {
  if (!countryCode) return null;
  return (
    <span
      aria-label={`${countryCode} country`}
      className="flex shrink-0 items-center gap-1 rounded-[4px] border border-white/[0.09] bg-white/[0.045] px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-white/48"
    >
      <span aria-hidden className="text-[11px] leading-none">
        {countryFlag(countryCode)}
      </span>
      {countryCode}
    </span>
  );
}

function Standings({ detail }: { detail: ArenaDetail }) {
  return (
    <section>
      <div className="grid grid-cols-[38px_minmax(0,1fr)_48px] border-y border-white/[0.065] bg-black/10 px-3 py-2 text-[9px] font-bold tracking-[0.11em] text-white/28 uppercase sm:grid-cols-[54px_minmax(0,1fr)_150px_70px] sm:px-5">
        <span>Rank</span>
        <span>Player</span>
        <span className="hidden sm:block">Form</span>
        <span className="text-right">Score</span>
      </div>
      {detail.standings.length === 0 ? (
        <div className="px-5 py-12 text-center text-[13px] text-white/38">
          Standings appear after players join.
        </div>
      ) : (
        <div>
          {detail.standings.map((standing) => {
            const mine = detail.me?.name === standing.name;
            return (
              <div
                key={standing.name}
                className={`grid grid-cols-[38px_minmax(0,1fr)_48px] items-center border-b border-white/[0.055] px-3 py-2.5 text-[12px] sm:grid-cols-[54px_minmax(0,1fr)_150px_70px] sm:px-5 ${mine ? "bg-white/[0.055]" : "hover:bg-white/[0.025]"}`}
              >
                <span className="tnum font-semibold text-white/42">{standing.rank}</span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`size-2 shrink-0 rounded-full ${standing.playing ? "bg-[#e0b15d]" : standing.active ? "bg-[#a8c964]" : "bg-white/16"}`}
                  />
                  <CountryTag countryCode={standing.countryCode} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white/82">
                      {standing.fire ? (
                        <span className="mr-1 text-[#e9a45d]" aria-label="Win streak">
                          ◆
                        </span>
                      ) : null}
                      {standing.name}
                      {mine ? <span className="ml-1.5 text-[9px] text-[#c2c8cc]">YOU</span> : null}
                    </div>
                    <div className="tnum text-[9.5px] text-white/28">
                      {standing.rating} · {standing.games} games
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <ResultMarks standing={standing} />
                </div>
                <span className="tnum text-right text-[16px] font-bold text-white">
                  {standing.score}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {detail.me && detail.me.rank > detail.standings.length ? (
        <div className="flex items-center justify-between border-t border-[#a8c964]/20 bg-[#a8c964]/[0.07] px-5 py-3 text-[12px]">
          <span className="text-white/55">Your rank</span>
          <span className="tnum font-bold text-white">
            #{detail.me.rank} · {detail.me.score} points
          </span>
        </div>
      ) : null}
    </section>
  );
}

function pairingResult(pairing: ArenaPairing): string {
  if (pairing.status === "ongoing" || pairing.status === "creating") return "Playing";
  if (pairing.status === "draw") return "½ – ½";
  if (pairing.status === "white") return "1 – 0";
  if (pairing.status === "black") return "0 – 1";
  return "Cancelled";
}

function RecentGames({ pairings }: { pairings: ArenaPairing[] }) {
  return (
    <section className="border-t border-white/[0.07] p-5">
      <h2 className="font-serif text-[17px] font-bold text-white">Recent games</h2>
      <div className="mt-3 space-y-1">
        {pairings.length === 0 ? (
          <p className="py-4 text-[12px] text-white/35">Games will appear when the Arena starts.</p>
        ) : (
          pairings.slice(0, 8).map((pairing) => {
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-semibold text-white/72">
                    □ {pairing.white}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] font-semibold text-white/72">
                    ■ {pairing.black}
                  </div>
                </div>
                <span
                  className={`tnum text-[11px] font-bold ${pairing.status === "ongoing" ? "text-[#b8d87b]" : "text-white/48"}`}
                >
                  {pairingResult(pairing)}
                </span>
              </>
            );
            return pairing.matchId ? (
              <Link
                key={pairing.id}
                href={spectatorHref(pairing)}
                className="flex items-center gap-3 rounded-[7px] px-2 py-2 transition-colors hover:bg-white/[0.045]"
              >
                {body}
              </Link>
            ) : (
              <div key={pairing.id} className="flex items-center gap-3 rounded-[7px] px-2 py-2">
                {body}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function PlayerAction({
  detail,
  connected,
  joining,
  withdrawing,
  onJoin,
  onWithdraw,
}: {
  detail: ArenaDetail;
  connected: boolean;
  joining: boolean;
  withdrawing: boolean;
  onJoin: () => void;
  onWithdraw: () => void;
}) {
  if (detail.status === "finished") return null;
  if (detail.me?.playing && detail.myPairing?.matchId) {
    return (
      <Link
        href={gameHref(detail.myPairing.matchId, detail.me.name)}
        className="block w-full rounded-[9px] border border-[#858e95]/70 bg-[linear-gradient(145deg,#626b72_0%,#343a3f_100%)] px-4 py-3 text-center text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
      >
        Join the game
      </Link>
    );
  }
  if (detail.me?.active) {
    return (
      <button
        type="button"
        onClick={onWithdraw}
        disabled={withdrawing}
        className="w-full rounded-[9px] border border-white/12 bg-white/[0.035] px-4 py-3 text-[12.5px] font-semibold text-white/68 hover:bg-white/[0.07] disabled:opacity-45"
      >
        {withdrawing ? "Updating…" : detail.status === "started" ? "Pause pairing" : "Withdraw"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={joining}
      className="w-full rounded-[9px] border border-[#858e95]/70 bg-[linear-gradient(145deg,#626b72_0%,#343a3f_100%)] px-4 py-3 text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] disabled:opacity-50"
    >
      {!connected
        ? "Connect to join"
        : joining
          ? "Joining…"
          : detail.me
            ? "Rejoin Arena"
            : "Join Arena"}
    </button>
  );
}

function PlayerNotice({ detail }: { detail: ArenaDetail }) {
  if (!detail.me || detail.status === "finished") return null;
  if (detail.myPairing?.matchId) {
    const opponent =
      detail.myPairing.white === detail.me.name ? detail.myPairing.black : detail.myPairing.white;
    return (
      <div className="border-b border-[#717a81]/30 bg-white/[0.045] px-5 py-4 text-center">
        <div className="text-[10px] font-bold tracking-[0.13em] text-[#c4cacf] uppercase">
          Your game is ready
        </div>
        <div className="mt-1 text-[13px] font-semibold text-white">Playing {opponent}</div>
      </div>
    );
  }
  if (detail.status === "started" && detail.me.active) {
    return (
      <div className="border-b border-white/[0.065] bg-black/10 px-5 py-3.5 text-center text-[12.5px] text-white/56">
        <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-[#a8c964]" />
        Stand by {detail.me.name}. Pairing you with an opponent…
      </div>
    );
  }
  return null;
}

export function ArenaDetailSection({
  arenaId,
  showCreatedShare = false,
}: {
  arenaId: string;
  showCreatedShare?: boolean;
}) {
  const router = useRouter();
  const wallet = useCasinoWallet();
  const arena = useArenaTournament(arenaId);
  const redirectedPairing = useRef<string | null>(null);
  const detail = arena.detail;

  useEffect(() => {
    const matchId = detail?.myPairing?.matchId;
    const player = detail?.me?.name;
    if (!matchId || !player || redirectedPairing.current === matchId) return;
    redirectedPairing.current = matchId;
    const timer = window.setTimeout(() => router.replace(gameHref(matchId, player)), 700);
    return () => window.clearTimeout(timer);
  }, [detail?.me?.name, detail?.myPairing?.matchId, router]);

  if (arena.error)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-10">
        <CasinoError error={arena.error} subject="Arena" onRetry={arena.refetch} />
      </div>
    );
  if (arena.isLoading || !detail)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-10">
        <CasinoLoading label="Loading Arena" rows={7} />
      </div>
    );

  const handleJoin = async () => {
    if (!wallet.connected) {
      router.push("/auth");
      return;
    }
    const toastId = toast.loading(detail.me ? "Rejoining Arena…" : "Joining Arena…");
    try {
      await arena.join();
      toast.success("You are in the pairing pool.", { id: toastId });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't join this Arena."), { id: toastId });
    }
  };

  const handleWithdraw = async () => {
    const toastId = toast.loading(
      detail.status === "started" ? "Pausing pairings…" : "Leaving Arena…"
    );
    try {
      await arena.withdraw();
      toast.success(detail.status === "started" ? "Pairing paused." : "You left the Arena.", {
        id: toastId,
      });
    } catch (error) {
      toast.error(friendlyError(error, "We couldn't update your Arena seat."), { id: toastId });
    }
  };

  const handleStart = async () => {
    const toastId = toast.loading("Starting Arena…");
    try {
      await arena.start();
      toast.success("Arena started.", { id: toastId });
    } catch (error) {
      toast.error(friendlyError(error, "The Arena could not start yet."), { id: toastId });
    }
  };

  const share = async () => {
    const ok = await copyText(window.location.href.split("?")[0]);
    if (ok) toast.success("Arena link copied.");
  };

  return (
    <div className="mx-auto w-full max-w-[1160px] px-3 pt-5 pb-20 sm:px-6 sm:pt-8">
      {showCreatedShare ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#a8c964]/20 bg-[#a8c964]/[0.07] px-4 py-3 text-[12px] text-white/62">
          <span>Arena created. Share the link and join before it starts.</span>
          <button type="button" onClick={() => void share()} className="font-bold text-[#c2dc8b]">
            Copy link
          </button>
        </div>
      ) : null}

      <div className="grid overflow-hidden rounded-[15px] border border-white/[0.08] bg-white/[0.025] shadow-[0_28px_90px_rgba(0,0,0,0.28)] lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 lg:border-r lg:border-white/[0.07]">
          <ArenaHero detail={detail} />
          <PlayerNotice detail={detail} />
          <Standings detail={detail} />
        </main>

        <aside className="bg-black/[0.08]">
          <div className="p-5">
            <PlayerAction
              detail={detail}
              connected={wallet.connected}
              joining={arena.joining}
              withdrawing={arena.withdrawing}
              onJoin={() => void handleJoin()}
              onWithdraw={() => void handleWithdraw()}
            />

            {arena.isOrganizer && detail.status === "created" ? (
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={arena.starting || detail.participantCount < 2}
                className="mt-2.5 w-full rounded-[9px] border border-white/12 bg-white/[0.04] px-4 py-3 text-[12px] font-semibold text-white/72 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {arena.starting
                  ? "Starting…"
                  : detail.participantCount < 2
                    ? "Need 2 players to start"
                    : "Start now"}
              </button>
            ) : null}

            <dl className="mt-5 space-y-3 border-t border-white/[0.07] pt-5 text-[11.5px]">
              <div className="flex justify-between gap-4">
                <dt className="text-white/34">Organizer</dt>
                <dd className="truncate font-semibold text-white/65">{detail.organizer}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/34">Clock</dt>
                <dd className="tnum font-semibold text-white/65">{detail.timeControl}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/34">Duration</dt>
                <dd className="font-semibold text-white/65">
                  {formatArenaDuration(detail.durationSeconds)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/34">Capacity</dt>
                <dd className="tnum font-semibold text-white/65">
                  {detail.maxPlayers.toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/34">Entry</dt>
                <dd className="font-semibold text-[#b8d87b]">Free</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => void share()}
              className="mt-5 w-full rounded-[8px] border border-white/[0.08] px-3 py-2.5 text-[11.5px] font-semibold text-white/50 hover:bg-white/[0.04] hover:text-white/72"
            >
              Share Arena
            </button>
          </div>

          <RecentGames pairings={detail.featuredPairings} />

          <div className="border-t border-white/[0.07] p-5 text-[10.5px] leading-5 text-white/30">
            Win = 2 points, draw = 1. Two consecutive wins activate double scoring until the streak
            ends.
          </div>
        </aside>
      </div>
    </div>
  );
}
