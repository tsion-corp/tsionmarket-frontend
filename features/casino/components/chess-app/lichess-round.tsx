"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useChessMatch } from "@/features/casino/hooks/use-casino-chess";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import { fetchChessPlayerRatings } from "@/features/casino/lib/api/chess-ratings";
import type {
  ChessColor,
  ChessMatch,
  ChessPerfKey,
  ChessPlayer,
  ChessPlayerRatings,
} from "@/features/casino/lib/api/types";
import { dispatchLichessRoundAction } from "@/features/casino/lib/chess/lichess-round-actions";
import {
  canReloadLichessRound,
  lichessApiMoveForAppend,
  reloadInteractiveLichessRound,
  type LichessApiMove,
} from "@/features/casino/lib/chess/lichess-round-sync";
import { lichessRoundReviewRoute } from "@/features/casino/lib/chess/lichess-round-route";
import { createLichessSound, isLichessSound } from "@/features/casino/lib/chess/lichess-sound";
import {
  lichessCssPath,
  lichessEsmPath,
  lichessPublicAssetPath,
  lichessRoundStyles,
  resolveLichessPublicAssetPath,
} from "@/features/casino/lib/chess/lichess-assets";
import { LichessSpectatorChat } from "@/features/casino/components/chess-app/lichess-spectator-chat";
import { LichessSpectatorBetting } from "@/features/casino/components/chess-app/lichess-spectator-betting";
import { ChessGameOverModal } from "@/features/casino/components/chess-app/chess-game-over-modal";
import { countryFlag } from "@/features/casino/lib/chess/social";
import {
  CHESS_PLAY_ONLINE_ROUTE,
  chessGameOverEventKey,
  chessGameOverPresentation,
} from "@/features/casino/lib/chess/game-over";

type LichessColor = "white" | "black";

type RoundSeatRating = {
  rating: number;
  provisional: boolean;
};

type RoundSeatRatings = Partial<Record<LichessColor, RoundSeatRating>>;

type LichessController = {
  apiMove(move: LichessApiMove): true;
  data: Record<string, unknown>;
  ply: number;
  lastPly(): number;
  preventDrawOffer?: unknown;
  replaying(): boolean;
  reload(data: Record<string, unknown>): void;
  setLoading(value: boolean): void;
};

type LichessRoundModule = {
  initModule(options: Record<string, unknown>): Promise<LichessController>;
};

export type LichessPowertip = {
  watchMouse(): void;
  manualUser(element: HTMLElement): void;
  manualUserIn(parent: HTMLElement): void;
  dispose(): void;
  forcePlacementHook?: (element: HTMLElement) => string | undefined;
};

export const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

const ROUND_MODULE = "/compiled/round.KX7CDMD5.js?ark-spectator-betting=3";
const CASH_MODULE = "/chess/lichess/javascripts/vendor/cash.min.js";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function color(value: ChessColor): LichessColor {
  return value === "w" ? "white" : "black";
}

function opposite(value: LichessColor): LichessColor {
  return value === "white" ? "black" : "white";
}

function status(match: ChessMatch) {
  if (match.state === "awaiting_opponent") return { id: 10, name: "created" };
  if (match.state === "in_progress") return { id: 20, name: "started" };
  if (match.state === "cancelled") return { id: 25, name: "aborted" };
  switch (match.result?.kind) {
    case "checkmate":
      return { id: 30, name: "mate" };
    case "resignation":
      return { id: 31, name: "resign" };
    case "timeout":
      return { id: 35, name: "outoftime" };
    case "draw":
      return {
        id: match.result.reason === "stalemate" ? 32 : 34,
        name: match.result.reason === "stalemate" ? "stalemate" : "draw",
      };
    default:
      return { id: 38, name: "unknownFinish" };
  }
}

function speed(match: ChessMatch): Exclude<ChessPerfKey, "standard" | "ultraBullet"> {
  if (match.clockMode === "unlimited") return "classical";
  const minutes = Number.parseInt(match.timeControl.split("+")[0] ?? "10", 10);
  if (minutes <= 1) return "bullet";
  if (minutes <= 5) return "blitz";
  if (minutes <= 15) return "rapid";
  return "classical";
}

function winner(match: ChessMatch): LichessColor | undefined {
  if (!match.result || match.result.kind === "draw") return undefined;
  return color(match.result.winner);
}

function viewerId(match: ChessMatch, viewer: ChessColor | null): string | undefined {
  if (viewer === "w") return match.white?.id;
  if (viewer === "b") return match.black?.id;
  return undefined;
}

function playerName(name: string, countryCode: string | null | undefined): string {
  const flag = countryFlag(countryCode);
  return flag && !name.startsWith(flag) ? `${flag} ${name}` : name;
}

function playerData(
  player: ChessPlayer | null,
  side: LichessColor,
  match: ChessMatch,
  spectator: boolean,
  version: number,
  liveRating?: RoundSeatRating
) {
  const computer = match.computer?.side === side ? match.computer : null;
  const lobbyBot = computer?.bot === true;
  const plainName = (computer?.name ?? player?.username.trim()) || "Anonymous";
  const name = playerName(plainName, computer?.countryCode ?? player?.countryCode);
  const id = player?.id ?? `${match.id}-${side}`;
  return {
    id,
    name,
    color: side,
    spectator,
    ai: lobbyBot ? undefined : computer?.level,
    onGame: match.state === "in_progress",
    isGone: false,
    rating: computer ? (computer.rating ?? undefined) : (player?.rating ?? liveRating?.rating),
    provisional: computer ? false : (player?.provisional ?? liveRating?.provisional ?? false),
    offeringDraw: match.drawOffered === (side === "white" ? "w" : "b"),
    proposingTakeback: side === "white" ? match.takeback.white : match.takeback.black,
    version,
    user:
      computer && !lobbyBot
        ? undefined
        : {
            id,
            username: name,
            online: true,
            perfs: {},
          },
  };
}

function possibleMoves(match: ChessMatch): Record<string, string> | undefined {
  if (!match.round?.legalMoves.length) return undefined;
  const occupied = new Set<string>();
  const ranks = match.fen.split(" ", 1)[0]?.split("/") ?? [];
  for (const [rankIndex, rank] of ranks.entries()) {
    let fileIndex = 0;
    for (const value of rank) {
      const empty = Number.parseInt(value, 10);
      if (Number.isFinite(empty)) {
        fileIndex += empty;
      } else if (fileIndex < 8 && rankIndex < 8) {
        occupied.add(`${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`);
        fileIndex += 1;
      }
    }
  }
  const grouped = new Map<string, Set<string>>();
  for (const uci of match.round.legalMoves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) continue;
    const origin = uci.slice(0, 2);
    if (!occupied.has(origin)) continue;
    const destination = uci.slice(2, 4);
    const destinations = grouped.get(origin) ?? new Set<string>();
    destinations.add(destination);
    grouped.set(origin, destinations);
  }
  return Object.fromEntries(
    [...grouped].map(([origin, destinations]) => [origin, [...destinations].join("")])
  );
}

function roundSteps(match: ChessMatch) {
  const source = match.round?.steps ?? [];
  if (source.length) {
    return source.map((step) => ({
      ply: step.ply,
      fen: step.fen,
      san: step.san ?? "",
      uci: step.uci ?? "",
      check: step.check,
    }));
  }
  return [
    {
      ply: match.moves.length,
      fen: match.fen || match.initialFen || START_FEN,
      san: match.moves.at(-1) ?? "",
      uci: "",
      check: false,
    },
  ];
}

export function anchoredRoundClocks(
  match: ChessMatch,
  now: number = Date.now()
): Record<ChessColor, number> {
  if (match.state !== "in_progress" || match.clockMode !== "real_time") {
    return match.clocks;
  }
  const updatedAt = Date.parse(match.clockUpdatedAt);
  const elapsed = Number.isFinite(updatedAt) ? Math.max(0, (now - updatedAt) / 1_000) : 0;
  return {
    ...match.clocks,
    [match.turn]: Math.max(0, match.clocks[match.turn] - elapsed),
  };
}

export function roundData(
  match: ChessMatch,
  viewer: ChessColor | null,
  proxy?: Record<string, unknown>,
  ratings: RoundSeatRatings = {}
): Record<string, unknown> {
  const viewerColor = viewer ? color(viewer) : "white";
  const spectator = viewer === null;
  const player = viewerColor === "white" ? match.white : match.black;
  const opponentColor = opposite(viewerColor);
  const opponent = opponentColor === "white" ? match.white : match.black;
  const initial = Number.parseInt(match.timeControl.split("+")[0] ?? "10", 10) * 60;
  const increment = Number.parseInt(match.timeControl.split("+")[1] ?? "0", 10);
  const state = status(match);
  const steps = roundSteps(match);
  const currentStep = steps.at(-1)!;
  const currentPly = currentStep.ply;
  const currentTurn: LichessColor = currentPly % 2 === 0 ? "white" : "black";
  const isAuthoritativePosition = currentStep.fen === match.fen;
  const clocks = anchoredRoundClocks(match);

  return {
    game: {
      id: match.id,
      status: state,
      player: currentTurn,
      turns: currentPly,
      fen: currentStep.fen,
      initialFen: match.initialFen === START_FEN ? undefined : match.initialFen,
      source: match.computer ? "ai" : "friend",
      speed: speed(match),
      perf: speed(match),
      variant: {
        key: match.variant,
        name: match.variant === "standard" ? "Standard" : match.variant,
        short: match.variant === "standard" ? "Std" : match.variant,
      },
      winner: winner(match),
      rated: match.rating?.rated ?? false,
      rematch: match.rematch.nextMatchId ?? undefined,
      threefold: match.result?.kind === "draw" && match.result.reason === "repetition",
      fiftyMoves: match.result?.kind === "draw" && match.result.reason === "fifty_move_rule",
    },
    local: proxy,
    player: playerData(player, viewerColor, match, spectator, currentPly, ratings[viewerColor]),
    opponent: playerData(
      opponent,
      opponentColor,
      match,
      spectator,
      currentPly,
      ratings[opponentColor]
    ),
    takebackable: match.takeback.takebackable,
    moretimeable: false,
    possibleMoves:
      isAuthoritativePosition &&
      viewer !== null &&
      color(viewer) === currentTurn &&
      match.state === "in_progress"
        ? possibleMoves(match)
        : undefined,
    steps,
    clock:
      match.clockMode === "real_time"
        ? {
            running: match.state === "in_progress",
            initial: Number.isFinite(initial) ? initial : 600,
            increment: Number.isFinite(increment) ? increment : 0,
            moretime: 0,
            white: clocks.w,
            black: clocks.b,
          }
        : undefined,
    pref: {
      animationDuration: 200,
      autoQueen: 2,
      blindfold: false,
      clockBar: true,
      clockSound: true,
      clockTenths: 1,
      confirmResign: true,
      coords: 1,
      destination: true,
      enablePremove: true,
      highlight: true,
      is3d: false,
      keyboardMove: false,
      // Voice input is opt-in upstream. Forcing it on loads an unnecessary
      // grammar module and lets malformed/stale move hints crash the board.
      voiceMove: false,
      moveEvent: 2,
      ratings: true,
      replay: 2,
      rookCastle: true,
      showCaptured: true,
      submitMove: false,
      resizeHandle: 1,
    },
  };
}

function ratingForRound(
  ratings: ChessPlayerRatings | undefined,
  match: ChessMatch | undefined
): RoundSeatRating | undefined {
  if (!ratings || !match) return undefined;
  const perf =
    ratings.items.find((item) => item.perfKey === speed(match)) ??
    ratings.items.find((item) => item.perfKey === "standard");
  return perf ? { rating: perf.rating, provisional: perf.provisional } : undefined;
}

function syncMetaPlayer(
  host: HTMLElement,
  side: LichessColor,
  match: ChessMatch,
  liveRating?: RoundSeatRating
): void {
  const player = side === "white" ? match.white : match.black;
  const computer = match.computer?.side === side ? match.computer : null;
  const plainName = (computer?.name ?? player?.username.trim()) || "Anonymous";
  const name = playerName(plainName, computer?.countryCode ?? player?.countryCode);
  const link = host.querySelector<HTMLElement>(`.game__meta__players .player.${side} .user-link`);
  if (!link) return;

  link.replaceChildren(document.createTextNode(name));
  const rating = computer
    ? computer.rating != null
      ? { rating: computer.rating, provisional: false }
      : undefined
    : player?.rating != null
      ? { rating: player.rating, provisional: player.provisional ?? false }
      : liveRating;
  if (!rating) return;

  const wrapper = document.createElement("span");
  wrapper.className = "rating";
  wrapper.append(" (");
  const value = document.createElement("abbr");
  if (rating.provisional) value.title = "Provisional rating";
  value.textContent = `${rating.rating}${rating.provisional ? "?" : ""}`;
  wrapper.append(value, ")");
  link.append(wrapper);
}

function syncRoundMetaPlayers(
  host: HTMLElement,
  match: ChessMatch,
  ratings: RoundSeatRatings
): void {
  syncMetaPlayer(host, "white", match, ratings.white);
  syncMetaPlayer(host, "black", match, ratings.black);
}

function roundRevision(data: Record<string, unknown>): string {
  const { local: _local, ...serializable } = data;
  return JSON.stringify(serializable);
}

function hasCurrentRoundPosition(match: ChessMatch): boolean {
  const last = match.round?.steps.at(-1);
  return !!last && last.ply === match.moves.length && last.fen === match.fen;
}

function waitForAsset(
  element: HTMLLinkElement | HTMLScriptElement,
  source: string,
  loaded: () => boolean
): Promise<void> {
  if (element.dataset.lichessLoaded === "true" || loaded()) {
    element.dataset.lichessLoaded = "true";
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      element.dataset.lichessLoaded = "true";
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Unable to load ${source}`));
    };
    const cleanup = () => {
      element.removeEventListener("load", onLoad);
      element.removeEventListener("error", onError);
    };
    element.addEventListener("load", onLoad, { once: true });
    element.addEventListener("error", onError, { once: true });
  });
}

export function loadLichessStyle(href: string): Promise<void> {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  if (existing) return waitForAsset(existing, href, () => existing.sheet !== null);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.lichessRound = "true";
  const ready = waitForAsset(link, href, () => link.sheet !== null);
  document.head.append(link);
  return ready;
}

export function loadLichessScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) return waitForAsset(existing, src, () => typeof (window as any).$ === "function");
  const script = document.createElement("script");
  script.src = src;
  script.dataset.lichessRound = "true";
  const ready = waitForAsset(script, src, () => typeof (window as any).$ === "function");
  document.head.append(script);
  return ready;
}

function createRoundPowertip(host: HTMLElement): LichessPowertip {
  let watching = false;
  let active: HTMLElement | null = null;
  let tip: HTMLDivElement | null = null;

  const hide = () => {
    active = null;
    if (!tip) return;
    tip.style.visibility = "hidden";
    tip.style.left = "-9999px";
    tip.style.top = "-9999px";
  };

  const show = (element: HTMLElement) => {
    if (!host.contains(element)) return;
    const name = element.textContent?.trim();
    if (!name) return;
    const rating = element.closest(".ruser")?.querySelector("rating")?.textContent?.trim();
    active = element;
    tip ??= (() => {
      const node = document.createElement("div");
      node.id = "powerTip";
      node.dataset.roundPowertip = "true";
      node.style.width = "auto";
      node.style.minHeight = "0";
      node.style.maxWidth = "min(21rem, calc(100vw - 2rem))";
      node.style.padding = "0";
      node.style.borderRadius = "0.35rem";
      node.style.pointerEvents = "none";
      node.style.whiteSpace = "nowrap";
      document.body.append(node);
      return node;
    })();
    tip.replaceChildren();
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "0.5rem";
    header.style.padding = "0.6rem 0.75rem";
    const signal = document.createElement("span");
    signal.style.width = "0.7rem";
    signal.style.height = "0.7rem";
    signal.style.borderRadius = "50%";
    signal.style.background = "#629924";
    const label = document.createElement("strong");
    label.textContent = name;
    header.append(signal, label);
    if (rating) {
      const value = document.createElement("span");
      value.textContent = rating;
      value.style.marginLeft = "auto";
      value.style.color = "#aaa";
      header.append(value);
    }
    tip.append(header);
    if (rating) {
      const detail = document.createElement("div");
      detail.style.padding = "0.5rem 0.75rem";
      detail.style.borderTop = "1px solid rgba(255, 255, 255, 0.1)";
      detail.style.color = "#aaa";
      detail.textContent = `${rating} chess rating`;
      tip.append(detail);
    }
    tip.style.visibility = "hidden";
    const rect = element.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const preferredBelow = element.dataset.ptPos === "s";
    const left = Math.min(
      window.scrollX + window.innerWidth - tipRect.width - 8,
      Math.max(window.scrollX + 8, window.scrollX + rect.left + rect.width / 2 - tipRect.width / 2)
    );
    const top = preferredBelow
      ? window.scrollY + rect.bottom + 10
      : window.scrollY + rect.top - tipRect.height - 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(window.scrollY + 8, top)}px`;
    tip.style.visibility = "visible";
  };

  const onMouseOver = (event: MouseEvent) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(".ulpt") : null;
    if (target && target !== active) show(target);
  };
  const onMouseOut = (event: MouseEvent) => {
    if (!active) return;
    const related = event.relatedTarget;
    if (related instanceof Node && active.contains(related)) return;
    const target = event.target;
    if (target instanceof Node && active.contains(target)) hide();
  };

  const watchMouse = () => {
    if (watching) return;
    watching = true;
    host.addEventListener("mouseover", onMouseOver);
    host.addEventListener("mouseout", onMouseOut);
  };

  return {
    watchMouse,
    manualUser: show,
    manualUserIn() {
      watchMouse();
    },
    dispose() {
      host.removeEventListener("mouseover", onMouseOver);
      host.removeEventListener("mouseout", onMouseOut);
      tip?.remove();
      tip = null;
      active = null;
      watching = false;
    },
  };
}

function words(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function format(key: string, values: unknown[]): string {
  if (key === "aiNameLevelAiLevel") return `${values[0]} level ${values[1]}`;
  if (key === "giveNbSeconds") return `Give ${values[0]} seconds`;
  if (key === "nbSeconds") return `${values[0]} seconds`;
  return [words(key), ...values].join(" ");
}

const LICHESS_BODY_CLASSES = [
  "dark",
  "coords-in",
  "simple-board",
  "fixed-scroll",
  "zenable",
  "playing",
] as const;
const LICHESS_BODY_ATTRIBUTES = [
  "data-user",
  "data-board",
  "data-piece-set",
  "data-sound-set",
  "data-socket-domains",
] as const;
const LICHESS_PIECE_PROPERTIES = ["white", "black"].flatMap((side) =>
  ["pawn", "knight", "bishop", "rook", "queen", "king"].map((role) => `---${side}-${role}`)
);

type StylePropertySnapshot = {
  name: string;
  priority: string;
  value: string;
};

function stylePropertySnapshot(style: CSSStyleDeclaration, name: string): StylePropertySnapshot {
  return {
    name,
    priority: style.getPropertyPriority(name),
    value: style.getPropertyValue(name),
  };
}

function restoreStyleProperty(style: CSSStyleDeclaration, snapshot: StylePropertySnapshot) {
  if (snapshot.value) {
    style.setProperty(snapshot.name, snapshot.value, snapshot.priority);
  } else {
    style.removeProperty(snapshot.name);
  }
}

export function installLichessDocumentState(userId: string | undefined): () => void {
  const body = document.body;
  const root = document.documentElement;
  const bodyClasses = new Map(
    LICHESS_BODY_CLASSES.map((className) => [className, body.classList.contains(className)])
  );
  const rootHadDark = root.classList.contains("dark");
  const bodyAttributes = new Map(
    LICHESS_BODY_ATTRIBUTES.map((name) => [name, body.getAttribute(name)])
  );
  const bodyZoom = stylePropertySnapshot(body.style, "---zoom");
  const rootPieces = LICHESS_PIECE_PROPERTIES.map((name) =>
    stylePropertySnapshot(root.style, name)
  );

  if (userId) body.dataset.user = userId;
  else delete body.dataset.user;
  body.dataset.board = "brown";
  body.dataset.pieceSet = "cburnett";
  body.dataset.soundSet ||= "standard";
  body.dataset.socketDomains ||= window.location.host;
  root.classList.add("dark");
  body.classList.add("dark", "coords-in", "simple-board", "fixed-scroll", "zenable");
  body.classList.toggle("playing", userId !== undefined);
  body.style.setProperty("---zoom", "80");

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [className, wasPresent] of bodyClasses) {
      body.classList.toggle(className, wasPresent);
    }
    root.classList.toggle("dark", rootHadDark);
    for (const [name, value] of bodyAttributes) {
      if (value === null) body.removeAttribute(name);
      else body.setAttribute(name, value);
    }
    restoreStyleProperty(body.style, bodyZoom);
    for (const snapshot of rootPieces) restoreStyleProperty(root.style, snapshot);
  };
}

export function installLichessRuntime(
  userId: string | undefined,
  powertip: LichessPowertip
): () => void {
  const global: any = window;
  const restoreDocument = installLichessDocumentState(userId);

  if (!document.getElementById("favicon")) {
    const favicon = document.createElement("link");
    favicon.id = "favicon";
    favicon.rel = "icon";
    favicon.href = "/assets/logo/lichess-favicon.svg";
    document.head.append(favicon);
  }

  const root = document.documentElement.style;
  if (!document.getElementById("lichess-font-face")) {
    const fontFace = document.createElement("style");
    fontFace.id = "lichess-font-face";
    fontFace.textContent = `@font-face{font-family:lichess;font-display:block;src:url('${lichessPublicAssetPath(
      "font/lichess.woff2"
    )}') format('woff2')}`;
    document.head.append(fontFace);
  }
  for (const side of ["white", "black"] as const) {
    const prefix = side === "white" ? "w" : "b";
    for (const [role, piece] of [
      ["pawn", "P"],
      ["knight", "N"],
      ["bishop", "B"],
      ["rook", "R"],
      ["queen", "Q"],
      ["king", "K"],
    ] as const) {
      root.setProperty(
        `---${side}-${role}`,
        `url(${lichessPublicAssetPath(`piece/cburnett/${prefix}${piece}.svg`)})`
      );
    }
  }

  const site = (global.site ??= {});
  const lichess = (global.lichess ??= {});
  lichess.overrides ??= {};
  site.debug ??= false;
  site.info ??= { commit: "ark", message: "", date: "" };
  site.sri ??= global.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  site.displayLocale ??= navigator.language;
  site.load ??= Promise.resolve();
  site.quantity ??= (value: number) => (value === 1 ? "one" : "other");
  site.announce ??= () => undefined;
  site.asset = {
    baseUrl: () => window.location.origin,
    loadPieces: Promise.resolve(),
    url: (path: string, options: { documentOrigin?: boolean; pathOnly?: boolean } = {}) =>
      options.documentOrigin || options.pathOnly
        ? resolveLichessPublicAssetPath(path)
        : lichessPublicAssetPath(path),
    flairSrc: (flair: string) => lichessPublicAssetPath(`flair/img/${flair}.webp`),
    fideFedSrc: (fed: string) => lichessPublicAssetPath(`fide/fed/${fed}.svg`),
    loadCss: (href: string) => loadLichessStyle(`/${href.replace(/^\//, "")}`),
    loadCssPath: (key: string) => loadLichessStyle(lichessCssPath(key)),
    removeCss: (href: string) => {
      document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)?.remove();
    },
    removeCssPath: (key: string) => {
      const href = lichessCssPath(key);
      document.querySelector<HTMLLinkElement>(`link[href="${href}"]`)?.remove();
    },
    jsModule: (name: string) => `/compiled/${name}.js`,
    loadIife: (path: string) => loadLichessScript(`/${path.replace(/^\//, "")}`),
    loadI18n: async () => undefined,
    loadEsm: async (key: string, options: { init?: unknown; npm?: boolean } = {}) => {
      const source = lichessEsmPath(key);
      if (!source) return undefined;
      const module = (await import(/* webpackIgnore: true */ source)) as {
        default?: (value?: unknown) => unknown;
        initModule?: (value?: unknown) => unknown;
      };
      const initializer = module.initModule ?? module.default;
      if (!initializer) return module;
      return options.npm && options.init === undefined ? initializer : initializer(options.init);
    },
  };
  site.blindMode = false;
  site.quietMode = false;
  site.unload = site.unload ?? { expected: false };
  site.reload = () => window.location.reload();
  site.redirect = (url: string) => window.location.assign(url);
  if (!site.mousetrap) {
    const mousetrap = {
      bind() {
        return mousetrap;
      },
      unbind() {
        return mousetrap;
      },
    };
    site.mousetrap = mousetrap;
  }
  site.powertip = powertip;
  if (!isLichessSound(site.sound)) site.sound = createLichessSound();

  const formatted = new Set([
    "aiNameLevelAiLevel",
    "giveNbSeconds",
    "nbSeconds",
    "opponentLeftCounter",
    "nbSecondsToPlayTheFirstMove",
    "averageRatingX",
    "masterDbExplanation",
    "xOpeningExplorer",
    "mateInXHalfMoves",
    "andSaveNbPremoveLines",
    "playX",
    "bestWasX",
    "xWasPlayed",
    "chess960StartPosition",
    "thereAreNoResultsForX",
    "depthX",
    "numberInaccuracies",
    "numberMistakes",
    "numberBlunders",
    "progressX",
    "stageX",
    "stageXComplete",
    "nextX",
  ]);
  const siteI18n = new Proxy(
    {},
    {
      get(_target, property) {
        const key = String(property);
        if (!formatted.has(key)) return words(key);
        const fn = (...values: unknown[]) => format(key, values);
        fn.asArray = (...values: unknown[]) => {
          const content = values.at(-1);
          if (key === "numberInaccuracies") return [content, " Inaccuracies"];
          if (key === "numberMistakes") return [content, " Mistakes"];
          if (key === "numberBlunders") return [content, " Blunders"];
          if (key === "xWasPlayed") return [values[0], " was played"];
          if (key === "bestWasX") return ["Best was ", values[0]];
          return [format(key, values)];
        };
        return fn;
      },
    }
  );
  global.i18n = global.i18n ?? {};
  global.i18n.site = siteI18n;
  global.i18n.learn = siteI18n;
  global.i18n.study = siteI18n;
  global.i18n.preferences = siteI18n;
  const translated = (
    text: string | ((values: unknown[]) => string),
    array?: (values: unknown[]) => unknown[]
  ) => {
    const fn = (...values: unknown[]) => (typeof text === "function" ? text(values) : text);
    fn.asArray = (...values: unknown[]) => array?.(values) ?? [fn(...values)];
    return fn;
  };
  global.i18n.puzzle = {
    addAnotherTheme: "Add another theme",
    bestMove: "Best move!",
    continueTraining: "Continue training",
    dailyPuzzle: "Daily puzzle",
    didYouLikeThisPuzzle: "Did you like this puzzle?",
    difficultyLevel: "Difficulty level",
    downVote: "Downvote",
    easiest: "Easiest",
    easier: "Easier",
    example: "Example",
    failed: "Puzzle failed",
    findTheBestMoveForBlack: "Find the best move for black.",
    findTheBestMoveForWhite: "Find the best move for white.",
    fromGameLink: translated("From game", (values) => ["From game ", values.at(-1)]),
    goodMove: "Good move",
    hidden: "hidden",
    jumpToNextPuzzleImmediately: "Jump to next puzzle immediately",
    keepGoing: "Keep going…",
    nbPointsAboveYourPuzzleRating: translated(
      (values) => `${values[0]} points above your puzzle rating`
    ),
    nbPointsBelowYourPuzzleRating: translated(
      (values) => `${values[0]} points below your puzzle rating`
    ),
    newStreak: "New streak",
    normal: "Normal",
    notTheMove: "Not the move!",
    playedXTimes: translated("Played", (values) => ["Played ", values.at(-1), " times"]),
    puzzleComplete: "Puzzle complete!",
    puzzleId: translated("Puzzle", (values) => ["Puzzle ", values.at(-1)]),
    puzzleSuccess: "Puzzle complete!",
    ratingX: translated("Rating", (values) => ["Rating ", values.at(-1)]),
    streakDescription: "How many puzzles can you solve in a row?",
    streakSkipExplanation: "You can skip this puzzle",
    harder: "Harder",
    hardest: "Hardest",
    toGetPersonalizedPuzzles: "Sign in to get personalized puzzles.",
    trySomethingElse: "Try something else.",
    upVote: "Upvote",
    yourPuzzleRatingWillNotChange: "Your puzzle rating will not change.",
    yourStreakX: translated("Your streak", (values) => ["Your streak: ", values.at(-1)]),
  };
  global.i18n.puzzleTheme = new Proxy(
    { mix: "Healthy mix", mixDescription: "A little bit of everything." },
    {
      get(target, property) {
        const key = String(property);
        return target[key as keyof typeof target] ?? words(key.replace(/Description$/u, ""));
      },
      has: () => true,
    }
  );
  global.i18n.storm = siteI18n;
  return restoreDocument;
}

export function LichessRound({
  matchId,
  seatName,
  forceSpectator = false,
}: {
  matchId: string;
  seatName: string | null;
  forceSpectator?: boolean;
}) {
  const tGameOver = useTranslations("casino.chess.gameOver");
  const router = useRouter();
  const loadedRound = useChessMatch(matchId, seatName);
  const isSpectator = forceSpectator || (!!loadedRound.match && loadedRound.you === null);
  const round = isSpectator ? { ...loadedRound, you: null } : loadedRound;
  const whitePlayer =
    round.match?.computer?.side === "white" ? null : (round.match?.white?.id ?? null);
  const blackPlayer =
    round.match?.computer?.side === "black" ? null : (round.match?.black?.id ?? null);
  const whiteRatings = useQuery({
    queryKey: ["casino", "chess", "ratings", whitePlayer ?? "none"],
    queryFn: () => fetchChessPlayerRatings(whitePlayer as string),
    enabled: !!whitePlayer,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const blackRatings = useQuery({
    queryKey: ["casino", "chess", "ratings", blackPlayer ?? "none"],
    queryFn: () => fetchChessPlayerRatings(blackPlayer as string),
    enabled: !!blackPlayer,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const seatRatings: RoundSeatRatings = {
    white: ratingForRound(whiteRatings.data, round.match),
    black: ratingForRound(blackRatings.data, round.match),
  };
  const [shellHtml, setShellHtml] = useState<string | null>(null);
  const [shellError, setShellError] = useState<Error | null>(null);
  const [spectatorChatMount, setSpectatorChatMount] = useState<HTMLElement | null>(null);
  const [spectatorBettingMount, setSpectatorBettingMount] = useState<HTMLElement | null>(null);
  const [gameOverModal, setGameOverModal] = useState<{
    eventKey: string;
    celebrate: boolean;
    announce: boolean;
  } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LichessController | null>(null);
  const proxyRef = useRef<Record<string, any> | null>(null);
  const appliedRevisionRef = useRef<string | null>(null);
  const observedMatchIdRef = useRef<string | null>(null);
  const handledResultRef = useRef<string | null>(null);
  const sawLiveGameRef = useRef(false);
  const seatRatingsRef = useRef(seatRatings);
  seatRatingsRef.current = seatRatings;
  const roundRef = useRef(round);
  roundRef.current = round;
  const roundReady = !!round.match && hasCurrentRoundPosition(round.match);
  const controllerBootstrapReady = controllerRef.current !== null || roundReady;

  useEffect(() => {
    const match = round.match;
    if (!match) return;
    if (observedMatchIdRef.current !== match.id) {
      observedMatchIdRef.current = match.id;
      handledResultRef.current = null;
      sawLiveGameRef.current = false;
      setGameOverModal(null);
    }
    if (match.state === "in_progress") {
      sawLiveGameRef.current = true;
      return;
    }
    const terminal = match.state === "settled" || match.state === "cancelled";
    if (!terminal || (match.state === "settled" && !match.result)) return;

    const eventKey = chessGameOverEventKey(match);
    if (handledResultRef.current === eventKey) return;
    handledResultRef.current = eventKey;
    const announce = sawLiveGameRef.current;
    const presentation = chessGameOverPresentation(match, round.you);
    let celebrate = announce && presentation.outcome === "win";
    if (celebrate) {
      try {
        const storageKey = `ark-chess-celebrated:${eventKey}`;
        if (window.sessionStorage.getItem(storageKey)) celebrate = false;
        else window.sessionStorage.setItem(storageKey, "1");
      } catch {
        // Storage privacy settings should not suppress the result itself.
      }
    }
    sawLiveGameRef.current = false;
    setGameOverModal({ eventKey, celebrate, announce });
  }, [round.match, round.you]);

  useEffect(() => {
    const abort = new AbortController();
    setShellHtml(null);
    setShellError(null);
    void fetch(`/api/chess/round/${encodeURIComponent(matchId)}/view`, {
      cache: "no-store",
      headers: { accept: "text/html" },
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load round view (${response.status})`);
        return response.text();
      })
      .then(setShellHtml)
      .catch((error: unknown) => {
        if (!abort.signal.aborted) {
          setShellError(error instanceof Error ? error : new Error("Unable to load round view"));
        }
      });
    return () => abort.abort();
  }, [matchId]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!shellHtml) {
      setSpectatorChatMount(null);
      setSpectatorBettingMount(null);
      host.replaceChildren();
      return;
    }

    // Snabbdom and Chessground own this subtree after initialization. Keeping
    // it outside React's child reconciliation prevents a query rerender from
    // replacing the live board with the inert server-rendered preload shell.
    host.innerHTML = shellHtml;
    setSpectatorBettingMount(null);
    const spectatorChat = host.querySelector<HTMLElement>("[data-ark-spectator-chat]");
    if (spectatorChat) spectatorChat.hidden = !isSpectator;
    setSpectatorChatMount(
      isSpectator ? host.querySelector<HTMLElement>("[data-ark-spectator-chat-content]") : null
    );
    return () => host.replaceChildren();
  }, [isSpectator, matchId, shellHtml]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shellHtml || !round.match) return;
    syncRoundMetaPlayers(host, round.match, seatRatingsRef.current);
  }, [blackRatings.data, round.match, shellHtml, whiteRatings.data]);

  useEffect(() => {
    const initialRound = roundRef.current;
    if (
      !initialRound.match ||
      !hasCurrentRoundPosition(initialRound.match) ||
      !shellHtml ||
      !hostRef.current?.querySelector(".round__app") ||
      controllerRef.current
    )
      return;
    let cancelled = false;
    let powertip: LichessPowertip | null = null;
    let restoreRuntime: (() => void) | null = null;
    const actionsInFlight = new Set<string>();
    const host = hostRef.current;
    if (host) {
      host.dataset.roundPhase = "loading-assets";
      host.dataset.roundViewer = initialRound.you ?? "spectator";
    }

    const routeAnalysisLink = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      const href = anchor?.getAttribute("href");
      if (!href) return;
      const route = lichessRoundReviewRoute(href, matchId, controllerRef.current?.ply ?? 0);
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      router.push(route);
    };
    host?.addEventListener("click", routeAnalysisLink, true);

    const runAction = (
      type: string,
      payload?: { u?: unknown; role?: unknown; pos?: unknown },
      loading = false
    ) => {
      if (actionsInFlight.has(type)) return;
      actionsInFlight.add(type);
      const controller = controllerRef.current;
      if (loading) controller?.setLoading(true);
      void dispatchLichessRoundAction(type, payload, roundRef.current)
        .then((handled) => {
          if (!handled) console.warn(`Unsupported Lichess round action: ${type}`);
        })
        .catch((error: unknown) => {
          console.error(`Lichess round action failed: ${type}`, error);
          const current = roundRef.current;
          const activeController = controllerRef.current;
          if (!current.match || !activeController) return;
          const data = roundData(current.match, current.you, proxy, seatRatingsRef.current);
          proxy.data = data;
          if (canReloadLichessRound(activeController, data)) {
            reloadInteractiveLichessRound(activeController, data);
          }
        })
        .finally(() => {
          actionsInFlight.delete(type);
          if (loading) controllerRef.current?.setLoading(false);
        });
    };

    const proxy: Record<string, any> = {
      data: {},
      handlers: {},
      send(type: string, payload?: { u?: unknown; role?: unknown; pos?: unknown }) {
        runAction(type, payload);
      },
      sendLoading(type: string, payload?: { u?: unknown; role?: unknown; pos?: unknown }) {
        runAction(type, payload, true);
      },
      receive() {
        return true;
      },
      moreTime() {},
      // useChessMatch owns the single authoritative timeout claim. The copied
      // Lichess clock invokes this callback on every expired-clock redraw,
      // which otherwise floods the API and starves chat and rating requests.
      outoftime() {},
      berserk() {},
      reload() {
        window.location.reload();
      },
      analyse() {
        router.push(`/casino/chess/review?match=${matchId}`);
      },
      newOpponent() {
        router.push(CHESS_PLAY_ONLINE_ROUTE);
      },
    };
    proxyRef.current = proxy;
    proxy.data = roundData(initialRound.match, initialRound.you, proxy, seatRatingsRef.current);

    void (async () => {
      try {
        await Promise.all([
          ...lichessRoundStyles.map((href) => loadLichessStyle(href)),
          loadLichessScript(CASH_MODULE),
        ]);
        if (cancelled) return;
        const activeRound = roundRef.current;
        if (!activeRound.match) return;
        if (host) host.dataset.roundPhase = "loading-module";
        powertip = createRoundPowertip(host);
        powertip.watchMouse();
        const activeViewerId = viewerId(activeRound.match, activeRound.you);
        restoreRuntime = installLichessRuntime(activeViewerId, powertip);
        const module = (await import(/* webpackIgnore: true */ ROUND_MODULE)) as LichessRoundModule;
        if (cancelled) return;
        const element = hostRef.current?.querySelector<HTMLElement>(".round__app");
        if (!element?.isConnected) throw new Error("Round view was replaced during initialization");
        const data = roundData(activeRound.match, activeRound.you, proxy, seatRatingsRef.current);
        proxy.data = data;
        if (host) {
          host.dataset.roundPhase = "initializing";
          host.dataset.roundViewer = activeRound.you ?? "spectator";
        }
        const controller = await module.initModule({
          data,
          userId: activeViewerId,
          noab: true,
          element,
          onChange() {},
        });
        if (activeRound.match.computer) controller.preventDrawOffer = true;
        // `data.local` bypasses Lichess's own WebSocket boot, but Ark games are
        // still authoritative remote rounds. Restore normal replay semantics so
        // browsing history disables moves until the user returns to the latest ply.
        controller.replaying = () => controller.ply !== controller.lastPly();
        // The local proxy bypasses Lichess's own socket bootstrap. Hide it only
        // while Chessground binds hooks so move sounds and en passant remain live.
        reloadInteractiveLichessRound(controller, data);
        controllerRef.current = controller;
        appliedRevisionRef.current = roundRevision(data);
        if (isSpectator && host) {
          let bettingShell = host.querySelector<HTMLElement>("[data-ark-spectator-betting]");
          let bettingContent = bettingShell?.querySelector<HTMLElement>(
            "[data-ark-spectator-betting-content]"
          );
          if (!bettingShell || !bettingContent) {
            bettingShell = document.createElement("section");
            bettingShell.className = "round__betting";
            bettingShell.dataset.arkSpectatorBetting = "true";
            bettingShell.dataset.matchId = matchId;
            bettingContent = document.createElement("div");
            bettingContent.dataset.arkSpectatorBettingContent = "true";
            bettingShell.append(bettingContent);
            host.querySelector(".round")?.append(bettingShell);
          }
          let bettingSlot = host.querySelector<HTMLElement>("[data-ark-spectator-betting-slot]");
          if (!bettingSlot) {
            bettingSlot = document.createElement("div");
            bettingSlot.className = "round__app__betting";
            bettingSlot.dataset.arkSpectatorBettingSlot = "true";
            element.append(bettingSlot);
          }
          if (bettingShell && bettingContent && bettingSlot) {
            bettingShell.hidden = false;
            bettingSlot.classList.add("is-active");
            bettingSlot.replaceChildren(bettingShell);
            setSpectatorBettingMount(bettingContent);
          }
        }
        if (host) host.dataset.roundPhase = "ready";
      } catch (error) {
        if (cancelled) return;
        if (host) host.dataset.roundPhase = "error";
        setShellError(error instanceof Error ? error : new Error("Unable to initialize round"));
      }
    })();

    return () => {
      cancelled = true;
      host?.removeEventListener("click", routeAnalysisLink, true);
      controllerRef.current = null;
      proxyRef.current = null;
      appliedRevisionRef.current = null;
      powertip?.dispose();
      restoreRuntime?.();
    };
  }, [controllerBootstrapReady, isSpectator, matchId, router, shellHtml]);

  useEffect(() => {
    const controller = controllerRef.current;
    const proxy = proxyRef.current;
    if (!controller || !proxy || !round.match) return;
    if (!hasCurrentRoundPosition(round.match)) return;
    const data = roundData(round.match, round.you, proxy, seatRatingsRef.current);
    const revision = roundRevision(data);
    if (revision === appliedRevisionRef.current) return;
    const move = lichessApiMoveForAppend(controller.data, data);
    if (move) {
      controller.apiMove(move);
      proxy.data = controller.data;
      appliedRevisionRef.current = revision;
      return;
    }
    if (!canReloadLichessRound(controller, data)) return;
    proxy.data = data;
    reloadInteractiveLichessRound(controller, data);
    appliedRevisionRef.current = revision;
  }, [blackRatings.data, round.match, round.you, whiteRatings.data]);

  if (round.error || shellError) {
    return <CasinoError error={round.error ?? shellError} subject="chess round" />;
  }

  const loading = round.isLoading || !shellHtml || !round.match;
  const terminal = round.match?.state === "settled" || round.match?.state === "cancelled";
  const resultEventKey = round.match ? chessGameOverEventKey(round.match) : null;
  const viewerPlayerId = round.match ? viewerId(round.match, round.you) : undefined;
  const viewerWallet =
    round.you === "w"
      ? round.match?.white?.walletAddress
      : round.you === "b"
        ? round.match?.black?.walletAddress
        : undefined;
  const offeredBy = round.match?.rematch.offeredBy?.toLowerCase() ?? null;
  const viewerRematchIds = [viewerPlayerId, viewerWallet]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase());
  const yourRematchOffer = offeredBy !== null && viewerRematchIds.includes(offeredBy);
  const rematchReadyId = round.match?.rematch.nextMatchId ?? null;
  const rematchLabel = round.match?.computer
    ? tGameOver("playAgain")
    : rematchReadyId
      ? tGameOver("openRematch")
      : yourRematchOffer
        ? tGameOver("rematchOffered")
        : offeredBy
          ? tGameOver("acceptRematch")
          : tGameOver("rematch");

  return (
    <>
      <div
        ref={hostRef}
        id="main-wrap"
        className="ws-chess-lichess-round-host"
        data-no-ripple-scope="true"
        aria-hidden={loading || undefined}
        style={{ display: loading ? "none" : undefined, marginTop: 0 }}
        suppressHydrationWarning
      />
      {loading ? <CasinoLoading label="Loading game" /> : null}
      {isSpectator && spectatorChatMount && round.match
        ? createPortal(<LichessSpectatorChat match={round.match} />, spectatorChatMount)
        : null}
      {isSpectator && spectatorBettingMount && round.match
        ? createPortal(<LichessSpectatorBetting match={round.match} />, spectatorBettingMount)
        : null}
      {round.match ? (
        <ChessGameOverModal
          match={round.match}
          viewer={round.you}
          open={gameOverModal?.eventKey === resultEventKey}
          celebrate={gameOverModal?.celebrate ?? false}
          announce={gameOverModal?.announce ?? false}
          rematching={round.requestingRematch}
          rematchLabel={rematchLabel}
          rematchDisabled={yourRematchOffer}
          anchorElement={hostRef.current?.querySelector(".cg-wrap")}
          onClose={() => setGameOverModal(null)}
          onOpen={
            terminal && resultEventKey
              ? () =>
                  setGameOverModal({ eventKey: resultEventKey, celebrate: false, announce: false })
              : undefined
          }
          onReview={() => {
            setGameOverModal(null);
            router.push(`/casino/chess/review?match=${encodeURIComponent(round.match!.id)}`);
          }}
          onNewGame={() => {
            setGameOverModal(null);
            router.push(CHESS_PLAY_ONLINE_ROUTE);
          }}
          onRematch={
            round.you && round.match.state === "settled"
              ? async () => {
                  if (round.match!.computer) {
                    setGameOverModal(null);
                    router.push(CHESS_PLAY_ONLINE_ROUTE);
                    return;
                  }
                  if (rematchReadyId) {
                    setGameOverModal(null);
                    router.push(
                      `/casino/chess/play?match=${encodeURIComponent(rematchReadyId)}`
                    );
                    return;
                  }
                  const next = await round.rematch();
                  if (next.rematch.nextMatchId) {
                    setGameOverModal(null);
                    router.push(
                      `/casino/chess/play?match=${encodeURIComponent(next.rematch.nextMatchId)}`
                    );
                  }
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
