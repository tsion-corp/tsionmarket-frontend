// Pure logic behind broadcasting a chess match to Market Square. Everything
// here is framework-free so the copy, the deep link and the publish settings
// can be tested without a browser or a media server.

import { ScreenSharePresets, type TrackPublishOptions } from "livekit-client";
import type { MarketSquareDeepLink } from "@/features/casino/lib/api/market-square-client";

export const MATCH_WATCH_PATH = "/casino/chess/watch";

// How a viewer gets from the stream back to the board. Two mechanisms, on
// purpose:
//
// 1. deepLink. Market Square models a deep link as { kind, ref } and already
//    carries one on posts, feed items and activities, with "game" among the
//    kinds. Streams accept it on the newer builds. It is the structured route,
//    and the one the Market Square client can turn into an in-app navigation.
// 2. The link in the description. Production has not shipped deepLink on
//    streams yet, so on that deployment the field is dropped and the URL in
//    the description is the only way back. It stays even once deepLink lands,
//    because a plain URL still works for anything reading the description.
export function matchDeepLink(matchId: string): MarketSquareDeepLink {
  return { kind: "game", ref: matchId };
}

export function matchWatchUrl(origin: string, matchId: string): string {
  return `${origin.replace(/\/+$/u, "")}${MATCH_WATCH_PATH}?match=${encodeURIComponent(matchId)}`;
}

export function broadcastTitle(whiteName: string, blackName: string): string {
  const title = `Chess: ${whiteName} vs ${blackName}`;
  // The service caps the title at 200 characters.
  return title.length > 200 ? `${title.slice(0, 199)}…` : title;
}

export function broadcastDescription(origin: string, matchId: string): string {
  return `Live chess on Ark. Watch the match: ${matchWatchUrl(origin, matchId)}`;
}

// A chessboard is a near-static image where sharpness matters far more than
// framerate, so the capture is hinted 'detail' and published at 15fps. The
// codec is pinned to h264 because the SDK overrides a 'detail' hint to
// 'motion' when a screen share goes out over an SVC codec (VP9/AV1).
export const SCREEN_PUBLISH_OPTIONS: TrackPublishOptions = {
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  videoCodec: "h264",
  simulcast: false,
  degradationPreference: "maintain-resolution",
};

// displaySurface is a hint the browser may ignore, and the user always keeps
// unlimited choice of surface. Hinting 'browser' nudges the picker toward the
// single tab holding the board rather than the whole desktop, which is the
// difference between broadcasting a chessboard and broadcasting an inbox.
export const SCREEN_CAPTURE_OPTIONS = {
  audio: false,
  video: { displaySurface: "browser" as const },
  contentHint: "detail" as const,
  selfBrowserSurface: "include" as const,
  surfaceSwitching: "include" as const,
  systemAudio: "exclude" as const,
};

// Screen capture is desktop-only: no iOS browser implements getDisplayMedia at
// all, and the Android pickers are unusable. Feature-detect rather than sniff.
export function screenShareSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

// What the user actually picked, once the track exists. A whole-monitor share
// deserves a louder warning than a single tab.
export function sharedSurfaceLabel(surface: string | undefined): string | null {
  if (surface === "browser") return "a browser tab";
  if (surface === "window") return "one window";
  if (surface === "monitor") return "your entire screen";
  return null;
}

export type BroadcastPhase =
  | "idle"
  | "checking"
  | "not-creator"
  | "starting"
  | "live"
  | "share-stopped"
  | "ending"
  | "ended"
  // Publishing stopped, but Market Square never confirmed the stream ended.
  // Separate from "error" so the panel offers "try ending again" rather than
  // "go live", which is the wrong thing to hand someone who asked to stop.
  | "end-failed"
  | "error";

// Leaving the page or closing the tab while any of these are true drops the
// broadcast mid-match, so the browser gets a beforeunload warning.
export function shouldWarnOnLeave(phase: BroadcastPhase): boolean {
  return phase === "starting" || phase === "live" || phase === "share-stopped";
}
