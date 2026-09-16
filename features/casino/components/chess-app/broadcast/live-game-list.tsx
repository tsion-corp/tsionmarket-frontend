"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Chessground } from "@lichess-org/chessground";
import type { Api as ChessgroundApi } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import { countryFlag, playerIdentityLabel } from "@/features/casino/lib/chess/social";
import type {
  ChessColor,
  ChessMatch,
  ChessPlayer,
  ChessVariant,
} from "@/features/casino/lib/api/types";
import {
  installLichessRuntime,
  loadLichessScript,
  loadLichessStyle,
  type LichessPowertip,
} from "@/features/casino/components/chess/lichess-round";
import { licon } from "../../chess/lib/src/licon";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const TV_GAMES_CSS = "/css/bits.tv.games.72c184d6.css";
const CASH_MODULE = "/chess/lichess/javascripts/vendor/cash.min.js";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

type ChannelKey =
  | "best"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "chess960"
  | "kingOfTheHill"
  | "threeCheck"
  | "antichess"
  | "atomic"
  | "horde"
  | "racingKings"
  | "crazyhouse";

type Channel = {
  key: ChannelKey;
  label: string;
  icon: string;
  matches(match: ChessMatch): boolean;
};

function clockMinutes(match: ChessMatch): number {
  const minutes = Number.parseFloat(match.timeControl.split("+")[0] ?? "");
  return Number.isFinite(minutes) ? minutes : Number.POSITIVE_INFINITY;
}

function speedChannel(match: ChessMatch, minimum: number, maximum: number): boolean {
  if (match.variant !== "standard") return false;
  const minutes = clockMinutes(match);
  return minutes >= minimum && minutes < maximum;
}

function variantChannel(variant: ChessVariant): (match: ChessMatch) => boolean {
  return (match) => match.variant === variant;
}

const CHANNELS: readonly Channel[] = [
  { key: "best", label: "Top rated", icon: licon.CrownElite, matches: () => true },
  { key: "bullet", label: "Bullet", icon: licon.Bullet, matches: (match) => speedChannel(match, 0, 3) },
  { key: "blitz", label: "Blitz", icon: licon.FlameBlitz, matches: (match) => speedChannel(match, 3, 9) },
  { key: "rapid", label: "Rapid", icon: licon.Rabbit, matches: (match) => speedChannel(match, 9, 30) },
  { key: "classical", label: "Classical", icon: licon.Turtle, matches: (match) => speedChannel(match, 30, Number.POSITIVE_INFINITY) },
  { key: "chess960", label: "Chess960", icon: licon.DieSix, matches: variantChannel("chess960") },
  { key: "kingOfTheHill", label: "King of the hill", icon: licon.FlagKingHill, matches: variantChannel("kingOfTheHill") },
  { key: "threeCheck", label: "Three-check", icon: licon.ThreeCheckStack, matches: variantChannel("threeCheck") },
  { key: "antichess", label: "Antichess", icon: licon.Antichess, matches: variantChannel("antichess") },
  { key: "atomic", label: "Atomic", icon: licon.Atom, matches: variantChannel("atomic") },
  { key: "horde", label: "Horde", icon: licon.Multiboard, matches: variantChannel("horde") },
  { key: "racingKings", label: "Racing kings", icon: licon.FlagRacingKings, matches: variantChannel("racingKings") },
  { key: "crazyhouse", label: "Crazyhouse", icon: licon.Crazyhouse, matches: variantChannel("crazyhouse") },
];

function highestRatedPlayer(matches: ChessMatch[]): ChessPlayer | null {
  let champion: ChessPlayer | null = null;
  for (const match of matches) {
    for (const player of [match.white, match.black]) {
      if (player && (player.rating ?? 0) > (champion?.rating ?? 0)) champion = player;
    }
  }
  return champion;
}

function matchRating(match: ChessMatch): number {
  return Math.max(match.white?.rating ?? 0, match.black?.rating ?? 0);
}

function playerLabel(player: ChessPlayer | null, fallback: string): string {
  if (!player) return fallback;
  return playerIdentityLabel(player.username || player.walletAddress, player);
}

function miniPlayerLabel(player: ChessPlayer | null, fallback: string): string {
  if (!player) return fallback;
  const label = player.username || player.walletAddress;
  return player.rating === null ? label : `${label} (${player.rating})`;
}

function boardFen(match: ChessMatch): string {
  if (match.fen.includes("/")) return match.fen;
  if (match.initialFen.includes("/")) return match.initialFen;
  return START_FEN;
}

function lastMove(match: ChessMatch): [Key, Key] | undefined {
  const steps = match.round?.steps ?? [];
  const uci = steps[steps.length - 1]?.uci;
  if (!uci || uci.length < 4 || uci.includes("@")) return undefined;
  return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
}

function remainingSeconds(match: ChessMatch, color: ChessColor, now: number): number {
  const banked = match.clocks[color];
  if (match.state !== "in_progress" || match.clockMode !== "real_time" || match.turn !== color) {
    return banked;
  }
  const anchor = Date.parse(match.clockUpdatedAt);
  const elapsed = Number.isFinite(anchor) ? Math.max(0, (now - anchor) / 1000) : 0;
  return Math.max(0, banked - elapsed);
}

function clockText(seconds: number): string {
  const rounded = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function MiniBoard({ match }: { match: ChessMatch }) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const apiRef = useRef<ChessgroundApi | null>(null);
  const fen = boardFen(match);
  const move = lastMove(match);
  const moveKey = move?.join("") ?? "";

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const api = Chessground(element, {
      fen,
      orientation: "white",
      coordinates: false,
      viewOnly: true,
      lastMove: move,
      animation: { enabled: true, duration: 200 },
      drawable: { enabled: false, visible: false },
    });
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.set({ fen, lastMove: move });
  }, [fen, moveKey]);

  return <span ref={elementRef} className="cg-wrap" aria-hidden />;
}

function MiniPlayer({
  match,
  color,
  now,
}: {
  match: ChessMatch;
  color: ChessColor;
  now: number;
}) {
  const player = color === "w" ? match.white : match.black;
  const seconds = remainingSeconds(match, color, now);
  const running = match.turn === color;
  return (
    <span className="mini-game__player">
      <span className="mini-game__user">
        {player?.countryCode ? (
          <span
            className="mini-game__flag"
            role="img"
            aria-label={`${player.countryCode.toUpperCase()} flag`}
          >
            {countryFlag(player.countryCode)}
          </span>
        ) : null}
        {miniPlayerLabel(player, color === "w" ? "White" : "Black")}
      </span>
      <span
        className={`mini-game__clock mini-game__clock--${color === "w" ? "white" : "black"}${running ? " clock--run" : ""}${seconds < 20 ? " emerg" : ""}`}
        data-time={Math.ceil(seconds)}
      >
        {clockText(seconds)}
      </span>
    </span>
  );
}

function LiveMiniGame({
  match,
  owned,
  now,
}: {
  match: ChessMatch;
  owned: boolean;
  now: number;
}) {
  const href = owned
    ? `/casino/chess/play?match=${encodeURIComponent(match.id)}`
    : `/casino/chess/watch?match=${encodeURIComponent(match.id)}`;
  const label = owned ? "Resume" : "Watch";
  return (
    <Link
      href={href}
      className={`mini-game mini-game-${match.id} ${match.variant} is2d`}
      aria-label={`${label} ${playerLabel(match.white, "White")} against ${playerLabel(match.black, "Black")}`}
      data-state={`${boardFen(match)},white,${lastMove(match)?.join("") ?? ""}`}
      data-tc={match.timeControl}
    >
      <MiniPlayer match={match} color="b" now={now} />
      <MiniBoard match={match} />
      <MiniPlayer match={match} color="w" now={now} />
      {match.videoEnabled ? <span className="sr-only">Player video</span> : null}
    </Link>
  );
}

function ChannelLink({
  channel,
  active,
  matches,
}: {
  channel: Channel;
  active: boolean;
  matches: ChessMatch[];
}) {
  const channelMatches = matches.filter(channel.matches);
  const champion = highestRatedPlayer(channelMatches);
  const href = channel.key === "best" ? "/casino/chess/watch" : `/casino/chess/watch?channel=${channel.key}`;
  return (
    <Link href={href} className={`tv-channel ${channel.key}${active ? " active" : ""}`}>
      <span data-icon={channel.icon}>
        <span>
          <strong>{channel.label}</strong>
          <span className="champion">
            {champion ? `${champion.username} ${champion.rating ?? ""}`.trim() : "-"}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function LiveGameList({
  matches,
  ownedMatchIds,
  channelKey = "best",
}: {
  matches: ChessMatch[];
  ownedMatchIds: ReadonlySet<string>;
  channelKey?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const activeChannel = CHANNELS.find((channel) => channel.key === channelKey) ?? CHANNELS[0];
  const visibleMatches = useMemo(
    () => matches.filter(activeChannel.matches).sort((left, right) => matchRating(right) - matchRating(left)),
    [activeChannel, matches]
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void Promise.all([
      loadLichessStyle(THEME_CSS),
      loadLichessStyle(SITE_CSS),
      loadLichessStyle(TV_GAMES_CSS),
      loadLichessScript(CASH_MODULE),
    ]).then(() => {
      installLichessRuntime(undefined, inertPowertip);
      document.body.classList.remove("playing", "fixed-scroll");
    });
  }, []);

  return (
    <main className="page-menu tv-games">
      <aside className="page-menu__menu">
        <aside className="subnav">
          <nav className="subnav__inner">
            {CHANNELS.map((channel) => (
              <ChannelLink
                key={channel.key}
                channel={channel}
                active={channel.key === activeChannel.key}
                matches={matches}
              />
            ))}
          </nav>
        </aside>
      </aside>
      <div className="page-menu__content now-playing">
        {visibleMatches.length > 0 ? (
          visibleMatches.map((match) => (
            <LiveMiniGame
              key={match.id}
              match={match}
              owned={ownedMatchIds.has(match.id)}
              now={now}
            />
          ))
        ) : (
          <div className="ark-tv-empty">
            <strong>No live games in this channel</strong>
            <span>Current human games appear here automatically.</span>
          </div>
        )}
      </div>
    </main>
  );
}
