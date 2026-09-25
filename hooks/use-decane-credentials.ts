"use client";

import { useEffect, useState } from "react";

// The Decane publishable key, fetched at runtime instead of inlined at build
// time. See app/api/decane/key/route.ts for what that does and does not buy.
//
// Cached at module scope, not in React state alone: the kit is mounted once at
// the top of the session tree, and a remount (a soft navigation, a fast
// refresh) must not re-fetch and must not hand the kit a different value
// mid-session. The kit derives its localStorage identity prefix from a slice of
// the API key, so a changed value would read as "signed out".

export interface DecaneCredentials {
  apiKey: string;
  appId: string;
}

let cached: DecaneCredentials | null = null;
let inFlight: Promise<DecaneCredentials | null> | null = null;

async function load(): Promise<DecaneCredentials | null> {
  try {
    const res = await fetch("/api/decane/key", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<DecaneCredentials>;
    if (typeof body.apiKey !== "string" || typeof body.appId !== "string") return null;
    cached = { apiKey: body.apiKey, appId: body.appId };
    return cached;
  } catch {
    // Offline, or the route is down. The caller shows its own fallback rather
    // than mounting the kit with nothing usable.
    return null;
  }
}

/**
 * The credentials, or null while the first fetch is in flight. Null is "not
 * yet", not "signed out": nothing that needs the kit may render on it.
 */
export function useDecaneCredentials(): DecaneCredentials | null {
  const [creds, setCreds] = useState<DecaneCredentials | null>(cached);

  useEffect(() => {
    if (cached) return;
    let live = true;
    void (async () => {
      inFlight ??= load();
      const loaded = await inFlight;
      // One failed load must not poison every later attempt: clear the shared
      // promise so a remount retries rather than resolving null forever.
      if (!loaded) inFlight = null;
      if (live && loaded) setCreds(loaded);
    })();
    return () => {
      live = false;
    };
  }, []);

  return creds;
}
