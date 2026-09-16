"use client";

import { apiFetch } from "@/lib/api";
import type { ActivityItem } from "@/lib/server/activity";

export interface UserActivity {
  items: ActivityItem[];
  /**
   * Sources the server could not read, by network or registry name. Non-empty
   * means `items` is not the whole history, so the view must not present it as
   * a complete record.
   */
  unavailable: string[];
}

// /api/activity is a local route that returns a raw { items, unavailable }
// object, NOT the gateway { success, data } envelope. So it must not go through
// a service client / unwrap(), which requires `success === true` and throws on
// the missing envelope, which is exactly what left the feed empty. Fetch it
// plain and read its JSON, the way the activity feed has always read it.
export async function fetchUserActivity(params: {
  evm?: string | null;
  solana?: string | null;
}): Promise<UserActivity> {
  const query = new URLSearchParams();
  if (params.evm) query.set("evm", params.evm);
  if (params.solana) query.set("solana", params.solana);
  const res = await apiFetch(`/api/activity?${query.toString()}`, {}, { requireAuth: true });
  if (!res.ok) {
    throw new Error(
      res.status === 429 ? "Too many requests, try again shortly" : "Could not load activity"
    );
  }
  const body = (await res.json()) as Partial<UserActivity> | null;
  // A body without an items array is a broken response, not an empty history.
  // Defaulting it to [] here would put the same lie back that the server side
  // of this fix removed.
  if (!Array.isArray(body?.items)) {
    throw new Error("Could not load activity");
  }
  return {
    items: body.items,
    unavailable: Array.isArray(body.unavailable) ? body.unavailable : [],
  };
}
