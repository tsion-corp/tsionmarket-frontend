import { z } from "zod";

// The user-management service's contract — the notification inbox, browser
// push, and the wallet balance read — one schema per route the proxy relays
// (app/api/user-management/[...path]/route.ts). They judge
// the successful envelope at the boundary and do not transform it, so a shape
// drift is a 502 with a request id rather than a component rendering
// `undefined` under a bell.
//
// Objects are not strict: a field the service adds later is not a failure.
// Nullable fields are nullable in the service, not guesses: a campaign may
// carry no image, an unread row has no `readAt`, and the last page has no
// cursor.

import type { ProxyMethod } from "@/lib/api/user-management-proxy-paths";

export const inboxNotificationSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  title: z.string(),
  body: z.string(),
  // Either an app-relative path or an absolute HTTPS URL. Which of the two it
  // is decides where a click sends the reader, so it is judged where that
  // decision is made (lib/notifications/destination.ts), not here.
  url: z.string(),
  imageUrl: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const inboxPageSchema = z.object({
  items: z.array(inboxNotificationSchema),
  // The badge is this number, not a count of loaded rows, so a string here
  // would put NaN in the UI. It is the one field worth being strict about.
  // Whole numbers: these are counts, and the client parser insists on the same
  // thing, so a fractional one must fail here rather than in the hook.
  unreadCount: z.number().int(),
  // An opaque ISO timestamp, sent back as received. Null on the last page.
  nextCursor: z.string().nullable(),
});

export const readResultSchema = z.object({ updated: z.number().int() });

// Null when the deployment has no VAPID keys. That is a valid answer, and the
// UI says push is off server-side rather than offering a button that cannot
// work.
export const vapidKeySchema = z.object({ publicKey: z.string().nullable() });

// True from the POST, false from the DELETE, so one schema covers both.
export const subscribeResultSchema = z.object({ subscribed: z.boolean() });

// Every `usdValue` and `totalUsdValue` the service sends today is `null`, so
// the populated type is genuinely unknown: a number and a decimal string are
// both plausible and the spec does not say which. `z.unknown()` accepts null,
// a number, a string or an object added later, so whichever it turns out to be
// cannot turn a balance read into a 502.
//
// Nothing in the app may read this until the shape is confirmed. A consumer
// that needs it has to narrow it first, and the right moment to replace this
// with a real type is the first response that carries a value.
const unknownUsdValue = z.unknown();

// A quantity in the token's smallest unit, as a decimal string — "504709067444182"
// against `decimals: 18`. Never a number: an 18-decimal balance exceeds what a
// float can hold exactly, and the repo's rule is base units in `bigint` with
// the conversion at the display edge only.
const baseUnitAmount = z.string();

// The same quantity already scaled by `decimals`, still a string for the same
// reason. Carried alongside as the service's own rendering; it is not a
// second source of truth.
const formattedAmount = z.string();

// One native coin or ERC-20 row. `address` is the contract, and it is null for
// the native coin because a native coin has no contract — that null is the
// thing that distinguishes the two, not a missing field.
export const walletAssetSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  // The scale of `balance`, a small whole number. This one is a number in the
  // payload and stays one: it is an exponent, not an amount.
  decimals: z.number().int(),
  address: z.string().nullable(),
  balance: baseUnitAmount,
  balanceFormatted: formattedAmount,
  usdValue: unknownUsdValue,
});

export const walletBalanceSchema = z.object({
  // A hex chain id, "0x2105" for Base (8453). The service sends hex here and
  // decimal in `blockNumber` below; that inconsistency is the service's, and
  // normalising it in the schema would hide a contract the client has to know.
  chain: z.string(),
  address: z.string(),
  native: walletAssetSchema,
  // A wallet holding no ERC-20s sends an empty list, which is a real answer.
  tokens: z.array(walletAssetSchema),
  // Decimal, unlike `chain` above, and a string because a Base block height
  // will outgrow a safe integer long before the chain does.
  blockNumber: z.string(),
  // The Solana slot, null on an EVM wallet and on every wallet today: the
  // sample carries chains: ["0x2105"] only.
  slot: z.string().nullable(),
});

export const userBalanceSchema = z.object({
  generatedAt: z.string(),
  // 15 seconds after generatedAt in the sample. A freshness hint, not a poll
  // interval.
  staleAt: z.string(),
  // Whether the upstream Redis cache answered. Payload, not a cache header:
  // the proxy sends no-store on this like everything else it relays.
  cached: z.boolean(),
  chains: z.array(z.string()),
  totalUsdValue: unknownUsdValue,
  // Empty for a user with no linked wallet yet, which is an ordinary state for
  // a new account and must parse rather than 502 on them.
  wallets: z.array(walletBalanceSchema),
});

/**
 * The schema for a relayed path, or null when nothing models it.
 *
 * Keyed on the upstream path with the did collapsed, the same way the market
 * square proxy does it. The method matters on `push/subscriptions`, which
 * subscribes on POST and unsubscribes on DELETE; both answer the same shape.
 */
export function userManagementSchemaFor(path: string, method: ProxyMethod): z.ZodType | null {
  if (/^users\/[^/]+\/notifications$/u.test(path) && method === "GET") return inboxPageSchema;
  if (/^users\/[^/]+\/notifications\/read$/u.test(path) && method === "POST") {
    return readResultSchema;
  }
  if (/^users\/[^/]+\/push\/vapid-public-key$/u.test(path) && method === "GET") {
    return vapidKeySchema;
  }
  if (/^users\/[^/]+\/push\/subscriptions$/u.test(path) && method !== "GET") {
    return subscribeResultSchema;
  }
  if (/^users\/[^/]+\/balance$/u.test(path) && method === "GET") return userBalanceSchema;
  return null;
}
