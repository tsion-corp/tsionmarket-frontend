// Pure logic behind broadcasting any casino activity to Market Square.
// Framework-free on purpose, so the copy, the capture settings and the phase
// machine can be tested without a browser or a media server.

import { ScreenSharePresets, type TrackPublishOptions, Track } from "livekit-client";

// What the shared surface actually looks like, which is the only thing the
// encoder needs to know. A board is a near-static image where sharpness beats
// framerate; a draw or a countdown moves, and a sharp still of it is useless.
export type BroadcastContent = "detail" | "motion";

// The service caps a stream title at 200 characters.
export const TITLE_LIMIT = 200;

export function capTitle(title: string): string {
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title;
}

export function watchUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/u, "")}${path}`;
}

// The link in the description is the second route back, and on a deployment
// that has not shipped deepLink on streams it is the only one.
export function broadcastDescription(lead: string, origin: string, path: string): string {
  return `${lead} ${watchUrl(origin, path)}`;
}

// The codec is pinned to h264 because the SDK overrides a 'detail' hint to
// 'motion' when a screen share goes out over an SVC codec (VP9/AV1). Read
// lazily rather than at module load so the presets are resolved when the
// broadcast starts, not when the file is imported.
export function screenPublishOptions(content: BroadcastContent): TrackPublishOptions {
  return {
    // Say what this track IS. We build the screen track by hand (getDisplayMedia
    // + LocalVideoTrack) so the picker constraints below survive, and a
    // hand-built track carries no source — LiveKit publishes it unidentified
    // and a viewer cannot tell it from a webcam. Market Square then treats a
    // source-less track as a camera, so a shared screen arrived as a second
    // face and the real camera won the tile: the share was published and never
    // seen. Naming the source is what makes the stage put the screen on the
    // main stage and the face beside it.
    source: Track.Source.ScreenShare,
    screenShareEncoding:
      content === "motion"
        ? ScreenSharePresets.h1080fps30.encoding
        : ScreenSharePresets.h1080fps15.encoding,
    videoCodec: "h264",
    simulcast: false,
    degradationPreference: content === "motion" ? "maintain-framerate" : "maintain-resolution",
  };
}

// The picker constraints, and the single most important few lines in this file
// for a trading app.
//
// `monitorTypeSurfaces: "exclude"` removes "Entire Screen" from the picker
// outright, so a user cannot broadcast their whole desktop from Ark: no
// notifications, no password manager, no other exchange in another window.
// `displaySurface: "browser"` puts the tab first, `selfBrowserSurface:
// "include"` allows this tab to be the one picked, and `surfaceSwitching:
// "exclude"` removes the browser's mid-share "switch tab" control, so the
// surface a user agreed to broadcast stays the surface being broadcast.
//
// `monitorTypeSurfaces` is not in LiveKit's typed capture options, which is
// why capture calls getDisplayMedia directly and wraps the result rather than
// going through createLocalScreenTracks: passing it through the SDK would have
// silently dropped the one constraint that matters most here.
export function screenCaptureConstraints(content: BroadcastContent): DisplayMediaStreamOptions {
  // Cast once at the seam: monitorTypeSurfaces is a Chrome screen-sharing
  // control that lib.dom does not model yet, and a browser that does not know
  // a constraint ignores it rather than failing.
  return {
    audio: false,
    video: { displaySurface: "browser", monitorTypeSurfaces: "exclude" },
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "exclude",
    contentHint: content,
  } as unknown as DisplayMediaStreamOptions;
}

/**
 * Capture constraints for the "Ark only" path.
 *
 * `preferCurrentTab` makes the browser pre-select THIS tab, and the same
 * monitor and switching exclusions apply, so the only surface the user can end
 * up broadcasting is the Ark tab they are already looking at.
 *
 * This is not what the spec describes. The spec composes the Ark view in-app
 * and never calls getDisplayMedia at all, which needs a DOM-to-canvas
 * compositor Ark does not have yet. This reaches the same security guarantee
 * (nothing outside Ark can be selected) through the picker instead of around
 * it, at the cost of one extra confirmation click. See the deviation note in
 * the handover.
 */
export function arkViewCaptureConstraints(content: BroadcastContent): DisplayMediaStreamOptions {
  return {
    audio: false,
    video: { displaySurface: "browser", monitorTypeSurfaces: "exclude" },
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "exclude",
    contentHint: content,
  } as unknown as DisplayMediaStreamOptions;
}

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
  // Asked the host of an existing broadcast for publish rights, waiting for
  // them to answer. Nothing is going out yet.
  | "joining"
  | "join-declined"
  // The broadcast this session had joined went away: the host ended it, or the
  // service reaped it after the host disconnected. Distinct from "ended",
  // which is this session choosing to stop.
  | "host-ended"
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
// broadcast mid-activity, so the browser gets a beforeunload warning.
export function shouldWarnOnLeave(phase: BroadcastPhase): boolean {
  return phase === "starting" || phase === "live" || phase === "share-stopped";
}

/** Whether this session owns the stream or was let into someone else's. */
export type BroadcastRole = "host" | "guest";

// What to call a broadcast someone else is running.
//
// The host's name would be the better label, but a Stream carries an ownerId
// and no owner profile, and profiles are addressed by username upstream, so
// there is no name to show without a lookup that would still come back empty
// for a host who has not set one. The title is what the host chose and is
// already on the payload, so it is what a joiner sees.
//
// This is the one place a label is decided. When the service hydrates an
// `owner` summary onto Stream, prefer its display name here and let the title
// stay as the fallback; no caller has to change.
export function broadcastLabel(stream: { title: string } | null): string {
  const trimmed = stream?.title.trim() ?? "";
  return trimmed || "an untitled broadcast";
}

// A guest can only publish into a stream that is still live and is not their
// own; anything else is either their own broadcast or already over.
export function joinableStreams<T extends { id: string; ownerId: string; status: string }>(
  streams: T[],
  myUserId: string | null
): T[] {
  return streams.filter(
    (stream) => stream.status === "live" && (myUserId === null || stream.ownerId !== myUserId)
  );
}
