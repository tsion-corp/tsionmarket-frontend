"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionWallet } from "@/components/providers/server-session";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  fetchMatch,
  fetchMatchAnalysis,
  fetchMatchMoves,
  fetchPgn,
  requestMatchAnalysis,
} from "@/features/casino/lib/api/chess";
import { CHESS_KEYS, useChessMatchSocial } from "@/features/casino/hooks/use-casino-chess";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import {
  buildLichessAnalysisData,
  describeChessMove,
  explainCoachComment,
} from "@/features/casino/lib/chess/lichess-analysis-data";
import {
  renderGameGif,
  renderPositionPng,
  type AnalysisExportFrame,
  type AnalysisExportOptions,
} from "@/features/casino/lib/chess/lichess-analysis-export";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import {
  installLichessRuntime,
  loadLichessScript,
  loadLichessStyle,
  type LichessPowertip,
} from "./lichess-round";

type AnalyseModule = {
  initModule(options: { mode: "replay"; cfg: Record<string, unknown> }): Promise<void>;
  destroyModule?(): void;
};

type LichessDialog = {
  view: HTMLElement;
  close(value?: string): void;
};

type LichessDialogAction = {
  selector: string;
  event?: string;
  listener(event: Event, dialog: LichessDialog): void;
};

type LichessDialogModule = {
  domDialog(options: {
    class?: string;
    modal: boolean;
    show: boolean;
    easyClose?: "clickOutside" | boolean;
    htmlText: string;
    attrs?: { dialog?: Record<string, string> };
    actions?: LichessDialogAction[];
  }): Promise<LichessDialog>;
};

type LichessPubsubModule = {
  pubsub: {
    complete(event: "polyfill.dialog", value?: undefined): void;
  };
};

const ANALYSE_CSS = "/css/analyse.round.7d845a1e.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";
const ANALYSE_MODULE = "/chess/lichess/js/analyse-ark.js?ark-coach=1";
const CASH_MODULE = "/chess/lichess/javascripts/vendor/cash.min.js";
const DIALOG_MODULE = "/compiled/lib.MYPIOGN5.js";
const PUBSUB_MODULE = "/compiled/lib.QPQZCXK2.js";
const DIALOG_CSS = "/chess/lichess/css/ark-analysis-dialog.css";
const COACH_CSS = "/chess/lichess/css/ark-analysis-coach.css";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resultText(match: Awaited<ReturnType<typeof fetchMatch>>): string {
  if (!match.result) return "Game in progress";
  if (match.result.kind === "draw") return `Draw by ${match.result.reason}`;
  const loser = match.result.winner === "w" ? "Black" : "White";
  const winner = match.result.winner === "w" ? "White" : "Black";
  if (match.result.kind === "resignation") return `${loser} resigned · ${winner} is victorious`;
  if (match.result.kind === "timeout") return `${loser} timed out · ${winner} is victorious`;
  return `${loser} is checkmated · ${winner} is victorious`;
}

function ratingText(value: number | null | undefined, provisional: boolean | null | undefined) {
  return value == null ? "" : ` (${value}${provisional ? "?" : ""})`;
}

function copyInput(value: string, extraClass = ""): string {
  return `<div class="copy-me ${extraClass}" data-ark-copy><input class="copy-me__target" spellcheck="false" readonly value="${escapeHtml(value)}"><button class="copy-me__button button button-metal" type="button" data-icon="&#xe070;" aria-label="Copy to clipboard"></button></div>`;
}

function copyLink(label: string, kind: string, extraClass = ""): string {
  return `<div class="copy-me ${extraClass}" data-ark-copy data-ark-copy-kind="${kind}"><a class="copy-me__target fetch-content" href="#" data-ark-export="${kind}">${escapeHtml(label)}</a><button class="copy-me__button button button-metal" type="button" data-icon="&#xe070;" aria-label="Copy to clipboard"></button></div>`;
}

function analysisShell(
  match: Awaited<ReturnType<typeof fetchMatch>>,
  moves: Awaited<ReturnType<typeof fetchMatchMoves>>,
  hasAnalysis: boolean,
  analysisStatus: string | null
): string {
  const white = escapeHtml(
    match.computer?.side === "white"
      ? `${match.computer.name} level ${match.computer.level}`
      : match.white?.username?.trim() || "Anonymous"
  );
  const black = escapeHtml(
    match.computer?.side === "black"
      ? `${match.computer.name} level ${match.computer.level}`
      : match.black?.username?.trim() || "Anonymous"
  );
  const whiteRating = escapeHtml(
    ratingText(match.rating?.white.rating, match.rating?.white.provisional)
  );
  const blackRating = escapeHtml(
    ratingText(match.rating?.black.rating, match.rating?.black.provisional)
  );
  const pgn = moves
    .map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${move.san}`)
    .join(" ");
  const requestLabel =
    analysisStatus === "queued" || analysisStatus === "running"
      ? "Computer analysis in progress"
      : "Request a computer analysis";
  const resultWinner =
    match.result && match.result.kind !== "draw" ? match.result.winner : null;
  const whiteScore = match.result?.kind === "draw" ? "½" : resultWinner === "w" ? "1" : "0";
  const blackScore = match.result?.kind === "draw" ? "½" : resultWinner === "b" ? "1" : "0";
  const analysisPanel = hasAnalysis
    ? `<div id="acpl-chart-container"><canvas id="acpl-chart"></canvas></div>`
    : `<form class="future-game-analysis" data-ark-analysis-request><button class="button text" type="submit"><span class="is3 text">${requestLabel}</span></button></form>`;

  return `<main class="analyse variant-${escapeHtml(match.variant)}">
    <aside class="analyse__side">
      <div class="game__meta">
        <section>
          <div class="game__meta__infos" data-icon="">
            <div class="header"><div class="setup">${escapeHtml(match.timeControl)} • ${match.rating?.rated ? "Rated" : "Casual"} • ${escapeHtml(match.rating?.perfKey ?? "Standard")}</div><time>just now</time></div>
          </div>
          <div class="game__meta__players">
            <div class="player color-icon is white text"><span class="user-link">${white}${whiteRating}</span></div>
            <div class="player color-icon is black text"><span class="user-link">${black}${blackRating}</span></div>
          </div>
        </section>
        <section class="status">${escapeHtml(resultText(match))}</section>
      </div>
    </aside>
    <div class="analyse__board main-board"><div class="cg-wrap"></div></div>
    <div class="analyse__tools"><div class="ceval"></div></div>
    <div class="analyse__controls"></div>
    <div class="analyse__underboard">
      <div role="tablist" class="analyse__underboard__menu">
        <button role="tab" class="computer-analysis" data-panel="computer-analysis">Computer analysis</button>
        <button role="tab" data-panel="move-times">Move times</button>
        <button role="tab" data-panel="ctable">Crosstable</button>
        <button role="tab" data-panel="fen-pgn">Share &amp; export</button>
      </div>
      <div class="analyse__underboard__panels">
        <div class="computer-analysis">${analysisPanel}</div>
        <div class="move-times"><div id="movetimes-chart-container"><canvas id="movetimes-chart"></canvas></div></div>
        <div class="fen-pgn">
          <div><strong>FEN</strong>${copyInput(match.fen, "analyse__underboard__fen")}</div>
          <div><strong>Image</strong><a class="text game-gif" href="#" data-icon="&#xe056;">Game as GIF</a>${copyLink("Screenshot current position", "position", "position-gif")}</div>
          <div><strong>Share</strong><a class="text embed-howto" href="#" data-icon="&#xe01b;">Embed in your website</a>${copyInput(`/casino/chess/review?match=${match.id}`)}</div>
          <div><strong>PGN</strong>${copyLink("Download annotated", "annotated")}${copyLink("Download raw", "raw")}</div>
          <div class="pgn">${escapeHtml(pgn)}</div>
        </div>
        <div class="ctable"><table><tbody><tr><td>${white}</td><td>${whiteScore}</td></tr><tr><td>${black}</td><td>${blackScore}</td></tr></tbody></table></div>
      </div>
    </div>
  </main>`;
}

type AnalysisMatch = Awaited<ReturnType<typeof fetchMatch>>;
type AnalysisMoves = Awaited<ReturnType<typeof fetchMatchMoves>>;
type CompletedAnalysis = NonNullable<Awaited<ReturnType<typeof fetchMatchAnalysis>>>;

type ArkAnalysisController = {
  node?: { fen?: string; uci?: string; ply?: number };
  bottomColor?: () => "white" | "black";
  chatCtrl?: {
    data: { lines: Array<{ u?: string; t: string; d: boolean }> };
    vm: { domVersion: number };
    visibleTabs: Array<{ key: string }>;
    setTab(tab: { key: string }): { key: string };
    redraw(): void;
    onMessage?: (line: { u?: string; t: string; d: boolean }) => void;
  };
};

type ArkAnalysisSound = {
  say(text: string, cut?: boolean, force?: boolean, translated?: boolean): boolean;
};

type ArkAnalysisWindow = typeof window & {
  site?: {
    analysis?: ArkAnalysisController;
    sound?: ArkAnalysisSound;
  };
};

const COACH_VOICE_STORAGE_KEY = "ark-chess-review-coach-voice";

const COACH_CLASSIFICATION = {
  best: { title: "Best move", badge: "★" },
  good: { title: "Good move", badge: "✓" },
  inaccuracy: { title: "Inaccuracy", badge: "?!" },
  mistake: { title: "Mistake", badge: "?" },
  blunder: { title: "Blunder", badge: "??" },
} as const;

function analysisController(): ArkAnalysisController | undefined {
  return (window as ArkAnalysisWindow).site?.analysis;
}

function selectChatTab(key: "discussion" | "note"): boolean {
  const chat = analysisController()?.chatCtrl;
  const tab = chat?.visibleTabs.find((candidate) => candidate.key === key);
  if (!chat || !tab) return false;
  chat.setTab(tab);
  chat.redraw();
  return true;
}

function actorLabel(author: string, match: AnalysisMatch): string {
  const normalized = author.toLowerCase();
  if (match.white?.walletAddress.toLowerCase() === normalized) return match.white.username;
  if (match.black?.walletAddress.toLowerCase() === normalized) return match.black.username;
  return /^0x[0-9a-f]{40}$/i.test(author) ? `${author.slice(0, 6)}...${author.slice(-4)}` : author;
}

function chatLines(
  messages: Array<{ author: string; text: string }>,
  match: AnalysisMatch
): Array<{ u: string; t: string; d: boolean }> {
  return messages.map((message) => ({
    u: actorLabel(message.author, match),
    t: message.text,
    d: false,
  }));
}

function resultToken(match: AnalysisMatch): string {
  if (!match.result) return "*";
  if (match.result.kind === "draw") return "1/2-1/2";
  return match.result.winner === "w" ? "1-0" : "0-1";
}

function annotatedPgn(
  base: string,
  match: AnalysisMatch,
  moves: AnalysisMoves,
  analysis: CompletedAnalysis | null
): string {
  if (!analysis?.moves.length) return base;
  const comments = new Map(analysis.moves.map((move) => [move.ply, move]));
  const movetext = moves
    .map((move, index) => {
      const analysed = comments.get(move.ply);
      const prefix = index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : "";
      const note = analysed?.coachComment
        ? ` {${analysed.classification}: ${analysed.coachComment.replaceAll(/[{}]/g, "")}}`
        : "";
      return `${prefix}${move.san}${note}`;
    })
    .join(" ");
  const headers = base.includes("\n\n") ? base.slice(0, base.indexOf("\n\n")) : "";
  return `${headers}${headers ? "\n\n" : ""}${movetext} ${resultToken(match)}\n`;
}

function displayedPgn(base: string, match: AnalysisMatch): string {
  const white = match.computer?.side === "white"
    ? `${match.computer.name} level ${match.computer.level}`
    : match.white?.username || "Anonymous";
  const black = match.computer?.side === "black"
    ? `${match.computer.name} level ${match.computer.level}`
    : match.black?.username || "Anonymous";
  return base
    .replace(/^\[Event "[^"]*"\]$/m, '[Event "Ark Chess"]')
    .replace(/^\[Site "[^"]*"\]$/m, '[Site "Ark"]')
    .replace(/^\[White "[^"]*"\]$/m, `[White "${white.replaceAll('"', "'")}"]`)
    .replace(/^\[Black "[^"]*"\]$/m, `[Black "${black.replaceAll('"', "'")}"]`);
}

function exportFrames(
  match: AnalysisMatch,
  moves: AnalysisMoves,
  analysis: CompletedAnalysis | null
): AnalysisExportFrame[] {
  const minutes = Number.parseFloat(match.timeControl.split("+")[0] ?? "10");
  const initial = Number.isFinite(minutes) ? minutes * 60 : null;
  let whiteClock = initial;
  let blackClock = initial;
  const classifications = new Map(
    (analysis?.moves ?? []).map((move) => [
      move.ply,
      move.classification === "blunder"
        ? "??"
        : move.classification === "mistake"
          ? "?"
          : move.classification === "inaccuracy"
            ? "?!"
            : move.classification === "best"
              ? "!"
              : "",
    ])
  );
  const frames: AnalysisExportFrame[] = [
    { fen: match.initialFen, whiteClock, blackClock },
  ];
  for (const move of moves) {
    if (move.clockMsRemaining !== null) {
      if (move.ply % 2 === 1) whiteClock = move.clockMsRemaining / 1000;
      else blackClock = move.clockMsRemaining / 1000;
    }
    frames.push({
      fen: move.fenAfter,
      uci: move.uci,
      annotation: classifications.get(move.ply),
      whiteClock,
      blackClock,
    });
  }
  return frames;
}

function exportOptions(match: AnalysisMatch, orientation: "white" | "black"): AnalysisExportOptions {
  return {
    orientation,
    whiteName:
      match.computer?.side === "white"
        ? `${match.computer.name} level ${match.computer.level}`
        : match.white?.username || "Anonymous",
    blackName:
      match.computer?.side === "black"
        ? `${match.computer.name} level ${match.computer.level}`
        : match.black?.username || "Anonymous",
    whiteRating: match.rating?.white.rating,
    blackRating: match.rating?.black.rating,
    players: true,
    ratings: true,
    glyphs: false,
    clocks: false,
  };
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function saveText(text: string, filename: string, type: string): void {
  saveBlob(new Blob([text], { type }), filename);
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard.");
}

async function openDialog(
  className: string,
  content: string,
  actions: LichessDialogAction[] = []
): Promise<void> {
  await loadLichessStyle(DIALOG_CSS);
  const [dialogModule, pubsubModule] = await Promise.all([
    import(/* webpackIgnore: true */ DIALOG_MODULE) as Promise<LichessDialogModule>,
    import(/* webpackIgnore: true */ PUBSUB_MODULE) as Promise<LichessPubsubModule>,
  ]);
  pubsubModule.pubsub.complete("polyfill.dialog");
  await dialogModule.domDialog({
    class: className,
    modal: true,
    show: true,
    easyClose: "clickOutside",
    attrs: { dialog: { class: "ark-analysis-dialog" } },
    htmlText: content,
    actions,
  });
}

function openEmbedDialog(
  matchId: string,
  orientation: "white" | "black",
  ply: number
): void {
  const source = `${window.location.origin}/casino/chess/embed?match=${encodeURIComponent(matchId)}&orientation=${orientation}#${ply}`;
  const iframe = `<iframe src="${source}"\nwidth="600" height="397" frameborder="0"></iframe>`;
  void openDialog(
    "embed-game",
    `<div><strong style="font-size:1.5em">Embed in your website</strong><br><br><pre>${escapeHtml(iframe)}</pre><br>${iframe}<br><br><a class="text" data-icon="&#xe05c;" href="/developers#embed-game">Read more about embedding games</a></div>`
  ).catch((error) => toast.error(friendlyError(error, "Couldn't open the embed dialog.")));
}

function openGifDialog(
  frames: AnalysisExportFrame[],
  initialOptions: AnalysisExportOptions,
  matchId: string
): void {
  const options = { ...initialOptions };
  let generated: Promise<Blob> | null = null;
  const generate = (dialog: LichessDialog) => {
    const progress = dialog.view.querySelector<HTMLElement>(".gif-progress");
    generated ??= renderGameGif(frames, options, (done, total) => {
      if (progress) progress.textContent = `Rendering frame ${done} of ${total}`;
    }).finally(() => {
      if (progress) progress.textContent = "";
    });
    return generated;
  };
  void openDialog(
    "gif-export",
    `<div class="gif-export-dialog"><strong style="font-size:1.5em">Game as GIF</strong><div class="gif-options"><button class="button button-empty text gif-flip" type="button" data-icon="&#xe01f;">${initialOptions.orientation}</button>${[
      ["players", "Player names"],
      ["ratings", "Show player ratings"],
      ["glyphs", "Move annotations"],
      ["clocks", "Chess clock"],
    ]
      .map(
        ([key, label]) => `<div class="setting"><div class="switch"><input id="gif-${key}" class="cmn-toggle" type="checkbox" data-gif-option="${key}" ${initialOptions[key as keyof AnalysisExportOptions] ? "checked" : ""}><label for="gif-${key}"></label></div><label for="gif-${key}">${label}</label></div>`
      )
      .join("")}</div><div class="gif-actions"><button class="button button-metal text gif-copy" type="button" data-icon="&#xe070;">Copy to clipboard</button><button class="button button-green text gif-download" type="button" data-icon="&#xe056;">Download</button></div><div class="gif-progress" aria-live="polite"></div></div>`,
    [
      {
        selector: ".gif-flip",
        listener: (event) => {
          options.orientation = options.orientation === "white" ? "black" : "white";
          (event.currentTarget as HTMLButtonElement).textContent = options.orientation;
          generated = null;
        },
      },
      ...(["players", "ratings", "glyphs", "clocks"] as const).map((key) => ({
        selector: `#gif-${key}`,
        event: "change",
        listener: (event: Event) => {
          options[key] = (event.currentTarget as HTMLInputElement).checked;
          generated = null;
        },
      })),
      {
        selector: ".gif-download",
        listener: (_event, dialog) => {
          void generate(dialog)
            .then((blob) => saveBlob(blob, `ark-chess-${matchId}-${options.orientation}.gif`))
            .catch((error) => toast.error(friendlyError(error, "Couldn't create the GIF.")));
        },
      },
      {
        selector: ".gif-copy",
        listener: (_event, dialog) => {
          void generate(dialog)
            .then(async (blob) => {
              if (typeof ClipboardItem === "undefined") {
                saveBlob(blob, `ark-chess-${matchId}-${options.orientation}.gif`);
                toast.success("GIF downloaded because this browser cannot copy GIF files.");
                return;
              }
              await navigator.clipboard.write([new ClipboardItem({ "image/gif": blob })]);
              toast.success("GIF copied to clipboard.");
            })
            .catch((error) => toast.error(friendlyError(error, "Couldn't copy the GIF.")));
        },
      },
    ]
  ).catch((error) => toast.error(friendlyError(error, "Couldn't open the GIF dialog.")));
}

export function LichessAnalysis({ matchId }: { matchId: string | null }) {
  const wallet = useCasinoWallet();
  const sessionWallet = useSessionWallet("ethereum");
  const viewerWallet = wallet.address ?? sessionWallet;
  const queryClient = useQueryClient();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [runtimeError, setRuntimeError] = useState<Error | null>(null);
  const social = useChessMatchSocial(matchId, "spectator", false, null, null);
  const matchQuery = useQuery({
    queryKey: CHESS_KEYS.match(matchId ?? "none"),
    queryFn: () => fetchMatch(matchId as string),
    enabled: !!matchId,
  });
  const movesQuery = useQuery({
    queryKey: ["casino", "chess", "review-moves", matchId ?? "none"],
    queryFn: () => fetchMatchMoves(matchId as string),
    enabled: !!matchId,
  });
  const analysisQuery = useQuery({
    queryKey: CHESS_KEYS.analysis(matchId ?? "none"),
    queryFn: () => fetchMatchAnalysis(matchId as string),
    enabled: !!matchId && matchQuery.data?.state === "settled",
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "queued" || data?.status === "running" ? 3000 : false;
    },
  });
  const requestAnalysis = useMutation({
    mutationFn: () => {
      if (!matchId || !wallet.address) throw new Error("Sign in to request analysis.");
      return requestMatchAnalysis(matchId, wallet.address);
    },
    onSuccess: (analysis) => {
      queryClient.setQueryData(CHESS_KEYS.analysis(analysis.matchId), analysis);
      toast.success(analysis.status === "completed" ? "Analysis is ready." : "Analysis queued.");
    },
    onError: (error) => toast.error(friendlyError(error, "Couldn't request analysis.")),
  });
  const requestAnalysisRef = useRef(requestAnalysis);
  requestAnalysisRef.current = requestAnalysis;
  const postChatRef = useRef(social.postChat);
  const saveNoteRef = useRef(social.saveNote);
  const socialDataRef = useRef({ chatMessages: social.chatMessages, note: social.note });
  postChatRef.current = social.postChat;
  saveNoteRef.current = social.saveNote;
  socialDataRef.current = { chatMessages: social.chatMessages, note: social.note };

  const completeAnalysis =
    analysisQuery.data?.status === "completed" ? analysisQuery.data : null;
  const shell = useMemo(() => {
    if (!matchQuery.data || !movesQuery.data) return null;
    return analysisShell(
      matchQuery.data,
      movesQuery.data,
      !!completeAnalysis,
      analysisQuery.data?.status ?? null
    );
  }, [analysisQuery.data?.status, completeAnalysis, matchQuery.data, movesQuery.data]);
  const data = useMemo(() => {
    if (!matchQuery.data || !movesQuery.data) return null;
    const ownBlack =
      !!viewerWallet &&
      matchQuery.data.black?.walletAddress.toLowerCase() === viewerWallet.toLowerCase();
    return buildLichessAnalysisData({
      match: matchQuery.data,
      moves: movesQuery.data,
      analysis: completeAnalysis,
      orientation: ownBlack ? "black" : "white",
    });
  }, [completeAnalysis, matchQuery.data, movesQuery.data, viewerWallet]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !shell) return;
    host.innerHTML = shell;
    return () => host.replaceChildren();
  }, [shell]);

  useEffect(() => {
    const match = matchQuery.data;
    const ctrl = analysisController()?.chatCtrl;
    if (!match || !ctrl) return;
    const next = chatLines(social.chatMessages, match);
    const currentRevision = JSON.stringify(ctrl.data.lines);
    const nextRevision = JSON.stringify(next);
    if (currentRevision === nextRevision) return;
    ctrl.data.lines = next;
    ctrl.vm.domVersion += 1;
    ctrl.redraw();
  }, [matchQuery.data, social.chatMessages]);

  useEffect(() => {
    const host = hostRef.current;
    const match = matchQuery.data;
    const moves = movesQuery.data;
    if (!host || !shell || !data || !match || !moves) return;
    let cancelled = false;
    let analyseModule: AnalyseModule | null = null;
    setRuntimeError(null);
    host.dataset.analysisPhase = "loading-assets";
    const chatViewer = viewerWallet ? actorLabel(viewerWallet, match) : undefined;
    const frames = exportFrames(match, moves, completeAnalysis);
    let rawPgn: Promise<string> | null = null;
    const getRawPgn = () => (rawPgn ??= fetchPgn(match.id).then((pgn) => displayedPgn(pgn, match)));
    const getPgn = async (kind: "raw" | "annotated") => {
      const raw = await getRawPgn();
      return kind === "annotated" ? annotatedPgn(raw, match, moves, completeAnalysis) : raw;
    };
    const currentFrame = (): AnalysisExportFrame => {
      const ctrl = analysisController();
      return {
        fen: ctrl?.node?.fen || match.fen,
        uci: ctrl?.node?.uci,
      };
    };
    const currentOptions = () =>
      exportOptions(match, analysisController()?.bottomColor?.() ?? data.orientation);
    const coachMoves = new Map((completeAnalysis?.moves ?? []).map((move) => [move.ply, move]));
    let coachVoiceEnabled = false;
    try {
      coachVoiceEnabled = window.localStorage.getItem(COACH_VOICE_STORAGE_KEY) === "true";
    } catch {
      // Storage privacy settings leave narration off without breaking review.
    }
    let lastSpokenCoachPly: number | null = null;
    let renderedCoachPly: number | null = null;
    let coachVoiceObserver: MutationObserver | null = null;
    let coachVoiceFrame: number | null = null;
    const coachVoiceButton = () =>
      host.querySelector<HTMLButtonElement>("[data-ark-coach-voice]");
    const renderCoachVoiceButton = () => {
      const button = coachVoiceButton();
      if (!button) return;
      const pressed = String(coachVoiceEnabled);
      const label = `Coach voice: ${coachVoiceEnabled ? "On" : "Off"}`;
      if (button.getAttribute("aria-pressed") !== pressed) {
        button.setAttribute("aria-pressed", pressed);
      }
      if (button.textContent !== label) button.textContent = label;
    };
    const renderSelectedCoachComment = () => {
      const card = host.querySelector<HTMLElement>("[data-ark-coach-card]");
      if (!card) return;
      const ply = analysisController()?.node?.ply ?? 0;
      if (ply === renderedCoachPly) return;
      renderedCoachPly = ply;

      const move = coachMoves.get(ply);
      const title = card.querySelector<HTMLElement>("[data-ark-coach-title]");
      const comment = card.querySelector<HTMLElement>("[data-ark-coach-comment]");
      const badge = card.querySelector<HTMLElement>("[data-ark-coach-badge]");
      const correction = card.querySelector<HTMLElement>("[data-ark-coach-correction]");
      const best = card.querySelector<HTMLElement>("[data-ark-coach-best]");
      if (!title || !comment || !badge || !correction || !best) return;

      if (!move) {
        card.dataset.classification = "good";
        title.textContent = ply === 0 ? "Game review" : "Position review";
        comment.textContent =
          ply === 0
            ? "Step through the moves to see your coach's feedback."
            : "No coach explanation is available for this position.";
        badge.textContent = "♟";
        correction.hidden = true;
        best.textContent = "";
      } else {
        const presentation = COACH_CLASSIFICATION[move.classification];
        const explanation = explainCoachComment(move.coachComment.trim());
        const showCorrection =
          move.classification !== "best" &&
          !!move.bestSan &&
          move.bestSan.trim().toLowerCase() !== move.playedSan.trim().toLowerCase();
        card.dataset.classification = move.classification;
        title.textContent = `${presentation.title}: ${describeChessMove(move.playedSan)}`;
        comment.textContent = explanation || `${presentation.title}. Review the resulting position.`;
        badge.textContent = presentation.badge;
        correction.hidden = !showCorrection;
        best.textContent = showCorrection ? describeChessMove(move.bestSan ?? "", true) : "";
      }

      card.classList.remove("is-updating");
      void card.offsetWidth;
      card.classList.add("is-updating");
    };
    const speakSelectedCoachComment = (repeat = false) => {
      if (!coachVoiceEnabled) return;
      const ply = analysisController()?.node?.ply;
      if (ply == null || (!repeat && ply === lastSpokenCoachPly)) return;
      lastSpokenCoachPly = ply;
      const move = coachMoves.get(ply);
      if (!move) return;
      const presentation = COACH_CLASSIFICATION[move.classification];
      const correction =
        move.classification !== "best" && move.bestSan
          ? ` The better move was ${describeChessMove(move.bestSan)}.`
          : "";
      const narration = `${presentation.title}: ${describeChessMove(move.playedSan)}. ${explainCoachComment(move.coachComment.trim())}${correction}`.trim();
      if (narration) {
        (window as ArkAnalysisWindow).site?.sound?.say(narration, true, true, false);
      }
    };
    const scheduleCoachVoice = () => {
      if (coachVoiceFrame !== null) return;
      coachVoiceFrame = window.requestAnimationFrame(() => {
        coachVoiceFrame = null;
        renderCoachVoiceButton();
        renderSelectedCoachComment();
        speakSelectedCoachComment();
      });
    };

    const originalFetch = window.fetch.bind(window);
    const notePath = `/${match.id}/note`;
    const arkFetch: typeof window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(requestUrl, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== notePath) {
        return originalFetch(input, init);
      }
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "GET") {
        return new Response(socialDataRef.current.note?.text ?? "", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      const body = init?.body;
      const text = body instanceof FormData ? String(body.get("text") ?? "") : "";
      try {
        const saved = await saveNoteRef.current(text);
        return Response.json(saved);
      } catch (error) {
        toast.error(friendlyError(error, "Couldn't save the private note."));
        return Response.json({ error: "Unable to save note" }, { status: 502 });
      }
    };
    window.fetch = arkFetch;

    const requestHandler = (event: Event) => {
      const form = event.target instanceof Element ? event.target.closest("form") : null;
      if (!form?.matches("[data-ark-analysis-request]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        !requestAnalysisRef.current.isPending &&
        analysisQuery.data?.status !== "running"
      ) {
        requestAnalysisRef.current.mutate();
      }
    };
    const keyHandler = (event: KeyboardEvent) => {
      const input = event.target instanceof Element
        ? event.target.closest<HTMLInputElement>("input.mchat__say")
        : null;
      if (!input || event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const text = input.value.trim();
      if (!text) return;
      if (!viewerWallet) {
        toast.error("Sign in to chat.");
        return;
      }
      input.disabled = true;
      void postChatRef.current({ room: "spectator", text })
        .then((line) => {
          input.value = "";
          const rendered = { u: actorLabel(line.author, match), t: line.text, d: false };
          const ctrl = analysisController()?.chatCtrl;
          if (ctrl?.onMessage) ctrl.onMessage(rendered);
          else if (ctrl) {
            ctrl.data.lines.push(rendered);
            ctrl.vm.domVersion += 1;
            ctrl.redraw();
          }
        })
        .catch((error) => toast.error(friendlyError(error, "Couldn't send that message.")))
        .finally(() => {
          input.disabled = false;
          input.focus();
        });
    };
    const clickHandler = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const chatTab = target.closest<HTMLButtonElement>("button.mchat__tab");
      const gameGif = target.closest<HTMLAnchorElement>("a.game-gif");
      const embed = target.closest<HTMLAnchorElement>("a.embed-howto");
      const exportLink = target.closest<HTMLAnchorElement>("[data-ark-export]");
      const copyButton = target.closest<HTMLButtonElement>(".copy-me__button");
      const voiceButton = target.closest<HTMLButtonElement>("[data-ark-coach-voice]");
      const internalLink = target.closest<HTMLAnchorElement>(".action-menu a[href]");
      if (voiceButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        coachVoiceEnabled = !coachVoiceEnabled;
        try {
          window.localStorage.setItem(COACH_VOICE_STORAGE_KEY, String(coachVoiceEnabled));
        } catch {
          // Narration still works for this page when storage is unavailable.
        }
        lastSpokenCoachPly = null;
        renderCoachVoiceButton();
        if (coachVoiceEnabled) speakSelectedCoachComment(true);
        else window.speechSynthesis?.cancel();
        return;
      }
      if (chatTab) {
        const key = chatTab.classList.contains("note") ? "note" : "discussion";
        if (selectChatTab(key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (gameGif) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openGifDialog(frames, currentOptions(), match.id);
        return;
      }
      if (embed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const controller = analysisController();
        openEmbedDialog(
          match.id,
          controller?.bottomColor?.() ?? data.orientation,
          controller?.node?.ply ?? moves.length
        );
        return;
      }
      if (exportLink) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const kind = exportLink.dataset.arkExport;
        if (kind === "position") {
          void renderPositionPng(currentFrame(), currentOptions())
            .then((blob) => saveBlob(blob, `ark-chess-${match.id}-position.png`))
            .catch((error) => toast.error(friendlyError(error, "Couldn't render the position.")));
        } else if (kind === "raw" || kind === "annotated") {
          void getPgn(kind)
            .then((pgn) => saveText(pgn, `ark-chess-${match.id}${kind === "annotated" ? "-annotated" : ""}.pgn`, "application/x-chess-pgn"))
            .catch((error) => toast.error(friendlyError(error, "Couldn't export the PGN.")));
        }
        return;
      }
      if (copyButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const wrapper = copyButton.closest<HTMLElement>(".copy-me");
        const kind = wrapper?.dataset.arkExport;
        if (kind === "position") {
          void renderPositionPng(currentFrame(), currentOptions())
            .then(async (blob) => {
              if (typeof ClipboardItem === "undefined") {
                saveBlob(blob, `ark-chess-${match.id}-position.png`);
                toast.success("Position downloaded because image copy is unavailable.");
                return;
              }
              await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              toast.success("Position copied to clipboard.");
            })
            .catch((error) => toast.error(friendlyError(error, "Couldn't copy the position.")));
        } else if (kind === "raw" || kind === "annotated") {
          void getPgn(kind)
            .then(copyText)
            .catch((error) => toast.error(friendlyError(error, "Couldn't copy the PGN.")));
        } else {
          const value = wrapper?.querySelector<HTMLInputElement>("input")?.value ?? "";
          const absolute = value.startsWith("/") ? `${window.location.origin}${value}` : value;
          void copyText(absolute).catch(() => toast.error("Couldn't copy to clipboard."));
        }
        return;
      }
      if (internalLink) {
        const href = internalLink.getAttribute("href") ?? "";
        if (href.includes("/continue/ai")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const fen = new URL(href, window.location.origin).searchParams.get("fen");
          window.location.assign(`/casino/chess?computer=1${fen ? `&fen=${encodeURIComponent(fen)}` : ""}`);
        } else if (href.includes("/continue/friend")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const fen = new URL(href, window.location.origin).searchParams.get("fen");
          window.location.assign(`/casino/chess?setup=friend${fen ? `&fen=${encodeURIComponent(fen)}` : ""}`);
        } else if (href.includes("/edit?")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const fen = new URL(href, window.location.origin).searchParams.get("fen");
          window.location.assign(`/casino/chess/review?match=${encodeURIComponent(match.id)}${fen ? `#fen=${encodeURIComponent(fen)}` : ""}`);
        }
      }
    };
    host.addEventListener("submit", requestHandler, true);
    host.addEventListener("keydown", keyHandler, true);
    host.addEventListener("click", clickHandler, true);

    void (async () => {
      try {
        await Promise.all([
          loadLichessStyle(THEME_CSS),
          loadLichessStyle(SITE_CSS),
          loadLichessStyle(ANALYSE_CSS),
          loadLichessStyle(COACH_CSS),
          loadLichessScript(CASH_MODULE),
        ]);
        if (cancelled) return;
        installLichessRuntime(data.player.id, inertPowertip);
        document.body.classList.remove("playing");
        host.dataset.analysisPhase = "loading-module";
        const module = (await import(/* webpackIgnore: true */ ANALYSE_MODULE)) as AnalyseModule;
        analyseModule = module;
        if (cancelled) return;
        await module.initModule({
          mode: "replay",
          cfg: {
            data,
            userId: data.player.id,
            hunter: false,
            explorer: {
              endpoint: "https://explorer.lichess.ovh/lichess",
              tablebaseEndpoint: "https://tablebase.lichess.ovh/standard",
              showRatings: true,
            },
            externalEngineEndpoint: "",
            socketSend() {},
            chat: {
              data: {
                id: matchId,
                name: "Spectator room",
                lines: chatLines(socialDataRef.current.chatMessages, match),
                userId: chatViewer,
                resourceType: "watcher",
                resourceId: matchId,
                loginRequired: true,
                restricted: false,
              },
              writeable: true,
              kobold: false,
              blind: false,
              timeout: false,
              public: true,
              permissions: {},
              kidMode: false,
              ...(wallet.address
                ? { noteId: match.id, noteText: socialDataRef.current.note?.text }
                : {}),
            },
          },
        });
        renderCoachVoiceButton();
        renderSelectedCoachComment();
        coachVoiceObserver = new MutationObserver(scheduleCoachVoice);
        coachVoiceObserver.observe(host, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true,
        });
        selectChatTab("discussion");
        if (!cancelled) host.dataset.analysisPhase = "ready";
      } catch (error) {
        if (cancelled) return;
        host.dataset.analysisPhase = "error";
        console.error("Lichess analysis initialization failed", error);
        setRuntimeError(error instanceof Error ? error : new Error("Unable to initialize analysis"));
      }
    })();

    return () => {
      cancelled = true;
      analyseModule?.destroyModule?.();
      coachVoiceObserver?.disconnect();
      if (coachVoiceFrame !== null) window.cancelAnimationFrame(coachVoiceFrame);
      window.speechSynthesis?.cancel();
      host.removeEventListener("submit", requestHandler, true);
      host.removeEventListener("keydown", keyHandler, true);
      host.removeEventListener("click", clickHandler, true);
      if (window.fetch === arkFetch) window.fetch = originalFetch;
      const global = window as typeof window & {
        site?: { analysis?: unknown };
        lichess?: { analysis?: unknown };
      };
      if (global.site) global.site.analysis = undefined;
      if (global.lichess) global.lichess.analysis = undefined;
    };
  }, [analysisQuery.data?.status, completeAnalysis, data, matchId, shell, viewerWallet]);

  if (!matchId) return <CasinoError error={new Error("No game selected.")} subject="analysis" />;
  if (matchQuery.error || movesQuery.error || runtimeError) {
    return (
      <CasinoError
        error={matchQuery.error ?? movesQuery.error ?? runtimeError}
        subject="game analysis"
      />
    );
  }
  if (
    matchQuery.isLoading ||
    movesQuery.isLoading ||
    !shell ||
    !data
  ) {
    return <CasinoLoading label="Loading analysis" />;
  }

  return <div ref={hostRef} id="main-wrap" className="is2d" suppressHydrationWarning />;
}
