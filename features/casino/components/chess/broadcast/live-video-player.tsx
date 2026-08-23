"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import { LiveKitRoom } from "@livekit/components-react";
import {
  CameraIcon,
  CloseIcon,
  LiveVideoRoom,
  type LiveVideoParticipantLabel,
} from "@/features/casino/components/chess/broadcast/live-video-room";
import {
  useDesktopVideoLayout,
  useLiveVideoAccess,
} from "@/features/casino/components/chess/broadcast/use-live-video";

interface LiveVideoPlayerProps {
  matchId: string;
  player?: string;
  viewer: "player" | "spectator";
  participants: LiveVideoParticipantLabel[];
  desktopPresentation?: "inline" | "overlay";
  className?: string;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      aria-hidden
    >
      <path
        d="m5.5 7.5 4.5 4.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function storedPanelOpen(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "open";
  } catch {
    return false;
  }
}

function storePanelOpen(key: string, open: boolean) {
  try {
    window.sessionStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Private browsing can disable storage; the panel still works for this render.
  }
}

function JoinVideo({
  viewer,
  loading,
  error,
  onConnect,
  onRetry,
}: {
  viewer: LiveVideoPlayerProps["viewer"];
  loading: boolean;
  error: unknown;
  onConnect: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-[168px] items-center justify-center bg-[radial-gradient(circle_at_50%_15%,#35322e_0%,#1b1a18_70%)] px-5 text-center">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/6 text-white/55">
          <CameraIcon />
        </div>
        <div className="mt-3 text-[12px] font-semibold text-white/85">
          {viewer === "player" ? "Join the match video" : "Loading match video"}
        </div>
        <div className="mx-auto mt-1 max-w-[240px] text-[10.5px] leading-4 text-white/42">
          {viewer === "player"
            ? "Camera and microphone are shared only inside this game."
            : "Spectators can watch, but cannot publish camera or audio."}
        </div>
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 cursor-pointer rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[11px] font-medium text-white hover:bg-white/12"
          >
            Retry video
          </button>
        ) : viewer === "player" ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={loading}
            className="mt-3 cursor-pointer rounded-full bg-white px-4 py-2 text-[11px] font-semibold text-[#171614] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? "Joining..." : "Join video"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LiveVideoPlayer({
  matchId,
  player,
  viewer,
  participants,
  desktopPresentation = "inline",
  className = "",
}: LiveVideoPlayerProps) {
  const preferenceKey = `ws-chess-video:${matchId}:${viewer}`;
  const panelId = `chess-video-${matchId}-${viewer}`;
  const desktop = useDesktopVideoLayout();
  const [open, setOpen] = useState(() => storedPanelOpen(preferenceKey));
  const [playerCount, setPlayerCount] = useState(0);
  const video = useLiveVideoAccess({
    matchId,
    player: viewer === "player" ? player : undefined,
    autoConnect: viewer === "spectator" && open,
  });

  const setPanelOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    storePanelOpen(preferenceKey, nextOpen);
    if (!nextOpen) {
      setPlayerCount(0);
      video.leave();
    }
  };
  const closePanel = useEffectEvent(() => setPanelOpen(false));

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const body = video.access ? (
    <LiveKitRoom
      serverUrl={video.access.serverUrl}
      token={video.access.participantToken}
      connect
      audio={video.access.role === "player"}
      video={video.access.role === "player"}
      onDisconnected={video.access.role === "player" ? video.leave : undefined}
      onMediaDeviceFailure={(failure) => console.error("Chess video device failed:", failure)}
      className="h-full"
    >
      <LiveVideoRoom
        viewer={viewer}
        participants={participants}
        onLeave={video.leave}
        onPlayerCount={setPlayerCount}
      />
    </LiveKitRoom>
  ) : (
    <JoinVideo
      viewer={viewer}
      loading={video.isLoading}
      error={video.error}
      onConnect={video.connect}
      onRetry={() => void video.retry()}
    />
  );

  const videoSurface = (
    <div className="relative h-full overflow-hidden bg-[#171614]">
      {body}
      <button
        type="button"
        onClick={() => setPanelOpen(false)}
        aria-label="Close live video"
        className="absolute top-2 right-2 z-20 grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/10 bg-black/70 text-white/75 backdrop-blur-md transition-colors hover:bg-black hover:text-white"
      >
        <CloseIcon />
      </button>
    </div>
  );

  const inlineDesktop = open && desktop && desktopPresentation === "inline";
  const videoOverlay =
    open && (!desktop || desktopPresentation === "overlay")
      ? createPortal(
          <div
            id={panelId}
            className="fixed inset-0 z-[120] flex items-end bg-black/78 p-3 backdrop-blur-[3px] min-[900px]:items-center min-[900px]:justify-center min-[900px]:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Live match video"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPanelOpen(false);
            }}
          >
            <div className="w-full overflow-hidden rounded-[14px] border border-white/10 bg-[#171614] shadow-[0_20px_70px_rgba(0,0,0,0.7)] min-[900px]:max-w-[720px]">
              <div className="flex h-11 items-center gap-2 border-b border-white/8 bg-[#262421] px-3.5">
                <span className="h-2 w-2 rounded-full bg-[#d64b45]" />
                <span className="text-[12px] font-semibold text-white/82">Live match video</span>
                <span className="ml-auto text-[10px] text-white/38">
                  {playerCount > 0 ? `${playerCount} players` : "Players connecting"}
                </span>
              </div>
              <div className="h-[min(62dvh,480px)]">{videoSurface}</div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={className}>
      {!inlineDesktop ? (
        <button
          type="button"
          onClick={() => setPanelOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-[2px] bg-[#262421] px-3.5 text-left text-white/72 shadow-[0_2px_5px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#302e2b] hover:text-white"
        >
          <span className="relative grid h-6 w-6 shrink-0 place-items-center text-white/62">
            <CameraIcon />
            <span className="absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-[#d64b45] ring-2 ring-[#262421]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[0.02em]">
            Live video
          </span>
          <span className="text-[10px] font-semibold tracking-[0.07em] text-[#e0645e] uppercase">
            {playerCount > 0 ? `Live · ${playerCount}` : "Players"}
          </span>
          <ChevronIcon open={open} />
        </button>
      ) : null}

      {inlineDesktop ? (
        <div
          id={panelId}
          className="aspect-video w-full overflow-hidden rounded-[2px] shadow-[0_2px_5px_rgba(0,0,0,0.28)]"
          role="region"
          aria-label="Live match video"
        >
          {videoSurface}
        </div>
      ) : null}
      {videoOverlay}
    </div>
  );
}
