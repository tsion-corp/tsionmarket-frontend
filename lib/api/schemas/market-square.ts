import { z } from "zod";

// Contract schemas for the Market Square service, taken from the served
// spec at /v1/market-square/openapi.json. They judge the upstream payload at
// the proxy boundary; they do not transform it.

// KASH amounts cross the wire as decimal strings, never numbers.
const kashAmount = z.string().regex(/^\d+(\.\d{1,6})?$/u);

// The service's shared deep-link shape. `kind` is an open enum upstream, so a
// value added later must not fail a stream that is otherwise valid: an
// unrecognised kind falls back to "external", which is the neutral member and
// the one a client treats as "just a reference". The whole field falls back to
// null so a malformed or absent deep link never rejects the payload, which is
// what lets this schema run against a deployment that does not send one yet.
export const deepLinkSchema = z
  .object({
    kind: z
      .enum(["stream", "store_item", "listing", "market", "game", "external"])
      .catch("external"),
    ref: z.string(),
  })
  .nullable()
  .catch(null);

export const streamSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.enum(["scheduled", "live", "ended", "cancelled"]),
  scheduledAt: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  endedAt: z.string().nullable().optional(),
  visibility: z.enum(["public", "ticketed"]),
  ticketPriceKash: kashAmount.nullable().optional(),
  vipPriceKash: kashAmount.nullable().optional(),
  replayUrl: z.string().nullable().optional(),
  peakViewers: z.number().int().optional(),
  totalViewSeconds: z.number().int().optional(),
  endedReason: z.enum(["ended_by_host", "host_disconnected"]).nullable().optional(),
  // Absent on the deployments that have not shipped it on streams yet.
  deepLink: deepLinkSchema.optional(),
  createdAt: z.string().optional(),
});

// url and roomToken are nullable in the spec: RTMP-only ingest is a degraded
// go-live, and browser publishing needs both. The client checks for them.
export const streamIngestSchema = z.object({
  url: z.string().nullable().optional(),
  rtmpUrl: z.string().nullable().optional(),
  streamKey: z.string().nullable().optional(),
  roomToken: z.string().nullable().optional(),
});

export const goLiveSchema = z.object({
  stream: streamSchema,
  ingest: streamIngestSchema,
});

// Only the fields the broadcast flow reads. `role` is the creator gate on
// POST /streams; everything else on the profile is ignored here.
export const marketSquareProfileSchema = z.object({
  id: z.string(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  role: z.enum(["citizen", "creator", "ambassador", "worldstreet"]),
});

// Discovery. The list is what lets a second player find the broadcast that
// already exists for their match instead of starting a rival one.
export const streamListSchema = z.object({
  items: z.array(streamSchema),
  nextCursor: z.string().nullable().optional(),
});

// A speaker request is how someone gets publish rights on a stream they do not
// own. joinUrl/joinToken are present only on an approved request read back
// through `/me`; every other state omits them.
export const speakerRequestSchema = z.object({
  id: z.string(),
  streamId: z.string(),
  userId: z.string(),
  status: z.enum(["pending", "approved", "denied", "withdrawn", "removed"]),
  joinUrl: z.string().nullable().optional(),
  joinToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

// `/me` answers with null when the caller has never asked.
export const mySpeakerRequestSchema = speakerRequestSchema.nullable();

const speakerProfileSchema = z
  .object({
    id: z.string(),
    username: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
  })
  .nullable();

// The host's queue hydrates each request with who is asking.
export const speakerQueueSchema = z.object({
  items: z.array(speakerRequestSchema.extend({ profile: speakerProfileSchema.optional() })),
});

// The publisher grant an approved speaker publishes with.
export const speakerTokenSchema = z.object({
  url: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const roleApplicationSchema = z
  .object({
    status: z.string().optional(),
  })
  .nullable();

const likeResultSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number(),
});

// The schema for a proxied path, or null when nothing models it. Keyed on the
// joined path with ids collapsed, the same way the chess proxy does it.
//
// The method matters on two paths: `streams` reads as a list and writes a
// single stream, and `speaker-requests` reads as the host's queue and writes
// one request. Everything else answers the same shape either way.
export function marketSquareSchemaFor(
  joined: string,
  method: "GET" | "POST" | "DELETE" = "POST"
): z.ZodType | null {
  if (joined === "me") return marketSquareProfileSchema;
  if (joined === "me/creator-application") return roleApplicationSchema;
  if (joined === "streams") return method === "GET" ? streamListSchema : streamSchema;
  if (/^streams\/[^/]+$/u.test(joined)) return streamSchema;
  if (/^streams\/[^/]+\/speaker-requests$/u.test(joined)) {
    return method === "GET" ? speakerQueueSchema : speakerRequestSchema;
  }
  if (/^streams\/[^/]+\/speaker-requests\/me$/u.test(joined)) return mySpeakerRequestSchema;
  if (/^streams\/[^/]+\/speaker-requests\/[^/]+\/(approve|decline|remove|leave)$/u.test(joined)) {
    return speakerRequestSchema;
  }
  if (/^streams\/[^/]+\/speaker-token$/u.test(joined)) return speakerTokenSchema;
  if (/^streams\/[^/]+\/go-live$/u.test(joined)) return goLiveSchema;
  if (/^streams\/[^/]+\/end$/u.test(joined)) return streamSchema;
  // Like and unlike answer the same envelope, so one schema covers both.
  // Pinning it matters: the card renders `likeCount` straight from the
  // response, and an unmodelled shape would put NaN under a heart.
  if (/^posts\/[^/]+\/like$/u.test(joined)) return likeResultSchema;
  return null;
}
