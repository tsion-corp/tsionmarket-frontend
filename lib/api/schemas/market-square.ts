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

export const roleApplicationSchema = z
  .object({
    status: z.string().optional(),
  })
  .nullable();

// The schema for a proxied path, or null when nothing models it. Keyed on the
// joined path with ids collapsed, the same way the chess proxy does it.
export function marketSquareSchemaFor(joined: string): z.ZodType | null {
  if (joined === "me") return marketSquareProfileSchema;
  if (joined === "me/creator-application") return roleApplicationSchema;
  if (joined === "streams") return streamSchema;
  if (/^streams\/[^/]+$/u.test(joined)) return streamSchema;
  if (/^streams\/[^/]+\/go-live$/u.test(joined)) return goLiveSchema;
  if (/^streams\/[^/]+\/end$/u.test(joined)) return streamSchema;
  return null;
}
