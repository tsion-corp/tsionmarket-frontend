"use client";

import { useState } from "react";
import { MARKET_SQUARE_HIDDEN } from "@/lib/market-square";
import { useSquareMe } from "@/features/square/hooks/use-square-home";
import { SquareHomeBanner } from "@/features/square/components/square-home-banner";
import { SquareHomeHouses } from "@/features/square/components/square-home-houses";
import { SquareHomePeople } from "@/features/square/components/square-home-people";
import { SquareHomePosts } from "@/features/square/components/square-home-posts";
import { SquareHomeRooms } from "@/features/square/components/square-home-rooms";
import { SquareHomeSearch } from "@/features/square/components/square-home-search";
import { SquareHomeTopRow } from "@/features/square/components/square-home-top-row";
import type { TradableSymbol } from "@/lib/square/tradable";
import type { BuyPayload } from "@/lib/modal-types";

/**
 * The Market Square page: the Square's own Home, inside this app, drawn as
 * the Square draws it.
 *
 * Home is a column in a fixed order, and this is that column in that order:
 * the search row (which answers in place, as Home's does), the gistroom
 * banner, then "Top GistRooms", "Make some
 * friends", "Coming Soon", "Popular Houses" and "Post For You", each with
 * its two-tone heading and its "View more" into the Square. Each section
 * reads the same route Home reads and shows what it returns, on the Square's
 * own cards; each renders nothing when it has nothing. Home's "Suggested
 * pals" foot and its ecosystem partners rail are not here: the first is the
 * people deck again, the second is the Square's own marketing.
 *
 * Gated on MARKET_SQUARE_HIDDEN only, the rail entry's switch: a hidden
 * square has no page, and renders nothing here the way the entry renders
 * nothing there. SQUARE_SECTIONS_HIDDEN is the portfolio's switch and is not
 * read; this page is the answer to why those sections were turned off.
 * Decision record: docs/adr/ADR-2026-09-12-square-page-in-app.md.
 */
export function SquareHome({
  markets,
  onOpenBuy,
}: {
  /** The spot universe, so a $TICKER in a post can open the buy sheet. */
  markets: TradableSymbol[];
  onOpenBuy?: (buy: BuyPayload) => void;
}) {
  const me = useSquareMe();
  // Home answers its own search: the words are local state, and while there
  // are any the sections give way to the results. Clearing the field puts
  // the page back exactly as it was.
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  if (MARKET_SQUARE_HIDDEN) return null;

  return (
    // The column fills the screen, as asked; the deck alone keeps Home's
    // 600 (see SquareFriendsDeck), so the fan is never scaled past the file.
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <SquareHomeTopRow value={query} onChange={setQuery} />
      {searching ? (
        <SquareHomeSearch query={query} meId={me.data?.id} />
      ) : (
        <>
          <SquareHomeBanner />
          <SquareHomeRooms status="live" />
          <SquareHomePeople meId={me.data?.id} />
          <SquareHomeRooms status="scheduled" />
          <SquareHomeHouses />
          <SquareHomePosts markets={markets} onOpenBuy={onOpenBuy} meId={me.data?.id} />
        </>
      )}
    </div>
  );
}
