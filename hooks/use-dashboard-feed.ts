"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DASHBOARD_FEED_KEY, type DashboardFeed } from "@/lib/dashboard-feed";
import { pollUnlessFailing } from "@/lib/query-poll";

// How often a tab asks for a fresh feed. The server composes one every twenty
// seconds for everyone, so asking faster than this only re-reads the same
// value from the edge cache.
const FEED_POLL_MS = 30_000;
const FEED_STALE_MS = 20_000;

async function fetchDashboardFeed(): Promise<DashboardFeed> {
  // Anonymous: the feed is the same for every caller, and a request carrying
  // credentials could not be stored by the shared cache in front of it.
  const res = await apiFetch("/api/dashboard/feed", {}, { anonymous: true });
  if (!res.ok) throw new Error("Couldn't load the dashboard feed");
  return (await res.json()) as DashboardFeed;
}

/**
 * The dashboard's public data as one query: the four briefs and the marquee's
 * live events.
 *
 * This replaces thirteen independent polls, several of them for upstreams
 * that were down and would never answer, with one request every thirty
 * seconds that the server has already composed and cached for everyone. The
 * first value arrives in the HTML: the dashboard page dehydrates it into this
 * key on the server, so the briefs render with numbers before this hook has
 * made a request.
 *
 * Every component on the page shares one observer set, so however many briefs
 * read it, it is still one request.
 */
export function useDashboardFeed() {
  return useQuery<DashboardFeed>({
    queryKey: DASHBOARD_FEED_KEY,
    queryFn: fetchDashboardFeed,
    staleTime: FEED_STALE_MS,
    refetchInterval: pollUnlessFailing(FEED_POLL_MS),
    // The feed itself is the fallback for its sections; a failed poll keeps
    // the last value on screen, and retrying a 5xx three times a tick is the
    // traffic pattern this replaces.
    retry: false,
  });
}
