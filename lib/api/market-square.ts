"use client";

// Transport for the Market Square service, as the casino broadcast flow uses
// it. Every call carries the player's Privy session, which the proxy verifies
// before forwarding. The proxy also validates the upstream payload, so the
// wire types below describe a shape that has already been judged.

import { errorStatus } from "@/lib/api/envelope";
import { createServiceClient } from "@/lib/api/service";

const marketSquare = createServiceClient(
  "/api/market-square",
  "Market Square is unavailable right now."
);

export type StreamStatus = "scheduled" | "live" | "ended" | "cancelled";
export type MarketSquareRole = "citizen" | "creator" | "ambassador" | "worldstreet";

// The service's own deep-link shape, already used by posts, feed items and
// activities. A casino broadcast points at the activity with kind "game", and
// its ref is "<game>:<id>". See `lib/broadcast/deep-link.ts`.
export type MarketSquareDeepLinkKind =
  "stream" | "store_item" | "listing" | "market" | "game" | "external";

export interface MarketSquareDeepLink {
  kind: MarketSquareDeepLinkKind;
  ref: string;
}

export interface MarketSquareStream {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: StreamStatus;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: "ended_by_host" | "host_disconnected" | null;
  /** null on a deployment whose streams do not carry a deep link yet. */
  deepLink: MarketSquareDeepLink | null;
}

// url and roomToken are what browser publishing needs. The service returns
// them null on a degraded go-live where only RTMP ingress came back, which is
// a case this flow cannot use and says so rather than pretending.
export interface StreamIngest {
  url: string | null;
  roomToken: string | null;
  rtmpUrl: string | null;
  streamKey: string | null;
}

// A speaker request is how a second person gets publish rights on a stream
// they do not own: the guest asks, the host resolves, and an approved request
// carries the LiveKit credentials the guest publishes with.
export type SpeakerRequestStatus = "pending" | "approved" | "denied" | "withdrawn" | "removed";

// approve/decline are the host's; leave is the speaker stepping down. `remove`
// (host revoking a live speaker) exists upstream but no screen here uses it.
export type SpeakerRequestAction = "approve" | "decline" | "leave";

export interface SpeakerRequest {
  id: string;
  streamId: string;
  userId: string;
  status: SpeakerRequestStatus;
  /** Present only on an approved request read back through `/me`. */
  joinUrl: string | null;
  joinToken: string | null;
  expiresAt: string | null;
}

export interface SpeakerProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** A queue entry as the host reads it, hydrated with who is asking. */
export interface SpeakerQueueEntry extends SpeakerRequest {
  profile: SpeakerProfile | null;
}

/** Publisher credentials for an approved speaker, or for the host rejoining. */
export interface SpeakerGrant {
  url: string;
  token: string;
}

export interface MarketSquareProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  role: MarketSquareRole;
}

interface StreamWire {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  status: StreamStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  endedReason?: "ended_by_host" | "host_disconnected" | null;
  deepLink?: MarketSquareDeepLink | null;
}

interface IngestWire {
  url?: string | null;
  roomToken?: string | null;
  rtmpUrl?: string | null;
  streamKey?: string | null;
}

interface SpeakerRequestWire {
  id: string;
  streamId: string;
  userId: string;
  status: SpeakerRequestStatus;
  joinUrl?: string | null;
  joinToken?: string | null;
  expiresAt?: string | null;
  profile?: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
}

interface ProfileWire {
  id: string;
  username?: string | null;
  displayName?: string | null;
  role: MarketSquareRole;
}

function toStream(wire: StreamWire): MarketSquareStream {
  return {
    id: wire.id,
    ownerId: wire.ownerId,
    title: wire.title,
    description: wire.description ?? null,
    status: wire.status,
    startedAt: wire.startedAt ?? null,
    endedAt: wire.endedAt ?? null,
    endedReason: wire.endedReason ?? null,
    deepLink: wire.deepLink ?? null,
  };
}

function toIngest(wire: IngestWire): StreamIngest {
  return {
    url: wire.url ?? null,
    roomToken: wire.roomToken ?? null,
    rtmpUrl: wire.rtmpUrl ?? null,
    streamKey: wire.streamKey ?? null,
  };
}

export function fetchMarketSquareProfile(): Promise<MarketSquareProfile> {
  return marketSquare.authedGet<ProfileWire>("/me").then((wire) => ({
    id: wire.id,
    username: wire.username ?? null,
    displayName: wire.displayName ?? null,
    role: wire.role,
  }));
}

// Only the two roles the service accepts on POST /streams can broadcast.
export function canBroadcast(role: MarketSquareRole): boolean {
  return role === "creator" || role === "worldstreet";
}

export interface CreateStreamInput {
  title: string;
  description: string;
  deepLink?: MarketSquareDeepLink;
}

// Production has not shipped deepLink on CreateStreamRequest yet, and a
// deployment that does not model a field may either ignore it or reject the
// body outright. Ignoring it is fine: the stream is created and the match link
// in the description still gets a viewer back to the board. A rejection is
// not, so a body-shaped refusal is retried once without the field rather than
// failing a go-live over a field the flow can live without. Only 400 and 422
// qualify. A 401, a 403 or a 5xx says something else and is rethrown.
function rejectedTheBody(error: unknown): boolean {
  const status = errorStatus(error);
  return status === 400 || status === 422;
}

export async function createStream(input: CreateStreamInput): Promise<MarketSquareStream> {
  const base = {
    title: input.title,
    description: input.description,
    category: "gaming",
    visibility: "public",
  };
  if (!input.deepLink) {
    return toStream(await marketSquare.post<StreamWire>("/streams", base));
  }
  try {
    return toStream(
      await marketSquare.post<StreamWire>("/streams", { ...base, deepLink: input.deepLink })
    );
  } catch (error) {
    if (!rejectedTheBody(error)) throw error;
    console.warn("Market Square rejected the stream deep link; creating without it.", error);
    return toStream(await marketSquare.post<StreamWire>("/streams", base));
  }
}

export interface GoLiveResult {
  stream: MarketSquareStream;
  ingest: StreamIngest;
}

// Idempotent upstream: calling it again on a live stream returns fresh ingest
// credentials, which is how a publisher rejoins after a dropped connection.
export function goLive(streamId: string): Promise<GoLiveResult> {
  return marketSquare
    .post<{ stream: StreamWire; ingest: IngestWire }>(`/streams/${streamId}/go-live`)
    .then((data) => ({ stream: toStream(data.stream), ingest: toIngest(data.ingest) }));
}

export function endStream(streamId: string): Promise<MarketSquareStream> {
  return marketSquare.post<StreamWire>(`/streams/${streamId}/end`).then(toStream);
}

export function applyForCreator(note: string): Promise<void> {
  return marketSquare.post<unknown>("/me/creator-application", { note }).then(() => undefined);
}

function toSpeakerRequest(wire: SpeakerRequestWire): SpeakerRequest {
  return {
    id: wire.id,
    streamId: wire.streamId,
    userId: wire.userId,
    status: wire.status,
    joinUrl: wire.joinUrl ?? null,
    joinToken: wire.joinToken ?? null,
    expiresAt: wire.expiresAt ?? null,
  };
}

function toQueueEntry(wire: SpeakerRequestWire): SpeakerQueueEntry {
  return {
    ...toSpeakerRequest(wire),
    profile: wire.profile
      ? {
          id: wire.profile.id,
          username: wire.profile.username ?? null,
          displayName: wire.profile.displayName ?? null,
          avatarUrl: wire.profile.avatarUrl ?? null,
        }
      : null,
  };
}

/**
 * Every live stream pointing at one activity.
 *
 * A list, never a single stream: two players in the same match, or two people
 * watching the same ArkBall draw, can each legitimately be broadcasting it.
 *
 * The ref is also matched here, not only upstream. `deepLinkRef` is newer than
 * the published spec, and a deployment that does not know the parameter would
 * silently ignore it and hand back every live stream on the service. Filtering
 * again on what came back costs nothing and makes an ignored filter show up as
 * "nobody is broadcasting this" rather than as an invitation to join a
 * stranger's stream.
 */
export function findLiveStreamsForRef(ref: string): Promise<MarketSquareStream[]> {
  return marketSquare
    .authedGet<{ items?: StreamWire[] }>("/streams", {
      status: "live",
      deepLinkRef: ref,
      limit: 20,
    })
    .then((data) =>
      (data.items ?? [])
        .map(toStream)
        .filter((stream) => stream.status === "live" && stream.deepLink?.ref === ref)
    );
}

export function requestToSpeak(streamId: string): Promise<SpeakerRequest> {
  return marketSquare
    .post<SpeakerRequestWire>(`/streams/${streamId}/speaker-requests`)
    .then(toSpeakerRequest);
}

/** The caller's own open request, or null when they have not asked. */
export function fetchMySpeakerRequest(streamId: string): Promise<SpeakerRequest | null> {
  return marketSquare
    .authedGet<SpeakerRequestWire | null>(`/streams/${streamId}/speaker-requests/me`)
    .then((wire) => (wire ? toSpeakerRequest(wire) : null));
}

/** Host only. Defaults to the pending queue, which is what needs answering. */
export function fetchSpeakerQueue(
  streamId: string,
  status: SpeakerRequestStatus = "pending"
): Promise<SpeakerQueueEntry[]> {
  return marketSquare
    .authedGet<{ items?: SpeakerRequestWire[] }>(`/streams/${streamId}/speaker-requests`, {
      status,
      limit: 20,
    })
    .then((data) => (data.items ?? []).map(toQueueEntry));
}

export function resolveSpeakerRequest(
  streamId: string,
  requestId: string,
  action: SpeakerRequestAction
): Promise<SpeakerRequest> {
  return marketSquare
    .post<SpeakerRequestWire>(`/streams/${streamId}/speaker-requests/${requestId}/${action}`)
    .then(toSpeakerRequest);
}

/**
 * Publisher credentials for an approved speaker.
 *
 * An approved request read back through `/me` already carries joinUrl and
 * joinToken, so this is the fallback for a deployment that leaves them off,
 * not the primary route. Either way the grant is a publisher token: camera,
 * microphone and screen share.
 */
export function fetchSpeakerToken(streamId: string): Promise<SpeakerGrant> {
  return marketSquare
    .post<{ url?: string | null; token?: string | null }>(`/streams/${streamId}/speaker-token`)
    .then((wire) => {
      if (!wire.url || !wire.token) {
        throw new Error("Market Square approved the request but returned no publishing token.");
      }
      return { url: wire.url, token: wire.token };
    });
}
