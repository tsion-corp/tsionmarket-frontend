"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  inertPowertip,
  installLichessRuntime,
  loadLichessScript,
  loadLichessStyle,
} from "@/features/casino/components/chess-app/lichess-round";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  fetchNextPuzzle,
  fetchPuzzle,
  fetchPuzzleSolution,
} from "@/features/casino/lib/api/chess-puzzles";
import {
  installPuzzleBridge,
  lichessPuzzleOptions,
  type LichessPuzzleModule,
} from "./puzzle-bridge";
import {
  parsePuzzleColor,
  parsePuzzleDifficulty,
  puzzleTargetRating,
} from "./puzzle-preferences";

const PLAYER_PUZZLE_RATING = 1500;
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const PUZZLE_CSS = "/css/ark-puzzle.css";
const PUZZLE_MODULE = "/compiled/ark-puzzle.js?v=3";
const CASH_MODULE = "/chess/lichess/javascripts/vendor/cash.min.js";

// Ark's header already participates in document flow. Lichess's native header
// does not, so its site CSS reserves that height above #main-wrap.
export const puzzleMainWrapStyle = { marginTop: "var(---sticky-gap)" } as const;

function mountPuzzleShell(host: HTMLElement) {
  const main = document.createElement("main");
  main.className = "puzzle";
  main.innerHTML =
    '<aside class="puzzle__side"><div class="puzzle__side__metas"></div></aside>' +
    '<div class="puzzle__board main-board"><div class="cg-wrap"></div></div>' +
    '<div class="puzzle__tools"></div><div class="puzzle__controls"></div>';
  host.replaceChildren(main);
}

export function PuzzleSection() {
  const searchParams = useSearchParams();
  const wallet = useCasinoWallet();
  const player = wallet.address ?? "anonymous";
  const requestedPuzzleId = searchParams.get("id")?.trim() || null;
  const requestedTheme = searchParams.get("theme")?.trim() || undefined;
  const requestedDifficulty = parsePuzzleDifficulty(searchParams.get("difficulty"));
  const requestedColor = parsePuzzleColor(searchParams.get("color"));
  const targetRating = puzzleTargetRating(PLAYER_PUZZLE_RATING, requestedDifficulty);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shellError, setShellError] = useState<Error | null>(null);

  const puzzleQuery = useQuery({
    queryKey: [
      "casino",
      "chess",
      "lichess-puzzle",
      requestedPuzzleId,
      player,
      requestedTheme,
      requestedDifficulty,
      requestedColor,
    ],
    queryFn: async () => {
      const puzzle = requestedPuzzleId
        ? await fetchPuzzle(requestedPuzzleId)
        : await fetchNextPuzzle(player, targetRating, requestedTheme);
      const solution = await fetchPuzzleSolution(puzzle.id);
      return { puzzle, solution };
    },
    retry: 1,
  });

  useEffect(() => {
    const loaded = puzzleQuery.data;
    const host = hostRef.current;
    if (!loaded || !host) return;
    let cancelled = false;
    mountPuzzleShell(host);

    const bridgeOptions = {
      color: requestedColor,
      difficulty: requestedDifficulty,
      player,
      playerRating: PLAYER_PUZZLE_RATING,
      targetRating,
      theme: requestedTheme,
    };
    const removeBridge = installPuzzleBridge(bridgeOptions);
    installLichessRuntime(wallet.address ?? undefined, inertPowertip);
    document.body.classList.add("is2d", "playing");
    document.body.dataset.puzzle = loaded.puzzle.id;

    void (async () => {
      try {
        await Promise.all([
          loadLichessStyle(THEME_CSS),
          loadLichessStyle(SITE_CSS),
          loadLichessStyle(PUZZLE_CSS),
          loadLichessScript(CASH_MODULE),
        ]);
        if (cancelled) return;
        const module = (await import(
          /* webpackIgnore: true */ PUZZLE_MODULE
        )) as LichessPuzzleModule;
        if (cancelled) return;
        await module.initModule(
          lichessPuzzleOptions(loaded.puzzle, loaded.solution, bridgeOptions)
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Lichess puzzle initialization failed", error);
          setShellError(
            error instanceof Error ? error : new Error("Unable to initialize puzzles")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      removeBridge();
      host.replaceChildren();
      document.body.classList.remove("playing", "fixed-scroll");
      delete document.body.dataset.puzzle;
    };
  }, [
    player,
    puzzleQuery.data,
    requestedColor,
    requestedDifficulty,
    requestedTheme,
    targetRating,
    wallet.address,
  ]);

  if (puzzleQuery.error || shellError) {
    return (
      <CasinoError
        error={puzzleQuery.error ?? shellError}
        subject="chess puzzles"
        onRetry={() => void puzzleQuery.refetch()}
      />
    );
  }

  if (!puzzleQuery.data) return <CasinoLoading label="Finding your next puzzle" rows={6} />;

  return <div id="main-wrap" ref={hostRef} className="is2d" style={puzzleMainWrapStyle} />;
}
