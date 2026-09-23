"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import {
  fetchRoomDetail,
  fetchSquareFeed,
  type MarketSquareFeedStream,
} from "@/lib/api/market-square";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";
import { pollUnlessFailingOr } from "@/lib/query-poll";
import { squareRoomPath } from "@/lib/square/links";

/** A room running on Market Square right now, as the conversation card shows it. */
export interface LiveConversation {
  id: string;
  /** The room's title: what is being talked about. */
  title: string;
  /** Who is hosting it, by display name. */
  host: string;
  /**
   * Faces for the card: the people IN the room, host first, then whoever
   * joined most recently.
   *
   * This used to be the host's avatar and nothing else, so a room of a dozen
   * people drew one face — the scatter repeated it across every slot, and the
   * card said "here is a conversation" while showing one person over and over.
   * Upstream sends at most three, and only for a live gist room, so the
   * remaining slots keep the committed artwork rather than repeating a face.
   *
   * Empty is a real answer: presence is keyed by view session upstream, and a
   * signed-out listener has no person behind theirs. Never read this as a head
   * count.
   */
  avatars: readonly string[];
  /** The room inside this app, at /square, or null where the square is off. */
  href: string | null;
}

export const LIVE_CONVERSATIONS_KEY = ["discovery", "live-conversations"] as const;

/** One room's own row: its category, and who is in it. */
export const liveRoomDetailKey = (id: string) => ["discovery", "live-room", id] as const;

// A room that just went live is worth showing within the minute; faster than
// that only re-reads a feed the square composes for everyone.
const LIVE_POLL_MS = 60_000;

// The card rotates through at most this many rooms, and each costs one read of
// its own, so the cap is also what bounds that fan-out.
const MAX_ROOMS = 6;

/**
 * The rooms live on Market Square, newest first, from the feed's live lane.
 *
 * Asked only where the square is configured and open: a hidden square has no
 * rooms to show and no deployment to link to. A read that fails yields no
 * rooms rather than an error, so the card shows its idle face and invites the
 * reader in; the poll backs off while the square is down and recovers with it.
 *
 * The feed names the rooms; it does not say what KIND each one is or who is
 * inside. Both come from the room's own row, one read per room, which is why
 * the list is capped. A room whose read has not landed yet still renders: it
 * falls back to the host's face and the broadcast route, and corrects itself
 * the moment the detail arrives.
 */
export function useLiveConversations(): readonly LiveConversation[] {
  const list = useQuery({
    queryKey: LIVE_CONVERSATIONS_KEY,
    queryFn: async () => {
      const page = await fetchSquareFeed("live", null, MAX_ROOMS);
      return page.items.flatMap((item) =>
        item.stream && item.stream.status === "live" ? [item.stream] : []
      );
    },
    enabled: !MARKET_SQUARE_HIDDEN,
    staleTime: LIVE_POLL_MS,
    refetchInterval: pollUnlessFailingOr(LIVE_POLL_MS),
    refetchIntervalInBackground: false,
    retry: false,
  });

  const streams = list.data ?? [];

  // One read per room, in parallel. Each is cached and polled on its own key,
  // so a room that stays live across two passes of the list is not re-read,
  // and a room that fails leaves the others alone.
  const details = useQueries({
    queries: streams.map((stream) => ({
      queryKey: liveRoomDetailKey(stream.id),
      queryFn: () => fetchRoomDetail(stream.id),
      staleTime: LIVE_POLL_MS,
      refetchInterval: pollUnlessFailingOr(LIVE_POLL_MS),
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });

  return streams.map((stream, i) => toConversation(stream, details[i]?.data ?? null));
}

interface RoomDetail {
  category: string | null;
  participants: readonly { avatarUrl: string | null }[];
}

function toConversation(
  stream: MarketSquareFeedStream,
  detail: RoomDetail | null
): LiveConversation {
  const host = stream.owner?.displayName || stream.owner?.username || "";
  const faces = (detail?.participants ?? [])
    .map((person) => person.avatarUrl)
    .filter((url): url is string => Boolean(url));

  // The host's own face is the fallback, not an addition: upstream already
  // puts the host first in `participants`, so appending it would draw them
  // twice in a room they are in.
  const hostAvatar = stream.owner?.avatarUrl;
  return {
    id: stream.id,
    title: stream.title,
    host,
    avatars: faces.length > 0 ? faces : hostAvatar ? [hostAvatar] : [],
    href: squareRoomPath(stream.id, detail?.category ?? null),
  };
}
