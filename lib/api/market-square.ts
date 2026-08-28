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
  | "stream"
  | "store_item"
  | "listing"
  | "market"
  | "game"
  // Added for shared Ark activities: a trade, a prediction position, or a
  // scheduled activity. The square routes them back here rather than
  // resolving them itself.
  | "trade"
  | "prediction"
  | "activity"
  | "external";

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

// ── Sharing an Ark activity into the square ────────────────────────────────
//
// The square cannot describe a trade, a position or a game result: they live
// in services it must not read. So Ark, which knows exactly what just
// happened, supplies the card. That makes the preview the author's CLAIM
// rather than attested fact, which is why the square renders it as the
// author's words and the deep link is what makes it checkable.

export interface SharePreview {
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface CreatePostInput {
  text: string;
  deepLink: MarketSquareDeepLink;
  preview: SharePreview;
}

export interface MarketSquarePost {
  id: string;
}

/**
 * Post to the square from Ark, in the author's own words.
 *
 * Distinct from `createPost` below, which SHARES an activity and therefore
 * always carries a deep link and the card describing it. This one carries
 * neither: a person writing a thought is not pointing at anything, and
 * attaching a synthetic card ("On Ark", linking to whatever page they happened
 * to be on) puts a claim in their post that they did not make.
 */
export interface SquareUpload {
  url: string;
  kind: "image" | "video";
  contentType: string;
  bytes: number;
}

/**
 * Upload a picture or clip for a post.
 *
 * Sent as multipart so the service sees the real bytes and judges the CONTENT
 * TYPE itself — it never trusts a filename, and it caps size server-side. The
 * proxy forwards the body and its boundary verbatim.
 */
export async function uploadSquareMedia(file: File): Promise<SquareUpload> {
  const form = new FormData();
  form.append("file", file);
  return marketSquare.postForm<SquareUpload>("/uploads", form);
}

export interface SquareAttachment {
  deepLink: MarketSquareDeepLink;
  preview: { title: string; subtitle?: string | null; imageUrl?: string | null };
}

export async function createSquarePost(
  text: string,
  topics?: string[],
  media?: { url: string; kind: "image" | "video" } | null,
  attachment?: SquareAttachment | null
): Promise<MarketSquarePost> {
  return marketSquare.post<MarketSquarePost>("/posts", {
    kind: "update",
    text,
    // A preview without a deep link is refused by the service — a card that
    // leads nowhere is not a share — so the two always travel together.
    ...(attachment ? { deepLink: attachment.deepLink, preview: attachment.preview } : {}),
    ...(media ? { mediaUrl: media.url, mediaKind: media.kind } : {}),
    // Omitted rather than sent empty: the service treats an absent field and
    // an empty array the same, and sending `[]` implies a choice was made.
    ...(topics && topics.length > 0 ? { topics } : {}),
  });
}

/**
 * Post an activity to Market Square.
 *
 * A deployment that has not shipped `preview` yet would drop it silently — the
 * post would appear with a bare link and no card, which looks like the feature
 * half-works. So a body-shaped rejection retries without the preview and the
 * caller is told, rather than the user believing they shared a card they did
 * not.
 */
export async function createPost(
  input: CreatePostInput
): Promise<{ post: MarketSquarePost; previewShared: boolean }> {
  const base = { kind: "update" as const, text: input.text, deepLink: input.deepLink };
  try {
    const post = await marketSquare.post<MarketSquarePost>("/posts", {
      ...base,
      preview: input.preview,
    });
    return { post, previewShared: true };
  } catch (error) {
    if (!rejectedTheBody(error)) throw error;
    console.warn("Market Square rejected the post preview; posting the link alone.", error);
    return {
      post: await marketSquare.post<MarketSquarePost>("/posts", base),
      previewShared: false,
    };
  }
}

// ── The square's feed, read for the Ark dashboard ───────────────────────────

/** Who wrote a post, as the feed hydrates them. */
export interface MarketSquareAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verification: string;
  role: MarketSquareRole;
  /** Viewer state, hydrated by the feed for a signed-in reader. */
  isFollowing?: boolean;
}

/**
 * The card the author attached to a deep link.
 *
 * Market Square cannot resolve what a trade or a game result IS — those live
 * in services it must not read — so whoever shared it supplied this. It is the
 * author's CLAIM, not attested fact, and the dashboard renders it as their
 * words rather than with platform authority.
 */
export interface MarketSquarePreview {
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
}

export interface MarketSquareFeedPost {
  id: string;
  text: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  thumbnailUrl: string | null;
  deepLink: MarketSquareDeepLink | null;
  preview: MarketSquarePreview | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Distinct people who have seen it. Never raised by a re-watch. */
  viewCount: number;
  /** Viewer state. Only meaningful for a signed-in reader; false when not. */
  likedByMe: boolean;
  repostedByMe: boolean;
  createdAt: string;
  author: MarketSquareAuthor | null;
}

export interface MarketSquareFeedStream {
  id: string;
  title: string;
  status: StreamStatus;
  thumbnailUrl: string | null;
  peakViewers: number;
  owner: MarketSquareAuthor | null;
}

export interface MarketSquareFeedItem {
  id: string;
  type: "post" | "stream" | "activity" | "platform_event";
  occurredAt: string;
  post?: MarketSquareFeedPost;
  stream?: MarketSquareFeedStream;
  repostedBy?: MarketSquareAuthor;
}

export interface MarketSquareFeedPage {
  items: MarketSquareFeedItem[];
  nextCursor: string | null;
}

export type SquareLane = "for-you" | "following" | "live";

/**
 * One page of the square's feed.
 *
 * Public upstream, so this resolves for a signed-out player too and the
 * dashboard's social section is not a sign-in wall.
 */
export async function fetchSquareFeed(
  lane: SquareLane,
  cursor?: string | null,
  limit = 10,
  topics?: string[],
  hashtag?: string
): Promise<MarketSquareFeedPage> {
  const params = new URLSearchParams({ lane, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  // A hashtag REPLACES the lane upstream — it serves that one discussion
  // rather than narrowing the lane, so a quiet tag is not an empty page.
  if (hashtag) params.set("hashtag", hashtag);
  // Filters the lane rather than replacing it, which is why the tab strip can
  // mix "For you" with a topic without the two meaning different lists.
  if (topics && topics.length > 0) params.set("topics", topics.join(","));
  const page = await marketSquare.get<Partial<MarketSquareFeedPage>>(`/feed?${params.toString()}`);
  // A lane the deployment does not serve answers with an empty page rather
  // than an error; treat a malformed one the same way so the section renders
  // its empty state instead of tearing down the dashboard around it.
  return {
    items: Array.isArray(page?.items) ? page.items : [],
    nextCursor: page?.nextCursor ?? null,
  };
}

export interface MarketSquareTopic {
  key: string;
  label: string;
}

/**
 * The square's topic vocabulary, for the feed's tab strip.
 *
 * Fetched rather than compiled in: a topic the square adds should appear here
 * without a deploy, and a hard-coded list would quietly filter on keys that no
 * longer exist.
 */
export async function fetchSquareTopics(): Promise<MarketSquareTopic[]> {
  const topics = await marketSquare.get<MarketSquareTopic[] | { items?: MarketSquareTopic[] }>(
    "/topics"
  );
  const list = Array.isArray(topics) ? topics : (topics?.items ?? []);
  return list.filter((topic) => typeof topic?.key === "string" && topic.key !== "");
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

/**
 * Like or unlike a post without leaving Ark.
 *
 * The only engagement Ark's proxy relays. Both directions are idempotent
 * upstream, so a double tap settles rather than toggling twice, and the count
 * rendered afterwards is the SERVER's — never one this client incremented.
 */
export async function setPostLike(postId: string, liked: boolean): Promise<LikeResult> {
  const path = `/posts/${postId}/like`;
  return liked ? marketSquare.post<LikeResult>(path, {}) : marketSquare.del<LikeResult>(path);
}

export interface RepostResult {
  reposted: boolean;
  repostCount: number;
}

/** Repost or undo it. Idempotent upstream in both directions. */
export async function setPostRepost(postId: string, reposted: boolean): Promise<RepostResult> {
  const path = `/posts/${postId}/repost`;
  return reposted
    ? marketSquare.post<RepostResult>(path, {})
    : marketSquare.del<RepostResult>(path);
}

export interface MarketSquareComment {
  id: string;
  text: string;
  createdAt: string;
  author: MarketSquareAuthor | null;
}

export async function fetchPostComments(
  postId: string,
  cursor?: string | null
): Promise<{ items: MarketSquareComment[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  const page = await marketSquare.get<{
    items?: MarketSquareComment[];
    nextCursor?: string | null;
  }>(`/posts/${postId}/comments?${params.toString()}`);
  return {
    items: Array.isArray(page?.items) ? page.items : [],
    nextCursor: page?.nextCursor ?? null,
  };
}

export async function addPostComment(postId: string, text: string): Promise<MarketSquareComment> {
  return marketSquare.post<MarketSquareComment>(`/posts/${postId}/comments`, { text });
}

/**
 * Record that this reader has seen the post.
 *
 * The service counts DISTINCT people and ignores a re-watch, so this is safe
 * to call more than once — but the client still fires it once per post per
 * session, because a request that changes nothing is still a request.
 */
export async function recordPostView(postId: string): Promise<void> {
  await marketSquare.post(`/posts/${postId}/views`, {});
}

export interface FollowResult {
  following: boolean;
}

/** Follow or unfollow an author. Idempotent upstream in both directions. */
export async function setFollow(profileId: string, following: boolean): Promise<FollowResult> {
  const path = `/profiles/${profileId}/follow`;
  return following
    ? marketSquare.post<FollowResult>(path, {})
    : marketSquare.del<FollowResult>(path);
}

export interface MarketSquareMe {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verification: string;
  role: MarketSquareRole;
}

/** The reader's own square identity, for the compose sheet's header. */
export async function fetchSquareMe(): Promise<MarketSquareMe> {
  return marketSquare.get<MarketSquareMe>("/me");
}

/**
 * Unread counters for the square.
 *
 * Shapes vary by deployment, so anything unrecognised reads as zero rather
 * than rendering a badge with NaN in it.
 */
export async function fetchSquareUnread(): Promise<number> {
  const data = await marketSquare.get<Record<string, unknown>>("/me/unread");
  const value = data?.notifications ?? data?.unread ?? data?.count ?? 0;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export interface TrendingDiscussion {
  tag: string;
  /** `#tag`, ready to render. */
  label: string;
  postCount: number;
  /** Distinct authors — what makes it a discussion rather than one person. */
  participantCount: number;
  /**
   * Reach: the sum of the posts' view tallies.
   *
   * NOT a number of people. Each post counts a reader once, but someone who
   * reads three posts in a discussion counts three times — so it is labelled
   * "views" and never "people", unlike participants. Defaults to 0 so a
   * deployment without the field renders no figure instead of NaN.
   */
  viewCount?: number;
}

/**
 * Hashtags people are actually using right now.
 *
 * Ranked by distinct participants rather than post volume, so one person
 * repeating a tag cannot climb the list. Public, like the rest of discovery.
 */
export async function fetchTrendingDiscussions(limit = 6): Promise<TrendingDiscussion[]> {
  const page = await marketSquare.get<{ items?: TrendingDiscussion[] }>(
    `/hashtags/trending?limit=${limit}`
  );
  return Array.isArray(page?.items) ? page.items : [];
}
