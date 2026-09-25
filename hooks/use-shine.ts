"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { apiFetch } from "@/lib/api";
import { SHINE_SERVICES, type ShineService } from "@/lib/shine";

// Shine: whether a confirmed action on a service is posted to Market Square
// on its own. Seven services, seven independent answers — Shine on memecoins
// is a different setting from Shine on perps.
//
// The record lives on the account (app/api/preferences), not on the device.
// It is read here through React Query, keyed on the signed-in Privy DID, so
// two accounts in one browser can never read each other's answers and the
// previous account's copy is dropped from the cache the moment the DID
// changes.
//
// The key is deliberately absent from PERSISTED_PREFIXES (lib/query-persist).
// A localStorage snapshot outlives the session and is not cleared on sign
// out, which is the same shared-device problem that put this preference on
// the account in the first place. A stale snapshot saying "on" would also be
// the worst thing to act on.

const SHINE_KEY = "shine-preferences";
const PREFERENCES_ROUTE = "/api/preferences";
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// Preferences change about once ever, so a read per five minutes is plenty.
const STALE_TIME = 5 * 60 * 1000;

/**
 * The seven services Shine covers, in the order the product lists them, and
 * the type naming one. Both come from lib/shine, which is where the posting
 * path already reads them: a hook that declared its own union would let the
 * UI offer a toggle for a service no composer can write a post for.
 *
 * Re-exported because the toggle and the service pages address a service by
 * this name, and they talk to the hook rather than to lib/shine.
 *
 * app/api/preferences/route.ts keeps a third copy on purpose. It is the trust
 * boundary and has to validate a write independently; see the comment there.
 */
export { SHINE_SERVICES, type ShineService };

/** One answer per service, as the account holds them. */
export type ShinePreferences = Record<ShineService, boolean>;

/**
 * What the toggle draws before the account's record has arrived.
 *
 * ON, matching the product default, and the choice is not symmetric. Showing
 * ON while the truth is OFF errs toward "you are public": the person may be
 * more careful than they needed to be, and nothing is published that they did
 * not expect. Showing OFF while the truth is ON errs the other way — it tells
 * someone they are private at the exact moment the app is about to post for
 * them. Only one of those two mistakes can surprise a person with a public
 * post, so the loading state never makes that one.
 *
 * The cost is a brief ON for someone who turned Shine off; the control is
 * disabled and marked busy while it lasts, so it is not presented as a
 * settled value.
 *
 * This is for display only. `mayPost` below never uses it.
 */
const DISPLAY_DEFAULT_WHILE_LOADING = true;

/** The cache key for one account's Shine record. Exported so tests can address it. */
export function shinePreferencesKey(userId: string | null) {
  return [SHINE_KEY, userId] as const;
}

/**
 * Parsed, not coerced. A body that does not carry all seven booleans is not a
 * record of anyone's choices, and belongs in the query's error state rather
 * than being filled in with defaults — a guessed "on" here would publish.
 */
function parsePreferences(body: unknown): ShinePreferences {
  if (!body || typeof body !== "object") throw new Error("Malformed Shine record");
  const shine = (body as { shine?: unknown }).shine;
  if (!shine || typeof shine !== "object") throw new Error("Malformed Shine record");
  const source = shine as Record<string, unknown>;
  const parsed = {} as ShinePreferences;
  for (const service of SHINE_SERVICES) {
    const value = source[service];
    if (typeof value !== "boolean") throw new Error(`Malformed Shine record: ${service}`);
    parsed[service] = value;
  }
  return parsed;
}

async function readPreferences(): Promise<ShinePreferences> {
  const res = await apiFetch(PREFERENCES_ROUTE, {}, { requireAuth: true });
  if (!res.ok) throw new Error(`Could not read your Shine settings (${res.status})`);
  return parsePreferences(await res.json());
}

async function writePreference(service: ShineService, on: boolean): Promise<ShinePreferences> {
  const res = await apiFetch(
    PREFERENCES_ROUTE,
    {
      method: "POST",
      headers: JSON_HEADERS,
      // One service per write. The route takes several, but a toggle only
      // ever decides its own, and sending the rest would let a stale copy of
      // another service's answer overwrite a newer one.
      body: JSON.stringify({ shine: { [service]: on } }),
    },
    { requireAuth: true }
  );
  if (!res.ok) throw new Error(`Could not save your Shine setting (${res.status})`);
  return parsePreferences(await res.json());
}

export interface Shine {
  /** The account's answers, or null until they have actually arrived. */
  preferences: ShinePreferences | null;
  /** True once `preferences` holds the account's record rather than nothing. */
  isResolved: boolean;
  isLoading: boolean;
  /** Whether anyone is signed in. Nobody signed in means nothing to read or write. */
  isSignedIn: boolean;
  /** A write is in flight. */
  isSaving: boolean;
  /** Why the read failed, if it did. */
  error: unknown;
  /**
   * What the toggle draws. Falls back to the product default before the
   * record arrives — see DISPLAY_DEFAULT_WHILE_LOADING. Display only.
   */
  isOn(service: ShineService): boolean;
  /**
   * Whether an auto-post is allowed for this service right now.
   *
   * False unless the account's own record has arrived and says so. An
   * unresolved preference is never treated as on: a post is public and
   * permanent, and skipping one costs a post, while guessing one wrong costs
   * a person's privacy. This — not `isOn` — is what the posting path asks.
   */
  mayPost(service: ShineService): boolean;
  /** Writes one service. Flips at once, goes back and rejects if the save fails. */
  setShine(service: ShineService, on: boolean): Promise<void>;
  refetch(): void;
}

export function useShine(): Shine {
  const { userId } = useAuthSession();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => shinePreferencesKey(userId), [userId]);
  const [isSaving, setIsSaving] = useState(false);

  const query = useQuery({
    queryKey,
    enabled: userId !== null,
    queryFn: readPreferences,
    staleTime: STALE_TIME,
  });

  // Another account's answers have no business staying in this tab's cache.
  // Signing out leaves userId null, which this covers as well.
  useEffect(() => {
    queryClient.removeQueries({
      predicate: (cached) => cached.queryKey[0] === SHINE_KEY && cached.queryKey[1] !== userId,
    });
  }, [queryClient, userId]);

  const preferences = query.data ?? null;

  const isOn = useCallback(
    (service: ShineService) => preferences?.[service] ?? DISPLAY_DEFAULT_WHILE_LOADING,
    [preferences]
  );

  const mayPost = useCallback(
    (service: ShineService) => userId !== null && preferences !== null && preferences[service],
    [preferences, userId]
  );

  const setShine = useCallback(
    async (service: ShineService, on: boolean) => {
      if (!userId) throw new Error("No signed-in account");
      const previous = queryClient.getQueryData<ShinePreferences>(queryKey);
      // The switch moves under the finger rather than on the round trip.
      if (previous)
        queryClient.setQueryData<ShinePreferences>(queryKey, { ...previous, [service]: on });
      setIsSaving(true);
      try {
        const saved = await writePreference(service, on);
        // The account's own answer, not the one we guessed it would give.
        queryClient.setQueryData<ShinePreferences>(queryKey, saved);
      } catch (cause) {
        // Put it back. A switch left showing a decision the account never
        // recorded is how someone ends up believing they opted out.
        if (previous) queryClient.setQueryData<ShinePreferences>(queryKey, previous);
        throw cause;
      } finally {
        setIsSaving(false);
      }
    },
    [queryClient, queryKey, userId]
  );

  const { refetch } = query;

  return {
    preferences,
    isResolved: preferences !== null,
    isLoading: query.isLoading,
    isSignedIn: userId !== null,
    isSaving,
    error: query.error,
    isOn,
    mayPost,
    setShine,
    refetch: () => {
      void refetch();
    },
  };
}
