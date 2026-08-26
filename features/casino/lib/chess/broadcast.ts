// The chess-specific half of a Market Square broadcast: where a viewer lands,
// what the stream is called, and what the description says. The mechanics are
// game-agnostic and live in `lib/broadcast/`.

import {
  broadcastDescription as describeBroadcast,
  capTitle,
  watchUrl,
} from "@/lib/broadcast/broadcast";
import { gameDeepLink } from "@/lib/broadcast/deep-link";
import type { MarketSquareDeepLink } from "@/lib/api/market-square";

export const MATCH_WATCH_PATH = "/casino/chess/watch";

export function matchWatchPath(matchId: string): string {
  return `${MATCH_WATCH_PATH}?match=${encodeURIComponent(matchId)}`;
}

// How a viewer gets from the stream back to the board. Two mechanisms, on
// purpose:
//
// 1. deepLink. Market Square models a deep link as { kind, ref } and already
//    carries one on posts, feed items and activities, with "game" among the
//    kinds. Streams accept it on the newer builds. It is the structured route,
//    and the one the Market Square client can turn into an in-app navigation.
// 2. The link in the description. Production has not shipped deepLink on
//    streams yet, so on that deployment the field is dropped and the URL in
//    the description is the only way back. It stays even once deepLink lands,
//    because a plain URL still works for anything reading the description.
export function matchDeepLink(matchId: string): MarketSquareDeepLink {
  return gameDeepLink("chess", matchId);
}

export function matchWatchUrl(origin: string, matchId: string): string {
  return watchUrl(origin, matchWatchPath(matchId));
}

export function broadcastTitle(whiteName: string, blackName: string): string {
  return capTitle(`Chess: ${whiteName} vs ${blackName}`);
}

export const CHESS_DESCRIPTION_LEAD = "Live chess on Ark. Watch the match:";

export function broadcastDescription(origin: string, matchId: string): string {
  return describeBroadcast(CHESS_DESCRIPTION_LEAD, origin, matchWatchPath(matchId));
}

export {
  sharedSurfaceLabel,
  screenShareSupported,
  shouldWarnOnLeave,
  type BroadcastPhase,
} from "@/lib/broadcast/broadcast";
