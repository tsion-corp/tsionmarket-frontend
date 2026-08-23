"use client";

import Link from "next/link";
import { CasinoEmpty, CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  ArenaClock,
  formatArenaDuration,
} from "@/features/casino/components/chess/arena/arena-clock";
import { useArenaList } from "@/features/casino/hooks/use-casino-arena";
import type { ArenaStatus, ArenaSummary } from "@/features/casino/lib/api/arena";

const GROUPS: ReadonlyArray<{ status: ArenaStatus; title: string; note: string }> = [
  { status: "started", title: "Now playing", note: "Games are paired continuously" },
  { status: "created", title: "Starting soon", note: "Join before the clock begins" },
  { status: "finished", title: "Completed", note: "Final standings and games" },
];

function ArenaMark({ status }: { status: ArenaStatus }) {
  return (
    <span
      className={`grid size-11 shrink-0 place-items-center rounded-[11px] border text-[22px] ${
        status === "started"
          ? "border-[#3c3f42] bg-[#111214] text-[#c2c8cc]"
          : "border-[#3d4449] bg-[#171a1d] text-[#aab0b4]"
      }`}
      aria-hidden
    >
      ♜
    </span>
  );
}

function ArenaRow({ arena }: { arena: ArenaSummary }) {
  const timerTarget = arena.status === "created" ? arena.startsAt : arena.finishesAt;
  const stateLabel =
    arena.status === "created"
      ? "Starts in"
      : arena.status === "started"
        ? "Time left"
        : arena.winner
          ? `${arena.winner} won`
          : "Finished";

  return (
    <Link
      href={`/casino/chess/tournaments/${arena.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_108px] items-center gap-3 border-t border-white/[0.065] px-4 py-3.5 transition-colors first:border-t-0 hover:bg-white/[0.045] sm:grid-cols-[minmax(0,1fr)_120px_112px_130px] sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <ArenaMark status={arena.status} />
        <div className="min-w-0">
          <div className="truncate font-serif text-[16px] font-bold tracking-[-0.015em] text-white transition-colors group-hover:text-[#dce0e2]">
            {arena.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-white/44">
            <span className="font-semibold text-white/65">{arena.timeControl}</span>
            <span>{formatArenaDuration(arena.durationSeconds)}</span>
            <span className="sm:hidden">{arena.participantCount.toLocaleString()} players</span>
          </div>
        </div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="tnum text-[14px] font-semibold text-white/78">
          {arena.participantCount.toLocaleString()}
        </div>
        <div className="text-[10px] tracking-[0.08em] text-white/30 uppercase">players</div>
      </div>
      <div className="hidden text-right sm:block">
        <div className="tnum text-[14px] font-semibold text-white/78">
          {arena.ongoingCount.toLocaleString()}
        </div>
        <div className="text-[10px] tracking-[0.08em] text-white/30 uppercase">games live</div>
      </div>
      <div className="text-right">
        {arena.status === "finished" ? (
          <div className="truncate text-[12px] font-semibold text-white/64">{stateLabel}</div>
        ) : (
          <ArenaClock target={timerTarget} compact />
        )}
        <div className="mt-0.5 text-[10px] tracking-[0.08em] text-white/30 uppercase">
          {stateLabel}
        </div>
      </div>
    </Link>
  );
}

function ArenaGroup({
  title,
  note,
  arenas,
}: {
  title: string;
  note: string;
  arenas: ArenaSummary[];
}) {
  if (arenas.length === 0) return null;
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <h2 className="font-serif text-[19px] font-bold text-white">{title}</h2>
        <p className="hidden text-[11.5px] text-white/38 sm:block">{note}</p>
      </div>
      <div className="overflow-hidden rounded-[13px] border border-[#292b2d] bg-[#0b0c0d] shadow-[0_22px_70px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.025)]">
        {arenas.map((arena) => (
          <ArenaRow key={arena.id} arena={arena} />
        ))}
      </div>
    </section>
  );
}

export function ArenaListSection() {
  const { arenas, isLoading, error, refetch } = useArenaList();

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-7 pb-20 sm:px-6 sm:pt-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2 text-[10px] font-bold tracking-[0.18em] text-[#9da4a9] uppercase">
            Continuous pairing
          </div>
          <h1 className="font-serif text-[clamp(29px,5vw,44px)] font-bold tracking-[-0.035em] text-white">
            Arena tournaments
          </h1>
          <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-white/48">
            Join at any time, play as many games as possible, and climb the table before the arena
            clock expires.
          </p>
        </div>
        <Link
          href="/casino/chess/tournaments/create"
          className="rounded-[9px] border border-[#747d84]/70 bg-[linear-gradient(145deg,#596168_0%,#30353a_100%)] px-5 py-3 text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_28px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-0.5"
        >
          Create an Arena
        </Link>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start">
        <main>
          {error ? (
            <CasinoError error={error} subject="Arena tournaments" onRetry={refetch} />
          ) : isLoading ? (
            <CasinoLoading label="Loading Arena tournaments" rows={5} />
          ) : arenas.length === 0 ? (
            <CasinoEmpty>No Arena tournaments yet. Create the first one.</CasinoEmpty>
          ) : (
            GROUPS.map((group) => (
              <ArenaGroup
                key={group.status}
                title={group.title}
                note={group.note}
                arenas={arenas.filter((arena) => arena.status === group.status)}
              />
            ))
          )}
        </main>

        <aside className="rounded-[13px] border border-[#292b2d] bg-[#0b0c0d] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] lg:sticky lg:top-[84px]">
          <h2 className="font-serif text-[18px] font-bold text-white">How Arena works</h2>
          <ol className="mt-4 space-y-4 text-[12.5px] leading-5 text-white/50">
            <li className="flex gap-3">
              <b className="text-[#aeb4b8]">1</b>
              <span>Join once. You enter the pairing pool when the Arena starts.</span>
            </li>
            <li className="flex gap-3">
              <b className="text-[#aeb4b8]">2</b>
              <span>After each game, the next opponent is assigned automatically.</span>
            </li>
            <li className="flex gap-3">
              <b className="text-[#aeb4b8]">3</b>
              <span>Wins score 2 points. Win streaks unlock double scoring.</span>
            </li>
          </ol>
          <div className="mt-5 border-t border-white/[0.07] pt-4 text-[11px] leading-5 text-white/33">
            Free entry. No deposits, prizes, or wallet funds are used in this test flow.
          </div>
        </aside>
      </div>
    </div>
  );
}
