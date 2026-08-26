"use client";

// The LiveKit half of a broadcast, with no opinion about where the room
// credentials came from. Hosting and joining differ only in that: a host gets
// its token from go-live, a guest gets one from an approved speaker request.
// Everything after "connect with this url and token" is identical, and lives
// here once.
//
// Ordering matters. getDisplayMedia requires transient user activation, which
// is a short window opened by a click and consumed by the first await. Any
// network round-trip taken before the picker spends that activation and leaves
// the picker call to fail with InvalidStateError. `captureScreen` must
// therefore be the first await after the click; the caller then does its
// network work and publishes the tracks it already holds.
//
// Screen and camera are published as two separate tracks, distinguished on the
// viewer side by Track.Source.ScreenShare and Track.Source.Camera. Nothing is
// composited here; see the note in the panel about the picture-in-picture.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DisconnectReason,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrack,
  type LocalTrackPublication,
} from "livekit-client";
import {
  arkViewCaptureConstraints,
  screenCaptureConstraints,
  screenPublishOptions,
  sharedSurfaceLabel,
  type BroadcastContent,
} from "@/lib/broadcast/broadcast";

export interface BroadcastRoomState {
  sharingScreen: boolean;
  sharingCamera: boolean;
  /** The surface the user actually picked, once the browser reports it. */
  surface: string | null;
}

export interface BroadcastRoomControls {
  /** Must be the first await after the click. Does not publish. */
  captureScreen: (scope?: "screen" | "ark-view") => Promise<LocalTrack[]>;
  /** Hold the outgoing video without leaving the room. Reversible. */
  setVideoSuspended: (suspended: boolean) => Promise<void>;
  connect: (url: string, token: string) => Promise<Room>;
  publishScreen: (room: Room, tracks: LocalTrack[]) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  /** The connected room, or null when this session is not publishing. */
  current: () => Room | null;
  disconnect: () => Promise<void>;
  stopTracks: (tracks: LocalTrack[]) => void;
}

export interface BroadcastRoomOptions {
  content: BroadcastContent;
  /** The screen share stopped: our button, or the browser's own bar. */
  onScreenShareStopped: () => void;
  /**
   * The room went away without us asking. For a guest this is the host ending
   * the broadcast, or the service reaping it after the host disconnected.
   */
  onRoomClosed: () => void;
  /** The connection dropped and the SDK is retrying. */
  onReconnecting: () => void;
  onReconnected: () => void;
}

export function useBroadcastRoom({
  content,
  onScreenShareStopped,
  onRoomClosed,
  onReconnecting,
  onReconnected,
}: BroadcastRoomOptions): BroadcastRoomState & BroadcastRoomControls {
  const [sharingScreen, setSharingScreen] = useState(false);
  const [sharingCamera, setSharingCamera] = useState(false);
  const [surface, setSurface] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  // A disconnect we asked for and one done to us look the same on the event.
  // This is what tells them apart, so leaving does not report itself as the
  // host ending the stream.
  const leavingRef = useRef(false);

  // Callbacks are rebuilt by the caller on every render; reading them through
  // a ref keeps the room's event handlers stable and current at once. Written
  // after commit rather than during render, and safe to do so: a room only
  // exists after a connect, which is itself an effect of a click.
  const handlers = useRef({ onScreenShareStopped, onRoomClosed, onReconnecting, onReconnected });
  useEffect(() => {
    handlers.current = { onScreenShareStopped, onRoomClosed, onReconnecting, onReconnected };
  });

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    leavingRef.current = true;
    setSharingScreen(false);
    setSharingCamera(false);
    setSurface(null);
    if (room) await room.disconnect();
    leavingRef.current = false;
  }, []);

  // Drop the connection if the component unmounts while publishing, which is
  // also what ends a broadcast when its page is left.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  // getDisplayMedia directly rather than the SDK's createLocalScreenTracks:
  // the constraint that removes "Entire Screen" from the picker is not in
  // LiveKit's typed options, and going through the SDK would drop it.
  const captureScreen = useCallback(
    async (scope: "screen" | "ark-view" = "screen"): Promise<LocalTrack[]> => {
      const media = await navigator.mediaDevices.getDisplayMedia(
        scope === "ark-view"
          ? arkViewCaptureConstraints(content)
          : screenCaptureConstraints(content)
      );
      const [video] = media.getVideoTracks();
      if (!video) {
        for (const track of media.getTracks()) track.stop();
        throw new Error("The screen picker returned no video.");
      }
      video.contentHint = content;
      const settings = video.getSettings() as { displaySurface?: string };
      setSurface(sharedSurfaceLabel(settings.displaySurface));
      // The browser's own "Stop sharing" button fires this, and it is the most
      // common source of a session that looks live but is sending nothing.
      // Reconciled here rather than waiting for the SDK to notice the unpublish.
      video.addEventListener("ended", () => {
        setSharingScreen(false);
        setSurface(null);
        handlers.current.onScreenShareStopped();
      });
      return [new LocalVideoTrack(video, undefined, true)];
    },
    [content]
  );

  /**
   * Stop sending video without leaving the room, so a viewer keeps the session
   * and the audio and sees a held frame rather than a dead stream. This is
   * what a sensitive route does, and it has to be reversible.
   */
  const setVideoSuspended = useCallback(async (suspended: boolean) => {
    const connected = roomRef.current;
    if (!connected) return;
    for (const publication of connected.localParticipant.videoTrackPublications.values()) {
      const track = publication.track;
      if (!track) continue;
      if (suspended) await track.mute();
      else await track.unmute();
    }
  }, []);

  const connect = useCallback(async (url: string, token: string): Promise<Room> => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    // Covers both the browser's own stop-sharing bar and our stop button: the
    // SDK unpublishes the track either way and reports it here.
    room.on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        setSharingScreen(false);
        setSurface(null);
        handlers.current.onScreenShareStopped();
      }
      if (publication.source === Track.Source.Camera) setSharingCamera(false);
    });
    // The room closing under a guest is how the host ending the broadcast
    // reaches them: there is no separate notification, and the guest cannot
    // end a stream it does not own. A client-initiated disconnect reports the
    // same event, which is what `leavingRef` filters out.
    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      if (leavingRef.current || reason === DisconnectReason.CLIENT_INITIATED) return;
      roomRef.current = null;
      setSharingScreen(false);
      setSharingCamera(false);
      setSurface(null);
      handlers.current.onRoomClosed();
    });
    // The network dropped. LiveKit retries on its own; the session turns the
    // bar amber and gives up at a deadline rather than dying silently.
    room.on(RoomEvent.Reconnecting, () => handlers.current.onReconnecting());
    room.on(RoomEvent.Reconnected, () => handlers.current.onReconnected());
    await room.connect(url, token);
    roomRef.current = room;
    return room;
  }, []);

  const publishScreen = useCallback(
    async (room: Room, tracks: LocalTrack[]) => {
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track, screenPublishOptions(content));
      }
      setSharingScreen(true);
    },
    [content]
  );

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(enabled);
    setSharingCamera(enabled);
  }, []);

  const stopTracks = useCallback((tracks: LocalTrack[]) => {
    for (const track of tracks) track.stop();
  }, []);

  return {
    sharingScreen,
    sharingCamera,
    surface,
    captureScreen,
    setVideoSuspended,
    connect,
    publishScreen,
    setCameraEnabled,
    current: () => roomRef.current,
    disconnect,
    stopTracks,
  };
}
