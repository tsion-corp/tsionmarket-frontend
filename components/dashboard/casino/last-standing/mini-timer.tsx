"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { useVaultGame } from "@/hooks/use-vault-game";
import { useVaultActions } from "@/hooks/use-vault-actions";
import { usePortfolio } from "@/hooks/use-portfolio";
import { getWalletAddress } from "@/lib/user";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// Pop-out Last Man Standing timer. The round's clock resets on every wager by
// anyone, so a player who tabs away loses the one thing the game is about:
// knowing whether they are still last. This keeps the clock (and the pot, the
// player's balance, and the play button where possible) floating above other
// tabs, other apps, and — crucially — other pages of this app: the floating
// window is owned by MiniTimerHost, mounted at the app root, so navigating
// away from the arena does not close it.
//
// Two tiers, best available wins:
//   1. Document picture-in-picture (Chromium): a real always-on-top window
//      with live HTML — countdown, pot, balance, and a working play button,
//      so a wager can be placed without returning to the tab.
//   2. Video picture-in-picture (Safari, Firefox, Android Chrome): the clock
//      and pot drawn to a canvas and streamed into a floating video. Not
//      clickable — clicking it focuses the tab — but the countdown stays
//      visible, and on Android it keeps floating over the home screen.
// Browsers with neither get no button at all: there is no floating surface
// to offer, and pretending otherwise is worse than absence.
//
// Timekeeping is deadline-based, not tick-based. A minimised or backgrounded
// tab has its timers throttled (down to once a minute), so a clock that
// decrements per tick freezes exactly when the pop-out matters most. Instead
// the latest server-reported seconds become an absolute deadline, and every
// repaint derives the remaining time from the wall clock. The document tier
// goes further and runs its ticker on the pop-out window itself, which is
// visible and never throttled.

interface DocumentPictureInPictureApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

type PipTier = "document" | "video";

function detectTier(): PipTier | null {
  if (typeof window === "undefined") return null;
  const videoCapable =
    typeof document !== "undefined" &&
    document.pictureInPictureEnabled &&
    "captureStream" in HTMLCanvasElement.prototype;
  // The document tier is preferred wherever it exists: its window carries a
  // WORKING play button, and a wager without returning to the tab is the
  // whole point of the pop-out. The canvas video is the fallback for
  // browsers without it (Safari, Firefox) — always floating, never
  // clickable. (Neither tier can appear over another app's FULLSCREEN Space
  // on macOS; the critical-clock notification covers that.)
  if ("documentPictureInPicture" in window) return "document";
  if (videoCapable) return "video";
  return null;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Shared pop-out state. A module store rather than component state so the
// section's button (which unmounts on navigation) and the app-root host
// (which never does) see the same window.

interface MiniWindowState {
  pipWindow: Window | null;
  videoActive: boolean;
}

let state: MiniWindowState = { pipWindow: null, videoActive: false };
const listeners = new Set<() => void>();
// Hidden surfaces for the video tier, registered by the host. Held outside
// React so the section's click handler can reach them synchronously — the
// picture-in-picture request must run inside the user gesture.
let surfaces: { canvas: HTMLCanvasElement; video: HTMLVideoElement } | null = null;

function setState(next: Partial<MiniWindowState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;
const getServerSnapshot = () => state;

function useMiniWindow(): MiniWindowState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// The pop-out document starts empty; cloning the page's stylesheets makes the
// app's classes work inside it. Cross-origin sheets can't be read, so those
// are re-linked instead of inlined.
function copyStylesInto(target: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.document.createElement("style");
      style.textContent = rules;
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  }
}

async function openDocumentPip(): Promise<void> {
  const api = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi })
    .documentPictureInPicture;
  if (!api) return;
  const win = await api.requestWindow({ width: 300, height: 310 });
  copyStylesInto(win);
  win.document.body.style.background = "#101013";
  win.document.body.style.margin = "0";
  // The browser fires pagehide when the user closes the floating window.
  win.addEventListener(
    "pagehide",
    () => {
      stopKeepAliveAudio();
      setState({ pipWindow: null });
    },
    { once: true }
  );
  startKeepAliveAudio();
  setState({ pipWindow: win });
}

// Fully releases the video tier's stream. Reusing a canvas MediaStream
// across open/close cycles is what broke reopening: the old track goes stale
// after picture-in-picture exits, and the next request runs against a video
// that will never produce a fresh frame. Every open builds a new stream.
function teardownVideoSurface(): void {
  const video = surfaces?.video;
  if (!video) return;
  video.pause();
  const stream = video.srcObject as MediaStream | null;
  if (stream) for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}

// How long to wait for the stream to produce its first frame before calling
// the open failed. Generous: a healthy open needs a few hundred milliseconds.
const VIDEO_OPEN_TIMEOUT_MS = 3_000;

async function openVideoPip(): Promise<void> {
  if (!surfaces) return;
  const { canvas, video } = surfaces;
  // A previous session may still be winding down; finish leaving before
  // asking again, or the request races the exit and loses.
  if (document.pictureInPictureElement) await document.exitPictureInPicture();
  teardownVideoSurface();
  const stream = canvas.captureStream();
  video.srcObject = stream;
  // Canvas frames are captured only when the canvas CHANGES, and the video
  // yields metadata only once a real frame has flowed — but the game's
  // repaint loop starts after the window opens. Without a heartbeat that is
  // a deadlock: no change, no frame, no metadata, no window, no error. So
  // paint continuously while opening, forcing a frame out each beat.
  const track = stream.getVideoTracks()[0];
  const heartbeat = window.setInterval(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#101013";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (track && "requestFrame" in track) {
      (track as CanvasCaptureMediaStreamTrack).requestFrame();
    }
  }, 100);
  try {
    await video.play();
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(
          () => reject(new Error("the stream produced no frame")),
          VIDEO_OPEN_TIMEOUT_MS
        );
        video.addEventListener(
          "loadedmetadata",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    }
    await video.requestPictureInPicture();
  } finally {
    window.clearInterval(heartbeat);
  }
  // Fires both for our own close and for the window's own X button; either
  // way the session is over and the stream must not be reused.
  video.addEventListener(
    "leavepictureinpicture",
    () => {
      teardownVideoSurface();
      stopKeepAliveAudio();
      setState({ videoActive: false });
    },
    { once: true }
  );
  startKeepAliveAudio();
  setState({ videoActive: true });
}

// An inaudible audio bed held open while the pop-out is up. Browsers with
// aggressive tab suspension (Arc, Edge's sleeping tabs, Chrome's freezing)
// only spare pages they consider to be playing media — and a muted canvas
// stream does not count. Without this the hidden page is frozen after a few
// minutes, the stream stops, and the floating window dies with it. The gain
// is far below audibility; it exists to keep the page classified as playing.
let keepAlive: { context: AudioContext; oscillator: OscillatorNode } | null = null;

function startKeepAliveAudio(): void {
  if (keepAlive) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    oscillator.frequency.value = 40;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    keepAlive = { context, oscillator };
  } catch {
    // No audio, no exemption — the pop-out still works in the foreground.
    keepAlive = null;
  }
}

function stopKeepAliveAudio(): void {
  if (!keepAlive) return;
  keepAlive.oscillator.stop();
  void keepAlive.context.close();
  keepAlive = null;
}

function closeMiniWindow(): void {
  state.pipWindow?.close();
  if (document.pictureInPictureElement) {
    // The leavepictureinpicture handler tears the stream down.
    void document.exitPictureInPicture();
  } else {
    teardownVideoSurface();
  }
  stopKeepAliveAudio();
  setState({ pipWindow: null, videoActive: false });
}

// ---------------------------------------------------------------------------
// The button, rendered inside the arena. Pure trigger: the floating window it
// opens lives in MiniTimerHost and survives this button unmounting.

const HINT_STORAGE_KEY = "ws-last-standing-mini-hint";
const hintSeen = () =>
  typeof window === "undefined" || localStorage.getItem(HINT_STORAGE_KEY) === "1";

export function MiniTimerLauncher() {
  const t = useTranslations("casino.lastStanding");
  const tier = useSyncExternalStore(subscribe, detectTier, () => null);
  const { pipWindow, videoActive } = useMiniWindow();
  const open = pipWindow !== null || videoActive;

  // One-time hint: nobody discovers picture-in-picture from a pill label
  // alone, and without expectation-setting the fullscreen behaviour reads as
  // a bug. Shown until the button is used once or the hint is dismissed.
  const seen = useSyncExternalStore(subscribe, hintSeen, () => true);
  const [hintDismissed, setHintDismissed] = useState(false);
  const dismissHint = () => {
    localStorage.setItem(HINT_STORAGE_KEY, "1");
    setHintDismissed(true);
  };

  const toggle = useCallback(() => {
    localStorage.setItem(HINT_STORAGE_KEY, "1");
    setHintDismissed(true);
    if (open) {
      closeMiniWindow();
      return;
    }
    // Ask inside the click that opens the pop-out: no Chromium window can
    // float over another app's fullscreen Space on macOS, and the
    // critical-clock notification is what reaches the player there.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    if (tier === "document") {
      void openDocumentPip().catch(() => {
        setState({ pipWindow: null });
        toast.error(t("miniFailed"));
      });
    } else if (tier === "video") {
      void openVideoPip().catch(() => {
        setState({ videoActive: false });
        toast.error(t("miniFailed"));
      });
    }
  }, [open, tier, t]);

  if (tier === null) return null;

  const showHint = !seen && !hintDismissed && !open;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={open}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 text-[11.5px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6h-2V5H5v14h6v2H5a2 2 0 0 1-2-2V5Zm10 8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6Z" />
        </svg>
        {open ? t("miniClose") : t("miniOpen")}
      </button>
      {showHint ? (
        <div className="absolute top-full right-0 z-30 mt-2 w-[248px] rounded-[12px] border border-white/12 bg-[#1a1a1f] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          <div className="text-[12px] leading-[1.5] font-medium text-white/85">
            {t("miniHintTitle")}
          </div>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-white/55">{t("miniHintBody")}</p>
          <button
            type="button"
            onClick={dismissHint}
            className="mt-2 cursor-pointer text-[11.5px] font-semibold text-white/70 hover:text-white"
          >
            {t("miniHintDismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App-root host: owns the floating window's content and the hidden canvas /
// video surfaces. Mounted in providers, so it outlives every page.

export function MiniTimerHost() {
  const tier = useSyncExternalStore(subscribe, detectTier, () => null);
  const { pipWindow, videoActive } = useMiniWindow();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Register the video-tier surfaces so the launcher's click handler can
  // reach them synchronously within the user gesture.
  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      surfaces = { canvas: canvasRef.current, video: videoRef.current };
    }
    return () => {
      surfaces = null;
    };
  }, [tier]);

  const open = pipWindow !== null || videoActive;

  return (
    <>
      {tier === "video" ? (
        // Offscreen surfaces feeding the floating video. Kept mounted so the
        // stream survives navigation; invisible in the page itself.
        <div aria-hidden className="pointer-events-none fixed h-0 w-0 overflow-hidden">
          <canvas ref={canvasRef} width={320} height={180} />
          <video ref={videoRef} muted playsInline />
        </div>
      ) : null}
      {/* Game data (queries, socket) is only subscribed to while the pop-out
          is actually open; the rest of the time the host is inert. */}
      {open ? <MiniTimerLive pipWindow={pipWindow} canvasRef={canvasRef} /> : null}
    </>
  );
}

const URGENT_SECONDS = 10;

// The live pop-out: fetches the game itself so it works from any page, ticks
// its clock against a deadline, and can place a wager through the same
// contract call the arena uses.
function MiniTimerLive({
  pipWindow,
  canvasRef,
}: {
  pipWindow: Window | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const t = useTranslations("casino.lastStanding");
  const router = useRouter();
  const { user } = usePrivy();
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const { status, resyncGame } = useVaultGame();
  const { wager, wagering } = useVaultActions();
  const { tokens, refetch: refetchPortfolio } = usePortfolio();

  const address = getWalletAddress(user, "ethereum");
  const gameActive = !!status?.gameActive;
  const serverSeconds = gameActive ? (status?.timeRemaining ?? 0) : 0;

  // Deadline-based clock; see the module comment. The interval lives on the
  // pop-out window when there is one, which is never throttled.
  const [ticked, setTicked] = useState(serverSeconds);
  useEffect(() => {
    if (!gameActive) return;
    const deadline = Date.now() + serverSeconds * 1000;
    const host = pipWindow ?? window;
    const id = host.setInterval(
      () => setTicked(Math.max(0, Math.round((deadline - Date.now()) / 1000))),
      500
    );
    return () => host.clearInterval(id);
  }, [gameActive, serverSeconds, pipWindow]);

  const remaining = gameActive ? Math.min(ticked, serverSeconds) : (status?.timerDuration ?? 0);
  const urgent = gameActive && remaining > 0 && remaining <= URGENT_SECONDS;
  const clock = formatCountdown(remaining);
  const statusLabel = gameActive
    ? urgent
      ? t("statusEnding")
      : t("statusLiveRound")
    : status?.isGameStarted
      ? t("statusRoundEnded")
      : t("statusIdle");

  const pot = money.format(status?.vaultBalance.usdValue ?? 0);
  const ethHolding = tokens.find(
    (tok) => tok.network === "base-mainnet" && tok.symbol.toUpperCase() === "ETH"
  );
  const balance = mask(money.format(ethHolding?.valueUsd ?? 0));
  const entryFeeEth = status ? Number(status.entryFee.amount) : 0;
  const canPlay = entryFeeEth > 0 && (ethHolding?.balance ?? 0) >= entryFeeEth;
  const stakeLabel = canPlay
    ? t("ctaPlay", { amount: money.format(status?.entryFee.usdValue ?? 0) })
    : t("ctaAddMoney");

  const onStake = async () => {
    if (!canPlay) {
      // Funding needs the full page (deposit sheet). Bring the app forward
      // and land on the arena instead of dead-ending in the mini window.
      window.focus();
      router.push("/casino/last-standing");
      return;
    }
    const toastId = toast.loading(t("ctaPlacing"));
    try {
      await wager();
      toast.success(t("toastYoureIn"), { id: toastId });
      resyncGame();
      void refetchPortfolio();
    } catch (e) {
      toast.error(friendlyError(e, t("toastPlayFailed")), { id: toastId });
    }
  };

  // The canvas frame for the video tier, repainted whenever the derived
  // values change (the ticker above drives the every-500ms updates).
  useEffect(() => {
    if (pipWindow) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#101013";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 13px sans-serif";
    ctx.fillText(`${t("prizePool")}  ${pot}`, canvas.width / 2, 34);
    ctx.fillStyle = urgent ? "#F6A5A5" : "#ffffff";
    ctx.font = "700 64px ui-monospace, monospace";
    ctx.fillText(clock, canvas.width / 2, 108);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 12px sans-serif";
    ctx.fillText(statusLabel, canvas.width / 2, 140);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 11px sans-serif";
    ctx.fillText(`${t("yourBalance")}  ${balance}`, canvas.width / 2, 162);
    // Push the repaint into the stream explicitly rather than trusting
    // change detection; a floating window showing a stale clock reads as
    // frozen even when the page is healthy.
    const stream = surfaces?.video.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (track && "requestFrame" in track) {
      (track as CanvasCaptureMediaStreamTrack).requestFrame();
    }
  });

  // The one surface that reaches a player on another app's fullscreen Space
  // (where no Chromium floating window can follow on macOS): a system
  // notification when the clock turns critical while the page is hidden.
  // Fired once per critical phase; a wager resets the clock above the
  // threshold and re-arms it. Clicking brings the game back.
  // The layer no browser can take away: while the pop-out is open, the tab's
  // title carries the live clock and pot. Arc manages floating media through
  // its own Mini Player and reaps third-party picture-in-picture windows, but
  // it renders tab titles in its sidebar like everyone else — so even where
  // the floating window dies, the countdown stays one glance away. Updates
  // ride the socket's server readings, which reach a throttled background
  // tab when its timers do not.
  useEffect(() => {
    const original = document.title;
    document.title = `⏳ ${clock} · ${pot}`;
    return () => {
      document.title = original;
    };
  }, [clock, pot]);

  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!gameActive || remaining > URGENT_SECONDS * 2) {
      notifiedRef.current = false;
      return;
    }
    if (
      notifiedRef.current ||
      remaining <= 0 ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      document.visibilityState === "visible"
    ) {
      return;
    }
    notifiedRef.current = true;
    const notification = new Notification(t("miniNotifyTitle", { clock }), {
      body: t("miniNotifyBody", { pot }),
      tag: "last-standing-clock",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [gameActive, remaining, clock, pot, t]);

  if (!pipWindow) return null;

  return createPortal(
    <div className="flex h-[100vh] flex-col items-center justify-center gap-1.5 p-4 text-center font-sans">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-white/50 uppercase">
        {t("prizePool")}
      </div>
      <div className="text-[19px] font-semibold text-white">{pot}</div>
      <div
        className={`tnum text-[52px] leading-none font-bold ${
          urgent ? "animate-pulse text-[#F6A5A5]" : "text-white"
        }`}
      >
        {clock}
      </div>
      <div className="text-[12px] text-white/45">{statusLabel}</div>
      <button
        type="button"
        onClick={() => void onStake()}
        disabled={wagering || !status || !address}
        className="text-ink mt-2 w-full cursor-pointer rounded-xl bg-white p-2.5 text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {stakeLabel}
      </button>
      <div className="text-[11px] text-white/40">
        {t("yourBalance")} {balance}
      </div>
    </div>,
    pipWindow.document.body
  );
}
