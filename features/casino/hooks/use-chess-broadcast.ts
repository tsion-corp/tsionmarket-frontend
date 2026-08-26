"use client";

// Owns the whole broadcast: the Market Square stream lifecycle and the LiveKit
// room that carries the screen share and the optional camera.
//
// Ordering matters here. getDisplayMedia requires transient user activation,
// which is a short window opened by a click and consumed by the first await.
// Creating the stream and calling go-live are two network round-trips, so
// doing them first would spend the activation and leave the picker call to
// fail with InvalidStateError. Every path therefore captures the screen as the
// first thing after the click, then does the network work, then publishes the
// track it already holds.
//
// Screen and camera are published as two separate tracks, distinguished on the
// viewer side by Track.Source.ScreenShare and Track.Source.Camera. Nothing is
// composited here; see the note in the panel about the picture-in-picture.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createLocalScreenTracks,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import { errorCode } from "@/lib/api/envelope";
import {
  applyForCreator,
  canBroadcast,
  createStream,
  endStream,
  fetchMarketSquareProfile,
  goLive,
  type MarketSquareStream,
} from "@/features/casino/lib/api/market-square-client";
import {
  broadcastDescription,
  broadcastTitle,
  matchDeepLink,
  SCREEN_CAPTURE_OPTIONS,
  SCREEN_PUBLISH_OPTIONS,
  screenShareSupported,
  sharedSurfaceLabel,
  shouldWarnOnLeave,
  type BroadcastPhase,
} from "@/features/casino/lib/chess/broadcast";

export interface ChessBroadcastState {
  phase: BroadcastPhase;
  /** null until the browser has been checked after mount. */
  supported: boolean | null;
  /** null while the role is still being read, so the UI can say "checking". */
  isCreator: boolean | null;
  roleUnavailable: boolean;
  stream: MarketSquareStream | null;
  sharingScreen: boolean;
  sharingCamera: boolean;
  /** The surface the user actually picked, once the browser reports it. */
  surface: string | null;
  error: string | null;
  /**
   * A second, lesser problem alongside `error`: the failure was handled but
   * something we tried to tidy up did not go through. Never replaces `error`.
   */
  cleanupWarning: string | null;
  busy: boolean;
  /** True while the creator application is in flight. */
  applying: boolean;
}

export interface ChessBroadcastActions {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Retry the role read after Market Square failed to answer it. */
  recheckRole: () => Promise<void>;
  applyForCreatorRole: () => Promise<void>;
  resumeScreenShare: () => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  dismissError: () => void;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// The user dismissing the picker is a cancel, not a failure.
function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

// Screen-share support cannot change during a session, so the store has
// nothing to notify and the server has no answer at all.
const noSubscription = () => () => {};
const unknownOnServer = () => null;

function stopTracks(tracks: LocalTrack[]): void {
  for (const track of tracks) track.stop();
}

export function useChessBroadcast(
  matchId: string | null,
  whiteName: string,
  blackName: string
): ChessBroadcastState & ChessBroadcastActions {
  const [phase, setPhase] = useState<BroadcastPhase>("idle");
  const [stream, setStream] = useState<MarketSquareStream | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [sharingCamera, setSharingCamera] = useState(false);
  const [surface, setSurface] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const streamRef = useRef<MarketSquareStream | null>(null);
  // Read through useSyncExternalStore so the server renders "unknown" and the
  // client resolves it after hydration. Deciding it during render would make
  // the two disagree, and the answer never changes, so there is nothing to
  // subscribe to.
  const supported = useSyncExternalStore<boolean | null>(
    noSubscription,
    screenShareSupported,
    unknownOnServer
  );

  // The creator gate on POST /streams. Reading it up front lets the control
  // say "your account cannot broadcast yet" instead of failing on the click.
  const profile = useQuery({
    queryKey: ["market-square", "me"],
    queryFn: fetchMarketSquareProfile,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const isCreator = profile.data ? canBroadcast(profile.data.role) : null;

  const teardown = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setSharingScreen(false);
    setSharingCamera(false);
    setSurface(null);
    if (room) await room.disconnect();
  }, []);

  // Drop the connection if the component unmounts while publishing. The
  // service also reaps an orphaned stream after the host-disconnect grace
  // window, which is what `endedReason: "host_disconnected"` records.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  // The same warning Market Square's own studio shows. The browser owns the
  // wording; all a page can do is ask for the prompt.
  useEffect(() => {
    if (!shouldWarnOnLeave(phase)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  // Must be the first await after the click. Returns the tracks the picker
  // produced, without publishing them.
  const captureScreen = useCallback(async (): Promise<LocalTrack[]> => {
    const tracks = await createLocalScreenTracks(SCREEN_CAPTURE_OPTIONS);
    const video = tracks.find((track) => track instanceof LocalVideoTrack);
    const settings = video?.mediaStreamTrack.getSettings() as
      { displaySurface?: string } | undefined;
    setSurface(sharedSurfaceLabel(settings?.displaySurface));
    return tracks;
  }, []);

  const publishScreen = useCallback(async (room: Room, tracks: LocalTrack[]) => {
    for (const track of tracks) {
      await room.localParticipant.publishTrack(track, SCREEN_PUBLISH_OPTIONS);
    }
    setSharingScreen(true);
  }, []);

  const start = useCallback(async () => {
    if (!matchId) return;
    if (supported === false) {
      setError("This browser cannot share a screen. Use a desktop browser.");
      setPhase("error");
      return;
    }
    setError(null);
    setCleanupWarning(null);
    setBusy(true);
    setPhase("starting");
    let captured: LocalTrack[] = [];
    // Set once go-live has returned, which is the point from which Market
    // Square considers the stream live and starts showing it to viewers.
    let liveStreamId: string | null = null;
    try {
      captured = await captureScreen();

      const origin = window.location.origin;
      const created =
        streamRef.current ??
        (await createStream({
          title: broadcastTitle(whiteName, blackName),
          description: broadcastDescription(origin, matchId),
          deepLink: matchDeepLink(matchId),
        }));
      streamRef.current = created;
      setStream(created);

      const { stream: live, ingest } = await goLive(created.id);
      liveStreamId = created.id;
      setStream(live);
      if (!ingest.url || !ingest.roomToken) {
        throw new Error(
          "Market Square returned no browser publishing credentials, so this stream can only be fed by RTMP."
        );
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      // Covers both the browser's own stop-sharing bar and our stop button:
      // the SDK unpublishes the track either way and reports it here.
      room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
        if (publication.source === Track.Source.ScreenShare) {
          setSharingScreen(false);
          setSurface(null);
          setPhase((current) => (current === "live" ? "share-stopped" : current));
        }
        if (publication.source === Track.Source.Camera) setSharingCamera(false);
      });
      await room.connect(ingest.url, ingest.roomToken);
      roomRef.current = room;

      await publishScreen(room, captured);
      setPhase("live");
    } catch (caught) {
      stopTracks(captured);
      await teardown();
      // Past go-live the stream is live on Market Square. If publishing then
      // failed, viewers get a live badge over an empty stage, so end it rather
      // than leaving it for the orphan reaper's grace window. This is cleanup:
      // whatever it does, the failure the user is told about is the one that
      // got us here, not this.
      if (liveStreamId) {
        try {
          setStream(await endStream(liveStreamId));
          streamRef.current = null;
        } catch (cleanupFailed) {
          console.warn(
            "Could not end the Market Square stream after a failed publish:",
            liveStreamId,
            cleanupFailed
          );
          setCleanupWarning(
            "Nothing is going out from this page, but Market Square may still show the stream as live until the service reaps it."
          );
        }
      }
      if (isPickerCancel(caught)) {
        setPhase(streamRef.current ? "share-stopped" : "idle");
      } else {
        setError(
          errorCode(caught) === "FORBIDDEN"
            ? "Market Square would not create the stream: this account is not a creator yet."
            : messageOf(caught, "Could not start the broadcast.")
        );
        setPhase("error");
      }
    } finally {
      setBusy(false);
    }
  }, [matchId, supported, whiteName, blackName, captureScreen, publishScreen, teardown]);

  // After the user stops sharing from the browser's own bar the page cannot
  // restart capture on its own: the activation is gone and clicking the
  // browser chip is not a page event. This needs its own click, which is why
  // the panel shows a resume button rather than retrying silently.
  const resumeScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      await start();
      return;
    }
    setBusy(true);
    setError(null);
    let captured: LocalTrack[] = [];
    try {
      captured = await captureScreen();
      await publishScreen(room, captured);
      setPhase("live");
    } catch (caught) {
      stopTracks(captured);
      if (!isPickerCancel(caught)) {
        setError(messageOf(caught, "Could not restart the screen share."));
      }
    } finally {
      setBusy(false);
    }
  }, [start, captureScreen, publishScreen]);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    setBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      setSharingCamera(enabled);
    } catch (caught) {
      setSharingCamera(false);
      if (!isPickerCancel(caught)) {
        setError(messageOf(caught, "Could not turn the camera on."));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    const current = streamRef.current;
    setBusy(true);
    setPhase("ending");
    try {
      await teardown();
      if (current) setStream(await endStream(current.id));
      streamRef.current = null;
      setPhase("ended");
    } catch (caught) {
      // The room is already down, so publishing has stopped either way. Say
      // what is unresolved rather than claiming a clean end.
      setError(
        messageOf(caught, "Stopped publishing, but Market Square did not confirm the stream ended.")
      );
      setPhase("end-failed");
    } finally {
      setBusy(false);
    }
  }, [teardown]);

  // The role read is the gate on the whole panel, so a failed read needs a way
  // back rather than a dead end.
  const refetchProfile = profile.refetch;
  const recheckRole = useCallback(async () => {
    await refetchProfile();
  }, [refetchProfile]);

  const applyForCreatorRole = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      await applyForCreator("I play chess on Ark and want to broadcast my matches.");
    } catch (caught) {
      setError(messageOf(caught, "Could not send the creator application."));
      throw caught;
    } finally {
      setApplying(false);
    }
  }, []);

  return {
    phase: isCreator === false && phase === "idle" ? "not-creator" : phase,
    supported,
    isCreator,
    roleUnavailable: profile.isError,
    stream,
    sharingScreen,
    sharingCamera,
    surface,
    error,
    cleanupWarning,
    busy,
    applying,
    start,
    stop,
    recheckRole,
    applyForCreatorRole,
    resumeScreenShare,
    setCameraEnabled,
    dismissError: () => {
      setError(null);
      setCleanupWarning(null);
    },
  };
}
