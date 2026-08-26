// The reference Market Square carries back into Ark.
//
// A Market Square deep link is { kind, ref }. Kind "game" says the ref points
// at something in the casino, but the ref alone used to be a bare match id,
// which only made sense while chess was the one game that could broadcast.
// Now that checkers, ArkBall and Last Man broadcast too, the ref has to say
// which game it belongs to, so it is "<game>:<id>".
//
// The game part is a fixed vocabulary and never contains a colon, so the split
// is on the first colon only and the id keeps any colon of its own.

import type { MarketSquareDeepLink } from "@/lib/api/market-square";

// The games that can be broadcast. These ids match the catalogue ids in
// `features/casino/lib/games.ts` and the route segment under /casino.
export const BROADCAST_GAMES = ["chess", "checkers", "arkball", "last-standing"] as const;

export type BroadcastGameId = (typeof BROADCAST_GAMES)[number];

export interface GameRef {
  game: BroadcastGameId;
  /** Match id for chess and checkers, draw id for ArkBall, game id for Last Man. */
  id: string;
}

function isBroadcastGame(value: string): value is BroadcastGameId {
  return (BROADCAST_GAMES as readonly string[]).includes(value);
}

export function encodeGameRef(game: BroadcastGameId, id: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`Cannot build a ${game} deep link without an id.`);
  return `${game}:${trimmed}`;
}

// Returns null for anything that is not a ref this app can route.
//
// A ref with no prefix at all is a chess match: chess broadcast on its own for
// long enough that streams with a bare match id exist upstream, and dropping
// them would break the link back for every one of them.
export function decodeGameRef(ref: string): GameRef | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const colon = trimmed.indexOf(":");
  if (colon === -1) return { game: "chess", id: trimmed };
  const game = trimmed.slice(0, colon);
  const id = trimmed.slice(colon + 1);
  if (!isBroadcastGame(game) || !id) return null;
  return { game, id };
}

export function gameDeepLink(game: BroadcastGameId, id: string): MarketSquareDeepLink {
  return { kind: "game", ref: encodeGameRef(game, id) };
}
