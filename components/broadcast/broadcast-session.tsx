"use client";

// The one broadcast session in the app, mounted above the router.
//
// This is the whole reason the provider lives here rather than inside a
// screen. A LiveKit room is held by the component that created it, so a room
// created by the chess board dies the moment the user navigates to their
// portfolio. Ark's premise is that a broadcast covers ANY surface, so the room,
// its tracks, the stream it is publishing to and every piece of session state
// live above the router and survive every route change.
//
// What the session owns:
//  - the room and its tracks (through `useBroadcastRoom`)
//  - the Market Square stream lifecycle: create, go live, end
//  - attaching to somebody else's stream as an approved guest
//  - the financial-data guard: suspending video on a sensitive route
//  - page lifecycle: backgrounding, unload, reconnect, auto-end
//
// What it does not own: how a caller found the stream to join, and what a
// particular game wants to call itself. Those stay with the caller.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { errorCode } from "@/lib/api/envelope";
import {
  createStream,
  endStream,
  goLive,
  resolveSpeakerRequest,
  type MarketSquareDeepLink,
  type MarketSquareStream,
} from "@/lib/api/market-square";
import {
  broadcastDescription,
  capTitle,
  screenShareSupported,
  shouldWarnOnLeave,
  type BroadcastContent,
  type BroadcastPhase,
  type BroadcastRole,
} from "@/lib/broadcast/broadcast";
import { describeFindings, findUnmarkedSensitive } from "@/lib/broadcast/unmarked-money";
import { useBroadcastRoom } from "@/hooks/use-broadcast-room";
import {
  BLUR_CLASS,
  BROADCASTING_CLASS,
  sensitivePathReason,
  suspendReasonInDom,
  type SuspendReason,
} from "@/lib/broadcast/sensitive";

/**
 * What the user chose to send. "ark" composes in-app and never calls
 * getDisplayMedia at all, which is the only path that cannot leak anything
 * outside Ark; it is the default for exactly that reason.
 */
export type ShareMode = "ark" | "camera-ark" | "screen";

/** Everything that differs between one broadcast and another. */
export interface BroadcastTarget {
  title: string;
  /** Path on this origin a viewer opens to follow along. */
  watchPath: string;
  descriptionLead: string;
  content: BroadcastContent;
  /**
   * Where Market Square sends a viewer who taps through. Null for a general
   * Ark broadcast: see the note on `deepLinkFor` in the console.
   */
  deepLink: MarketSquareDeepLink | null;
  creatorApplicationNote: string;
}

/** Credentials for a stream this session does not own. */
export interface GuestAttachment {
  stream: MarketSquareStream;
  url: string;
  token: string;
  /** The approved speaker request, so leaving can step the guest down. */
  requestId: string;
}

export interface BroadcastSession {
  phase: BroadcastPhase;
  role: BroadcastRole | null;
  target: BroadcastTarget | null;
  mode: ShareMode | null;
  stream: MarketSquareStream | null;
  /** null until the browser has been checked after mount. */
  supported: boolean | null;
  /** Wall-clock start, so elapsed survives backgrounding. */
  startedAt: number | null;
  elapsedMs: number;
  /** People connected to the room, or null when it cannot be known. */
  viewers: number | null;
  surface: string | null;
  sharingScreen: boolean;
  sharingCamera: boolean;
  muted: boolean;
  connection: "connected" | "reconnecting";
  reconnectingSince: number | null;
  /** How long the current reconnect has been running. */
  reconnectingMs: number;
  suspended: SuspendReason | null;
  blurSensitive: boolean;
  error: string | null;
  cleanupWarning: string | null;
  busy: boolean;
  /** True while any broadcast is running, which is what the bar renders on. */
  live: boolean;
}

export interface BroadcastSessionActions {
  /**
   * Start hosting. `capture` must already hold the tracks the picker
   * produced: getDisplayMedia needs the click's transient user activation, so
   * the caller captures first and hands the result here.
   */
  goLiveWith: (input: {
    target: BroadcastTarget;
    mode: ShareMode;
    capture: import("livekit-client").LocalTrack[];
  }) => Promise<void>;
  /**
   * A join request is in flight. Held by the session, not the caller, so that
   * navigating away from the game while waiting for the host does not throw
   * away the request.
   */
  beginJoin: (pending: { streamId: string; requestId: string }) => void;
  abandonJoin: () => void;
  declineJoin: () => void;
  /** Publish into a stream somebody else owns. */
  attachAsGuest: (input: { target: BroadcastTarget; attachment: GuestAttachment }) => Promise<void>;
  /**
   * Capture a surface. Must be the first await after a click, because
   * getDisplayMedia needs the click's transient user activation.
   * "ark-view" pre-selects this tab, so only Ark can be picked.
   */
  captureScreen: (
    content: BroadcastContent,
    scope?: "screen" | "ark-view"
  ) => Promise<import("livekit-client").LocalTrack[]>;
  stop: () => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  resumeScreenShare: () => Promise<void>;
  setBlurSensitive: (blur: boolean) => void;
  /** Reported by PrivyModalWatch; see the note there on why it lives outside. */
  setPrivyModalOpen: (open: boolean) => void;
  dismissError: () => void;
  /** Reset a terminal phase back to idle so the control offers a fresh start. */
  reset: () => void;
}

type Session = BroadcastSession & BroadcastSessionActions;

const SessionContext = createContext<Session | null>(null);

// How long a reconnect is allowed to run before the session gives up. Never
// silent: the bar counts up in amber the whole time.
const RECONNECT_LIMIT_MS = 60_000;
// The bar's clock. Every tick recomputes from the start timestamp rather than
// accumulating, so background throttling cannot make it drift.
const CLOCK_TICK_MS = 1_000;

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// Screen-share support cannot change during a session, so the store has
// nothing to notify and the server has no answer at all.
const noSubscription = () => () => {};
const unknownOnServer = () => null;

function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export function useBroadcastSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useBroadcastSession must be used within BroadcastSessionProvider");
  }
  return session;
}

/**
 * The session as an optional dependency, for a component that renders whether
 * or not the provider is above it. Returns null instead of throwing.
 */
export function useOptionalBroadcastSession(): Session | null {
  return useContext(SessionContext);
}

export function BroadcastSessionProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<BroadcastPhase>("idle");
  const [role, setRole] = useState<BroadcastRole | null>(null);
  const [target, setTarget] = useState<BroadcastTarget | null>(null);
  const [mode, setMode] = useState<ShareMode | null>(null);
  const [stream, setStream] = useState<MarketSquareStream | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // The clock ticks a wall-clock reading; elapsed is derived from it and the
  // start timestamp during render. An accumulating counter loses minutes to
  // background throttling, and elapsed time is the one number a broadcaster
  // checks against the clock on the wall.
  const [now, setNow] = useState(() => Date.now());
  const [viewers, setViewers] = useState<number | null>(null);
  const [muted, setMutedState] = useState(false);
  const [connection, setConnection] = useState<"connected" | "reconnecting">("connected");
  const [reconnectingSince, setReconnectingSince] = useState<number | null>(null);
  const [domSuspend, setDomSuspend] = useState<SuspendReason | null>(null);
  // Reported by PrivyModalWatch, which owns the dependency on Privy so the
  // session does not. Null-safe by construction: a tree with no watcher simply
  // leaves this false and falls back to the DOM check below.
  const [privyModalOpen, setPrivyModalOpen] = useState(false);
  const [blurSensitive, setBlurSensitiveState] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupWarning, setCleanupWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<MarketSquareStream | null>(null);
  const guestRef = useRef<{ streamId: string; requestId: string } | null>(null);
  const [content, setContent] = useState<BroadcastContent>("detail");

  // Read through useSyncExternalStore so the server renders "unknown" and the
  // client resolves it after hydration. The answer never changes during a
  // session, so there is nothing to subscribe to.
  const supported = useSyncExternalStore<boolean | null>(
    noSubscription,
    screenShareSupported,
    unknownOnServer
  );

  const onScreenShareStopped = useCallback(() => {
    setPhase((current) => (current === "live" ? "share-stopped" : current));
  }, []);

  const onRoomClosed = useCallback(() => {
    guestRef.current = null;
    setPhase("host-ended");
    setStartedAt(null);
  }, []);

  const onReconnecting = useCallback(() => {
    setConnection("reconnecting");
    setReconnectingSince((current) => current ?? Date.now());
  }, []);

  const onReconnected = useCallback(() => {
    setConnection("connected");
    setReconnectingSince(null);
  }, []);

  const room = useBroadcastRoom({
    content,
    onScreenShareStopped,
    onRoomClosed,
    onReconnecting,
    onReconnected,
  });

  const live = phase === "live" || phase === "share-stopped" || phase === "starting";

  // ------------------------------------------------------------- the clock
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [startedAt]);

  const elapsedMs = startedAt === null ? 0 : Math.max(0, now - startedAt);
  const reconnectingMs = reconnectingSince === null ? 0 : Math.max(0, now - reconnectingSince);

  // ------------------------------------------------- the financial guard
  //
  // Route-based suspend. A user who is streaming their portfolio and then
  // navigates to export a key must not broadcast it, and must not have to
  // remember to stop first.
  const pathname = usePathname();
  // Route-based suspend, derived rather than stored: a user who is streaming
  // their portfolio and then navigates to export a key must not broadcast it,
  // and must not have to remember to stop first.
  const routeSuspend = sensitivePathReason(pathname ?? "/");

  // Presence-based suspend, for the surfaces that are modals rather than
  // routes: order confirmation, transaction signing, and Privy's own wallet
  // dialog where key export and recovery live. Privy portals into document.body
  // and cannot be wrapped, so the observer watches the body for it by id.
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const read = () => setDomSuspend(suspendReasonInDom(document));
    const observer = new MutationObserver(read);
    observer.observe(document.body, { childList: true, subtree: true });
    // Deferred out of the effect body so the first read is a subscription
    // callback like every later one, not a synchronous render cascade.
    const initial = setTimeout(read, 0);
    return () => {
      observer.disconnect();
      clearTimeout(initial);
    };
  }, []);

  // What is on screen outranks the route: a signing sheet or Privy's wallet
  // dialog is the more specific reason, and either can open on a route that is
  // otherwise perfectly safe to broadcast.
  // Privy's dialog is the most specific and most serious signal: it is the one
  // surface that can put a recovery phrase on screen.
  const suspended: SuspendReason | null = !live
    ? null
    : privyModalOpen
      ? "keys"
      : (domSuspend ?? routeSuspend);

  // Apply the suspend to the wire. Held, not stopped: the viewer keeps the
  // session and hears audio, and it resumes on leaving the screen.
  useEffect(() => {
    if (!live) return;
    void room.setVideoSuspended(suspended !== null);
  }, [suspended, live, room]);

  // The root classes the blur rule keys off. Set on the element rather than
  // passed down so any component anywhere can mark itself sensitive without
  // knowing the session exists.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(BROADCASTING_CLASS, live);
    root.classList.toggle(BLUR_CLASS, live && blurSensitive);
    return () => {
      root.classList.remove(BROADCASTING_CLASS);
      root.classList.remove(BLUR_CLASS);
    };
  }, [live, blurSensitive]);

  // ---------------------------------------------------------- page lifecycle

  useEffect(() => {
    if (!shouldWarnOnLeave(phase)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  // Backgrounding stops the camera on most mobile browsers, so the camera is
  // re-acquired on return rather than assumed to have survived. Video is held
  // while hidden; audio keeps flowing, which is what a listener notices.
  useEffect(() => {
    if (!live) return;
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      void room.setVideoSuspended(hidden || suspended !== null);
      if (!hidden && room.sharingCamera) {
        void room.setCameraEnabled(true).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [live, suspended, room]);

  // The tab is going away for good. A fetch would be cancelled with the page,
  // so the end goes out as a beacon: viewers see "ended" rather than a frozen
  // last frame. The proxy reads the Privy session from the cookie, which is
  // the only credential a beacon can carry.
  useEffect(() => {
    if (!live) return;
    const onPageHide = () => {
      const hosted = streamRef.current;
      if (!hosted || typeof navigator.sendBeacon !== "function") return;
      navigator.sendBeacon(
        `/api/market-square/streams/${hosted.id}/end`,
        new Blob([], {
          type: "application/json",
        })
      );
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [live]);

  // Viewers, read off the room rather than from stats: the service reports
  // peak and unique, not who is watching now, and a wrong number on a live bar
  // is worse than no number.
  useEffect(() => {
    if (!live) return;
    const read = () => {
      const connected = room.current();
      setViewers(connected ? connected.numParticipants - 1 : null);
    };
    read();
    const timer = setInterval(read, 5_000);
    return () => clearInterval(timer);
  }, [live, room]);

  // ------------------------------------------------------------- teardown

  const finishLocally = useCallback(() => {
    guestRef.current = null;
    streamRef.current = null;
    setRole(null);
    setStartedAt(null);
    setViewers(null);
    setMode(null);
    setDomSuspend(null);
  }, []);

  const stop = useCallback(async () => {
    const hosted = streamRef.current;
    const guest = guestRef.current;
    setBusy(true);
    setPhase("ending");
    try {
      await room.disconnect();
      if (role === "guest" || !hosted) {
        if (guest) await resolveSpeakerRequest(guest.streamId, guest.requestId, "leave");
      } else {
        setStream(await endStream(hosted.id));
      }
      finishLocally();
      setPhase("ended");
    } catch (caught) {
      finishLocally();
      setError(
        messageOf(caught, "Stopped publishing, but Market Square did not confirm the stream ended.")
      );
      setPhase("end-failed");
    } finally {
      setBusy(false);
    }
  }, [room, role, finishLocally]);

  // A reconnect that never lands has to end, and has to say so. Sixty seconds
  // is long enough for a tunnel and short enough that a stream does not sit
  // dead on Market Square.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    if (connection !== "reconnecting" || reconnectingSince === null) return;
    const timer = setTimeout(
      () => {
        setError("The connection did not come back, so the broadcast ended.");
        void stopRef.current();
      },
      Math.max(0, RECONNECT_LIMIT_MS - (Date.now() - reconnectingSince))
    );
    return () => clearTimeout(timer);
  }, [connection, reconnectingSince]);

  // Development-only guard audit. The `data-sensitive` sweep is a snapshot: it
  // protects what someone remembered to mark, and nothing proves a balance
  // added tomorrow gets marked too. While live in dev, scan the rendered page
  // for money- and address-shaped text with no [data-sensitive] ancestor and
  // name each one, so an unprotected field is reported rather than discovered
  // by a viewer. Never ships to production.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !live) return;
    let cancelled = false;
    const scan = () => {
      if (cancelled) return;
      const report = describeFindings(findUnmarkedSensitive(document));
      if (report) console.warn(report);
    };
    const first = setTimeout(scan, 1500);
    const repeat = setInterval(scan, 15000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, [live]);

  // -------------------------------------------------------------- starting

  const captureScreen = useCallback(
    (next: BroadcastContent, scope: "screen" | "ark-view" = "screen") => {
      setContent(next);
      return room.captureScreen(scope);
    },
    [room]
  );

  const goLiveWith = useCallback(
    async ({
      target: next,
      mode: nextMode,
      capture,
    }: {
      target: BroadcastTarget;
      mode: ShareMode;
      capture: import("livekit-client").LocalTrack[];
    }) => {
      setError(null);
      setCleanupWarning(null);
      setBusy(true);
      setPhase("starting");
      setRole("host");
      setTarget(next);
      setMode(nextMode);
      setContent(next.content);
      let liveStreamId: string | null = null;
      try {
        const origin = window.location.origin;
        const created =
          streamRef.current ??
          (await createStream({
            title: capTitle(next.title),
            description: broadcastDescription(next.descriptionLead, origin, next.watchPath),
            deepLink: next.deepLink ?? undefined,
          }));
        streamRef.current = created;
        setStream(created);

        const { stream: liveStream, ingest } = await goLive(created.id);
        liveStreamId = created.id;
        setStream(liveStream);
        if (!ingest.url || !ingest.roomToken) {
          throw new Error(
            "Market Square returned no browser publishing credentials, so this stream can only be fed by RTMP."
          );
        }

        const connected = await room.connect(ingest.url, ingest.roomToken);
        if (capture.length > 0) await room.publishScreen(connected, capture);
        // Camera comes up in EVERY mode, screen shares included. Sharing a
        // board or a chart without a face is the thing viewers complained
        // about: the screen replaced the broadcaster instead of joining them.
        // Screen and camera are separate tracks, so a viewer receives both and
        // the stage puts the shared surface on the main stage with faces
        // beside it. It stays a toggle in the console for anyone who wants to
        // be heard and not seen, and a denied camera permission is not fatal
        // to a screen share.
        await room.setCameraEnabled(true).catch(() => {});
        setStartedAt(Date.now());
        setPhase("live");
      } catch (caught) {
        room.stopTracks(capture);
        await room.disconnect();
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
          if (!streamRef.current) setRole(null);
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
    },
    [room]
  );

  const beginJoin = useCallback((pending: { streamId: string; requestId: string }) => {
    guestRef.current = pending;
    setRole("guest");
    setPhase("joining");
  }, []);

  const abandonJoin = useCallback(() => {
    guestRef.current = null;
    setRole(null);
    setPhase("idle");
  }, []);

  const declineJoin = useCallback(() => {
    guestRef.current = null;
    setRole(null);
    setPhase("join-declined");
  }, []);

  const attachAsGuest = useCallback(
    async ({
      target: next,
      attachment,
    }: {
      target: BroadcastTarget;
      attachment: GuestAttachment;
    }) => {
      setTarget(next);
      setContent(next.content);
      guestRef.current = { streamId: attachment.stream.id, requestId: attachment.requestId };
      const connected = await room.connect(attachment.url, attachment.token);
      try {
        await connected.localParticipant.setCameraEnabled(true);
      } catch (cameraFailed) {
        console.warn("Joined the broadcast but could not turn the camera on:", cameraFailed);
        setError(
          "You are in the broadcast, but your camera did not start. Turn it on below to appear."
        );
      }
      setStream(attachment.stream);
      setStartedAt(Date.now());
      setMode("camera-ark");
      setRole("guest");
      setPhase("live");
    },
    [room]
  );

  const resumeScreenShare = useCallback(async () => {
    const connected = room.current();
    if (!connected) return;
    setBusy(true);
    setError(null);
    let captured: import("livekit-client").LocalTrack[] = [];
    try {
      captured = await room.captureScreen();
      await room.publishScreen(connected, captured);
      setPhase("live");
    } catch (caught) {
      room.stopTracks(captured);
      if (!isPickerCancel(caught)) {
        setError(messageOf(caught, "Could not restart the screen share."));
      }
    } finally {
      setBusy(false);
    }
  }, [room]);

  const setCameraEnabled = useCallback(
    async (enabled: boolean) => {
      setBusy(true);
      try {
        await room.setCameraEnabled(enabled);
      } catch (caught) {
        if (!isPickerCancel(caught)) setError(messageOf(caught, "Could not turn the camera on."));
      } finally {
        setBusy(false);
      }
    },
    [room]
  );

  const setMuted = useCallback(
    async (next: boolean) => {
      const connected = room.current();
      if (!connected) return;
      await connected.localParticipant.setMicrophoneEnabled(!next);
      setMutedState(next);
    },
    [room]
  );

  const value = useMemo<Session>(
    () => ({
      phase,
      role,
      target,
      mode,
      stream,
      supported,
      startedAt,
      elapsedMs,
      viewers,
      surface: room.surface,
      sharingScreen: room.sharingScreen,
      sharingCamera: room.sharingCamera,
      muted,
      connection,
      reconnectingSince,
      reconnectingMs,
      suspended,
      blurSensitive,
      error,
      cleanupWarning,
      busy,
      live,
      goLiveWith,
      beginJoin,
      abandonJoin,
      declineJoin,
      attachAsGuest,
      captureScreen,
      stop,
      setCameraEnabled,
      setMuted,
      resumeScreenShare,
      setBlurSensitive: setBlurSensitiveState,
      setPrivyModalOpen,
      dismissError: () => {
        setError(null);
        setCleanupWarning(null);
      },
      reset: () => setPhase("idle"),
    }),
    [
      phase,
      role,
      target,
      mode,
      stream,
      supported,
      startedAt,
      elapsedMs,
      viewers,
      room.surface,
      room.sharingScreen,
      room.sharingCamera,
      muted,
      connection,
      reconnectingSince,
      reconnectingMs,
      suspended,
      blurSensitive,
      error,
      cleanupWarning,
      busy,
      live,
      goLiveWith,
      beginJoin,
      abandonJoin,
      declineJoin,
      attachAsGuest,
      captureScreen,
      stop,
      setCameraEnabled,
      setMuted,
      resumeScreenShare,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
