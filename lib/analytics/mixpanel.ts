// The one seam the rest of the app is allowed to call through for product
// analytics. Nothing outside this file imports mixpanel-browser directly, so
// swapping providers later (or adding a second one) touches one module, not
// every screen that tracks an event.
//
// The event catalog lives in ./events and is enforced by the signature of
// `track`, so a screen cannot invent or misspell a name.

import mixpanel from "mixpanel-browser";
import type {
  AnalyticsEventName,
  AnalyticsEvents,
  SuperProperties,
  UserProfile,
} from "@/lib/analytics/events";

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

let initialized = false;

function ready(): boolean {
  return initialized && typeof window !== "undefined";
}

/**
 * Drops properties that carry no value.
 *
 * A missing property is an absent one: sending null, an empty string or "N/A"
 * turns "we have no figure" into a value that shows up in reports and has to
 * be filtered out of every query afterwards. `false` and `0` are real values
 * and are kept.
 */
function compact(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

// Call once, before any other export here. A no-op on the server, and a
// no-op (with a console warning) if no token is configured, so local dev
// without NEXT_PUBLIC_MIXPANEL_TOKEN set never crashes and never phones home.
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  if (!TOKEN) {
    console.warn("[analytics] NEXT_PUBLIC_MIXPANEL_TOKEN is not set; tracking is disabled.");
    return;
  }
  mixpanel.init(TOKEN, {
    persistence: "localStorage",
    // Pageviews and clicks come for free; the named events in ./events are the
    // ones we actually report on.
    autocapture: true,
    // Honour the browser's Do Not Track signal.
    ignore_dnt: false,
  });
  initialized = true;
}

/**
 * Ties Mixpanel's distinct_id to the account's canonical EVM wallet address.
 *
 * That address is assigned server-side at signup and is the same on every
 * device, which is what merges a user's laptop and phone sessions into one
 * person. It is public on-chain, stable per account, and doubles as the join
 * key to on-chain data. Never identify by email, and never switch to the
 * Solana address: an id that changes is two users as far as reports go.
 */
export function identifyUser(walletEvm: string, profile?: UserProfile): void {
  if (!ready() || !walletEvm) return;
  try {
    mixpanel.identify(walletEvm);
    if (profile) mixpanel.people.set(compact(profile as Record<string, unknown>));
  } catch (error) {
    console.warn("[analytics] failed to identify", error);
  }
}

// Call on logout: detaches Mixpanel's local identity so the next session on
// this device starts anonymous again instead of inheriting the last user's.
export function resetAnalytics(): void {
  if (!ready()) return;
  mixpanel.reset();
}

/**
 * Records one event. The overloads make the properties argument required for
 * events that take properties and forbidden for the ones that do not, so the
 * catalog in ./events is the single source of truth at every call site.
 */
export function track<E extends EventsWithoutProps>(name: E): void;
export function track<E extends EventsWithProps>(name: E, properties: AnalyticsEvents[E]): void;
export function track(name: AnalyticsEventName, properties?: unknown): void {
  if (!ready()) return;
  // Analytics must never be the reason a user flow breaks. Several of these
  // calls sit inside mutation success handlers, where a throw would take the
  // navigation or the toast with it, so nothing here is allowed to escape.
  try {
    mixpanel.track(name, properties ? compact(properties as Record<string, unknown>) : undefined);
  } catch (error) {
    console.warn("[analytics] failed to track", name, error);
  }
}

type EventsWithoutProps = {
  [K in AnalyticsEventName]: AnalyticsEvents[K] extends void ? K : never;
}[AnalyticsEventName];

type EventsWithProps = Exclude<AnalyticsEventName, EventsWithoutProps>;

/**
 * Registers super properties, which Mixpanel attaches to every subsequent
 * event. Call again whenever one of them changes, for instance after KYC is
 * verified or the first deposit lands, so later events carry the new value.
 */
export function setSuper(properties: Partial<SuperProperties>): void {
  if (!ready()) return;
  try {
    mixpanel.register(compact(properties as Record<string, unknown>));
  } catch (error) {
    console.warn("[analytics] failed to register super properties", error);
  }
}

// Exported for the tests: lets them assert the stripping rules without
// standing up the SDK.
export const __compactForTests = compact;
