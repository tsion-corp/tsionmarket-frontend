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
  ProfileCounter,
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
// silent no-op if no token is configured, so local dev
// without NEXT_PUBLIC_MIXPANEL_TOKEN set never crashes and never phones home.
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  if (!TOKEN) return;
  mixpanel.init(TOKEN, {
    persistence: "localStorage",
    // Off: the catalog in ./events is a deliberate taxonomy, and autocapture
    // adds click, scroll and pageview rows that report nothing the named events
    // do not already say, while spending quota to do it.
    //
    // The cost of having it off is diagnostic, and the warning below covers it:
    // autocapture used to be the sign that the SDK was alive at all, so without
    // it a silenced session and a broken one look the same from the outside.
    autocapture: false,
    // Honour the browser's Do Not Track signal. Note what this means in
    // practice: a browser sending DNT gets no events at all, and Mixpanel
    // persists that decision, so the browser stays silent on later visits too.
    ignore_dnt: false,
  });
  initialized = true;

  // A session that sends nothing looks identical from the outside whether the
  // SDK failed or is doing exactly what it was told. Mixpanel disables itself
  // when the browser sends Do Not Track, and persists that under
  // `__mp_opt_in_out_<token>`, so the browser stays silent on every later visit
  // too. Saying so costs one line and turns "Mixpanel is broken on this
  // account" into an answer instead of an investigation.
  try {
    if (mixpanel.has_opted_out_tracking()) {
      console.warn(
        "[analytics] this browser is opted out of tracking (Do Not Track, or a stored opt-out from an earlier visit). No events will be sent."
      );
    }
  } catch {
    // A diagnostic must never be the reason boot fails.
  }
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
    const props = properties ? compact(properties as Record<string, unknown>) : undefined;
    mixpanel.track(name, props);
    accumulateProfile(name, props ?? {});
  } catch (error) {
    console.warn("[analytics] failed to track", name, error);
  }
}

// The profile totals the spec asks for are all restatements of events that
// already fire, so they are derived here rather than at each call site. A
// screen sends its event and the running totals follow, which is the only way
// they cannot drift apart from the events they summarise.
function accumulateProfile(name: AnalyticsEventName, props: Record<string, unknown>): void {
  const num = (key: string): number | undefined =>
    typeof props[key] === "number" ? (props[key] as number) : undefined;

  switch (name) {
    case "trade_completed": {
      const amount = num("amount_usd");
      incrementProfile({ trade_count: 1, total_volume_usd: amount });
      const vertical = props.vertical;
      if (typeof vertical === "string") unionProfile("verticals_used", [vertical]);
      return;
    }
    // Either rail arriving is the same fact: money reached the account.
    case "deposit_completed":
    case "bank_transfer_completed": {
      const method = name === "deposit_completed" ? "crypto" : "bank";
      incrementProfile({ total_deposit_usd: num("amount_usd") });
      setProfile({ has_deposited: true });
      // set_once, so these keep describing the first deposit.
      setProfileOnce({
        first_deposit_method: method,
        first_deposit_date: new Date().toISOString(),
      });
      return;
    }
    // lifetime_kash_earned is not derived here: the Kash engine reports the
    // authoritative lifetime figure, and adding to it as well would count the
    // same points twice.
    case "kash_earned":
      setProfile({ kash_active: true });
      return;
    case "kash_bought":
      setProfile({ kash_active: true });
      return;
    case "referral_completed":
      incrementProfile({ referral_count: 1 });
      return;
    default:
      return;
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

/**
 * Updates profile fields on the identified account. Use for values that
 * describe the account's current state, such as its balance or KYC status.
 */
export function setProfile(properties: UserProfile): void {
  if (!ready()) return;
  try {
    mixpanel.people.set(compact(properties as Record<string, unknown>));
  } catch (error) {
    console.warn("[analytics] failed to set profile", error);
  }
}

/**
 * Writes profile fields only if they are not already set, so a value that is
 * true of the account's first time stays true. That is what makes
 * `signup_method` and `first_deposit_date` mean what they say rather than
 * drifting to the most recent one.
 */
export function setProfileOnce(properties: UserProfile): void {
  if (!ready()) return;
  try {
    mixpanel.people.set_once(compact(properties as Record<string, unknown>));
  } catch (error) {
    console.warn("[analytics] failed to set profile defaults", error);
  }
}

/**
 * Adds to a running total on the profile: lifetime volume, trade count,
 * deposits. Mixpanel keeps the sum server-side, so the client never has to
 * know the previous value or risk racing another device.
 */
export function incrementProfile(properties: Partial<Record<ProfileCounter, number>>): void {
  if (!ready()) return;
  try {
    const amounts = compact(properties as Record<string, unknown>);
    // A zero moves nothing and only costs a request.
    for (const [key, value] of Object.entries(amounts)) {
      if (value === 0) delete amounts[key];
    }
    if (Object.keys(amounts).length > 0)
      mixpanel.people.increment(amounts as Record<string, number>);
  } catch (error) {
    console.warn("[analytics] failed to increment profile", error);
  }
}

/**
 * Adds values to a set-valued profile field without duplicating what is
 * already there, which is how `verticals_used` accumulates across sessions.
 */
export function unionProfile(field: "verticals_used", values: string[]): void {
  if (!ready() || values.length === 0) return;
  try {
    mixpanel.people.union({ [field]: values });
  } catch (error) {
    console.warn("[analytics] failed to union profile", error);
  }
}

// Exported for the tests: lets them assert the stripping rules without
// standing up the SDK.
export const __compactForTests = compact;
