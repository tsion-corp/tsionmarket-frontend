"use client";

// A game's broadcast, expressed against the app-wide session.
//
// The session (mounted above the router) owns the LiveKit room, the Market
// Square stream and everything that must survive navigation. This hook owns
// what is specific to broadcasting a GAME:
//
//  - discovery: which live streams already point at this exact match, so the
//    second player joins one broadcast instead of starting a rival stream
//  - the speaker-request choreography that gets them publish rights
//  - the host's pending queue, answerable without leaving the board
//
// Nothing here holds a room. Navigating from the chess board to the portfolio
// mid-broadcast keeps the stream alive because the room was never here.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  applyForCreator,
  canBroadcast,
  fetchMarketSquareProfile,
  fetchMySpeakerRequest,
  fetchSpeakerQueue,
  fetchSpeakerToken,
  findLiveStreamsForRef,
  requestToSpeak,
  resolveSpeakerRequest,
  type MarketSquareStream,
  type SpeakerQueueEntry,
} from "@/lib/api/market-square";
import { joinableStreams, type BroadcastContent } from "@/lib/broadcast/broadcast";
import { encodeGameRef, gameDeepLink, type BroadcastGameId } from "@/lib/broadcast/deep-link";
import {
  useBroadcastSession,
  type BroadcastTarget,
} from "@/components/broadcast/broadcast-session";
import { errorCode } from "@/lib/api/envelope";
import type { BroadcastPhase, BroadcastRole } from "@/lib/broadcast/broadcast";

const APPROVAL_POLL_MS = 3_000;
const QUEUE_POLL_MS = 5_000;
const DISCOVERY_POLL_MS = 15_000;

/** Everything that differs between one game's broadcast and another's. */
export interface GameBroadcastTarget {
  game: BroadcastGameId;
  /** The thing being broadcast: a match id, a draw id, a game id. */
  ref: string;
  title: string;
  watchPath: string;
  descriptionLead: string;
  content: BroadcastContent;
  creatorApplicationNote: string;
}

export interface GameBroadcastState {
  phase: BroadcastPhase;
  role: BroadcastRole | null;
  supported: boolean | null;
  isCreator: boolean | null;
  roleUnavailable: boolean;
  stream: MarketSquareStream | null;
  joinable: MarketSquareStream[];
  discovering: boolean;
  pendingSpeakers: SpeakerQueueEntry[];
  sharingScreen: boolean;
  sharingCamera: boolean;
  surface: string | null;
  error: string | null;
  cleanupWarning: string | null;
  busy: boolean;
  applying: boolean;
  resolving: string[];
}

export interface GameBroadcastActions {
  start: () => Promise<void>;
  join: (streamId: string) => Promise<void>;
  cancelJoin: () => Promise<void>;
  approveSpeaker: (requestId: string) => Promise<void>;
  declineSpeaker: (requestId: string) => Promise<void>;
  stop: () => Promise<void>;
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

/** The game target expressed as something the session can broadcast. */
function toSessionTarget(target: GameBroadcastTarget): BroadcastTarget {
  return {
    title: target.title,
    watchPath: target.watchPath,
    descriptionLead: target.descriptionLead,
    content: target.content,
    // A game broadcast keeps kind "game": Market Square routes it straight back
    // to the board, which is exactly what a spectator of a match wants.
    deepLink: gameDeepLink(target.game, target.ref),
    creatorApplicationNote: target.creatorApplicationNote,
  };
}

export function useGameBroadcast(
  target: GameBroadcastTarget | null
): GameBroadcastState & GameBroadcastActions {
  const session = useBroadcastSession();
  const [applying, setApplying] = useState(false);
  const [resolving, setResolving] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const joinRef = useRef<{ streamId: string; requestId: string } | null>(null);
  const joinedStreamRef = useRef<MarketSquareStream | null>(null);

  const deepLinkRef = target ? encodeGameRef(target.game, target.ref) : null;

  const profile = useQuery({
    queryKey: ["market-square", "me"],
    queryFn: fetchMarketSquareProfile,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const isCreator = profile.data ? canBroadcast(profile.data.role) : null;
  const myUserId = profile.data?.id ?? null;

  const phase = session.phase;
  const idle = phase === "idle" || phase === "not-creator" || phase === "ended";
  const discovery = useQuery({
    queryKey: ["market-square", "live-for-ref", deepLinkRef],
    queryFn: () => findLiveStreamsForRef(deepLinkRef as string),
    enabled: deepLinkRef !== null,
    refetchInterval: idle ? DISCOVERY_POLL_MS : false,
    staleTime: DISCOVERY_POLL_MS,
    retry: 1,
  });
  const joinable = joinableStreams(discovery.data ?? [], myUserId);

  // Only the host of THIS session's stream reads a queue, and only while the
  // broadcast it belongs to is the one running.
  const hosting = session.role === "host" && (phase === "live" || phase === "share-stopped");
  const hostStreamId = hosting ? (session.stream?.id ?? null) : null;
  const queue = useQuery({
    queryKey: ["market-square", "speaker-queue", hostStreamId],
    queryFn: () => fetchSpeakerQueue(hostStreamId as string),
    enabled: hostStreamId !== null,
    refetchInterval: QUEUE_POLL_MS,
    retry: 1,
  });
  const pendingSpeakers = hostStreamId ? (queue.data ?? []) : [];

  // Capture first, then hand the tracks to the session: getDisplayMedia needs
  // the click's transient user activation and the session's network work would
  // spend it.
  const start = useCallback(async () => {
    if (!target) return;
    if (session.supported === false) {
      setLocalError("This browser cannot share a screen. Use a desktop browser.");
      return;
    }
    setLocalError(null);
    const capture = await session.captureScreen(target.content).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "NotAllowedError") return null;
      setLocalError(messageOf(caught, "Could not start the broadcast."));
      return null;
    });
    if (!capture) return;
    await session.goLiveWith({ target: toSessionTarget(target), mode: "screen", capture });
  }, [target, session]);

  const publishAsGuest = useCallback(
    async (streamId: string, url: string | null, token: string | null) => {
      const grant = url && token ? { url, token } : await fetchSpeakerToken(streamId);
      const joined = joinedStreamRef.current;
      const pending = joinRef.current;
      if (!joined || !pending || !target) return;
      await session.attachAsGuest({
        target: toSessionTarget(target),
        attachment: {
          stream: joined,
          url: grant.url,
          token: grant.token,
          requestId: pending.requestId,
        },
      });
    },
    [session, target]
  );

  const join = useCallback(
    async (streamId: string) => {
      setLocalError(null);
      joinedStreamRef.current =
        (discovery.data ?? []).find((candidate) => candidate.id === streamId) ?? null;
      try {
        const request = await requestToSpeak(streamId);
        joinRef.current = { streamId, requestId: request.id };
        if (request.status === "approved") {
          await publishAsGuest(streamId, request.joinUrl, request.joinToken);
          return;
        }
        session.beginJoin({ streamId, requestId: request.id });
      } catch (caught) {
        joinRef.current = null;
        setLocalError(
          errorCode(caught) === "FORBIDDEN"
            ? "That broadcast is not letting people in, so it cannot be joined."
            : messageOf(caught, "Could not ask to join that broadcast.")
        );
      }
    },
    [discovery.data, publishAsGuest, session]
  );

  useEffect(() => {
    if (phase !== "joining") return;
    const pending = joinRef.current;
    if (!pending) return;
    let cancelled = false;

    const check = async () => {
      try {
        const mine = await fetchMySpeakerRequest(pending.streamId);
        if (cancelled) return;
        if (!mine || mine.status === "withdrawn") {
          joinRef.current = null;
          session.abandonJoin();
          return;
        }
        if (mine.status === "denied" || mine.status === "removed") {
          joinRef.current = null;
          session.declineJoin();
          return;
        }
        if (mine.status === "approved") {
          await publishAsGuest(pending.streamId, mine.joinUrl, mine.joinToken);
        }
      } catch (caught) {
        if (cancelled) return;
        console.warn("Could not read the speaker request:", caught);
      }
    };

    const timer = setInterval(() => void check(), APPROVAL_POLL_MS);
    void check();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, publishAsGuest, session]);

  const cancelJoin = useCallback(async () => {
    const pending = joinRef.current;
    joinRef.current = null;
    session.abandonJoin();
    if (!pending) return;
    try {
      await resolveSpeakerRequest(pending.streamId, pending.requestId, "leave");
    } catch (caught) {
      console.warn("Could not withdraw the speaker request:", caught);
    }
  }, [session]);

  const resolveQueued = useCallback(
    async (requestId: string, action: "approve" | "decline") => {
      const streamId = session.stream?.id;
      if (!streamId) return;
      setResolving((current) => [...current, requestId]);
      try {
        await resolveSpeakerRequest(streamId, requestId, action);
        await queue.refetch();
      } catch (caught) {
        setLocalError(
          messageOf(
            caught,
            action === "approve"
              ? "Could not let them into the broadcast."
              : "Could not decline that request."
          )
        );
      } finally {
        setResolving((current) => current.filter((id) => id !== requestId));
      }
    },
    [queue, session.stream]
  );

  const approveSpeaker = useCallback(
    (requestId: string) => resolveQueued(requestId, "approve"),
    [resolveQueued]
  );
  const declineSpeaker = useCallback(
    (requestId: string) => resolveQueued(requestId, "decline"),
    [resolveQueued]
  );

  const stop = useCallback(async () => {
    joinRef.current = null;
    await session.stop();
  }, [session]);

  const refetchProfile = profile.refetch;
  const recheckRole = useCallback(async () => {
    await refetchProfile();
  }, [refetchProfile]);

  const applyForCreatorRole = useCallback(async () => {
    setApplying(true);
    setLocalError(null);
    try {
      await applyForCreator(target?.creatorApplicationNote ?? "");
    } catch (caught) {
      setLocalError(messageOf(caught, "Could not send the creator application."));
      throw caught;
    } finally {
      setApplying(false);
    }
  }, [target]);

  return {
    phase: isCreator === false && phase === "idle" && joinable.length === 0 ? "not-creator" : phase,
    role: session.role,
    supported: session.supported,
    isCreator,
    roleUnavailable: profile.isError,
    stream: session.stream,
    joinable,
    discovering: discovery.isPending && deepLinkRef !== null,
    pendingSpeakers,
    sharingScreen: session.sharingScreen,
    sharingCamera: session.sharingCamera,
    surface: session.surface,
    error: localError ?? session.error,
    cleanupWarning: session.cleanupWarning,
    busy: session.busy,
    applying,
    resolving,
    start,
    join,
    cancelJoin,
    approveSpeaker,
    declineSpeaker,
    stop,
    recheckRole,
    applyForCreatorRole,
    resumeScreenShare: session.resumeScreenShare,
    setCameraEnabled: session.setCameraEnabled,
    dismissError: () => {
      setLocalError(null);
      session.dismissError();
    },
  };
}
