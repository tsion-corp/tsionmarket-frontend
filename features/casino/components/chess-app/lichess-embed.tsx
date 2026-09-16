"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMatch, fetchPgn } from "@/features/casino/lib/api/chess";
import {
  installLichessRuntime,
  loadLichessStyle,
  type LichessPowertip,
} from "./lichess-round";

type LpvController = { div?: HTMLElement };
type LpvModule = {
  start(
    element: HTMLElement,
    options: Record<string, unknown>
  ): LpvController;
};

const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const EMBED_CSS = "/css/bits.lpv.embed.3fb6e9d9.css";
const LPV_MODULE = "/compiled/lib.QPVUN6AP.js";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

function playerName(
  side: "white" | "black",
  match: Awaited<ReturnType<typeof fetchMatch>>,
): string {
  if (match.computer?.side === side) {
    return `${match.computer.name} level ${match.computer.level}`;
  }
  return (side === "white" ? match.white?.username : match.black?.username) || "Anonymous";
}

function displayPgn(
  pgn: string,
  match: Awaited<ReturnType<typeof fetchMatch>>,
): string {
  return pgn
    .replace(/^\[Event "[^"]*"\]$/m, '[Event "Ark Chess"]')
    .replace(/^\[Site "[^"]*"\]$/m, '[Site "Ark"]')
    .replace(/^\[White "[^"]*"\]$/m, `[White "${playerName("white", match)}"]`)
    .replace(/^\[Black "[^"]*"\]$/m, `[Black "${playerName("black", match)}"]`);
}

export function LichessGameEmbed({
  matchId,
  orientation,
}: {
  matchId: string | null;
  orientation: "white" | "black";
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !matchId) return;
    let cancelled = false;

    void (async () => {
      try {
        const [rawPgn, match, module] = await Promise.all([
          fetchPgn(matchId),
          fetchMatch(matchId),
          import(/* webpackIgnore: true */ LPV_MODULE) as Promise<LpvModule>,
          loadLichessStyle(THEME_CSS),
          loadLichessStyle(EMBED_CSS),
        ]);
        if (cancelled) return;
        const pgn = displayPgn(rawPgn, match);
        installLichessRuntime(undefined, inertPowertip);
        document.body.classList.remove("playing", "fixed-scroll", "zenable");
        const requestedPly = Number.parseInt(window.location.hash.slice(1), 10);
        module.start(host, {
          pgn,
          orientation,
          initialPly: Number.isFinite(requestedPly) ? requestedPly : "last",
          showPlayers: true,
          showMoves: "right",
          showClocks: true,
          showControls: true,
          scrollToMove: true,
          keyboardToMove: true,
          lichess: false,
          menu: {
            getPgn: {
              enabled: true,
              fileName: `ark-chess-${matchId}.pgn`,
            },
            practiceWithComputer: { enabled: false },
            analysisBoard: { enabled: false },
          },
          translate: (key: string) =>
            ({
              flipTheBoard: "Flip the board",
              analysisBoard: "Analysis board",
              practiceWithComputer: "Practice with computer",
              getPgn: "Get PGN",
              download: "Download",
            })[key] ?? key,
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Game not found");
        }
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [matchId, orientation]);

  if (!matchId || error) {
    return <div className="not-found"><h1>{error ?? "Game not found"}</h1></div>;
  }
  return <div ref={hostRef} className="is2d" aria-label="Embedded chess game" />;
}
