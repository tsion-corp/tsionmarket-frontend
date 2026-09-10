"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSquareFeed, type MarketSquareFeedStream } from "@/lib/api/market-square";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";
import { pollUnlessFailingOr } from "@/lib/query-poll";
import { squareLinks } from "@/lib/square/links";

/** A room running on Market Square right now, as the conversation card shows it. */
export interface LiveConversation {
  id: string;
  /** The room's title: what is being talked about. */
  title: string;
  /** Who is hosting it, by display name. */
  host: string;
  /** Faces for the scatter: the host's, when the square has one. */
  avatars: readonly string[];
  /** The room on the square's own deployment, or null where the square is unreachable. */
  href: string | null;
}

export const LIVE_CONVERSATIONS_KEY = ["discovery", "live-conversations"] as const;

// A room that just went live is worth showing within the minute; faster than
// that only re-reads a feed the square composes for everyone.
const LIVE_POLL_MS = 60_000;

function toConversation(stream: MarketSquareFeedStream): LiveConversation {
  const host = stream.owner?.displayName || stream.owner?.username || "";
  const avatar = stream.owner?.avatarUrl;
  return {
    id: stream.id,
    title: stream.title,
    host,
    avatars: avatar ? [avatar] : [],
    href: squareLinks.live(stream.id),
  };
}

/**
 * The rooms live on Market Square, newest first, from the feed's live lane.
 *
 * Asked only where the square is configured and open: a hidden square has no
 * rooms to show and no deployment to link to. A read that fails yields no
 * rooms rather than an error, so the card shows its idle face and invites the
 * reader in; the poll backs off while the square is down and recovers with it.
 */
export function useLiveConversations(): readonly LiveConversation[] {
  const query = useQuery({
    queryKey: LIVE_CONVERSATIONS_KEY,
    queryFn: async () => {
      const page = await fetchSquareFeed("live", null, 6);
      return page.items.flatMap((item) =>
        item.stream && item.stream.status === "live" ? [toConversation(item.stream)] : []
      );
    },
    enabled: !MARKET_SQUARE_HIDDEN,
    staleTime: LIVE_POLL_MS,
    refetchInterval: pollUnlessFailingOr(LIVE_POLL_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.data ?? [];
}
