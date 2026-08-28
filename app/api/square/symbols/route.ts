import { NextResponse } from "next/server";
import { dextopusRequest } from "@/lib/server/dextopus";
import { BUY_ORIGIN, buyableSymbols, type BuyRoute } from "@/lib/buy";
import { swapRouteSymbols } from "@/lib/spot-swap";
import { fetchMarketTokens } from "@/lib/server/market-tokens";

/**
 * The symbols this platform can actually trade, as a plain list.
 *
 * Published for Market Square. Its posts are full of `$TICKER`, and a ticker is
 * only worth marking up when tapping it leads somewhere — otherwise a chip
 * promises a trade screen that does not exist. Market Square cannot work that
 * out for itself: the answer comes from Dextopus, behind a key that belongs to
 * this deployment and must not be copied into another one.
 *
 * So Ark answers the question it owns, and hands over the ANSWER rather than
 * the credentials. Nothing here reveals a route, a price or a key: it is the
 * set of strings a post is allowed to make tappable.
 *
 * Public and unauthenticated on purpose. Which coins a platform lists is not a
 * secret — it is on the trade screen — and a signed-out reader sees the same
 * post as everybody else, so the markup must not depend on having a session.
 */
/** The Dextopus row shape, as the buy catalogue reads it. */
interface RawDestination {
  destinationChainId: number;
  blockchain?: string;
  currency: string;
  symbol: string;
  decimals?: number;
  logoUrl?: string | null;
}

export const revalidate = 60;

export async function GET() {
  try {
    const query = new URLSearchParams({
      originChainId: String(BUY_ORIGIN.chainId),
      originAddress: BUY_ORIGIN.asset,
    });
    // No leading slash: dextopusRequest builds `${BASE}/${path}`, so "/trade/..."
    // produced "api//trade/...". Every other caller passes a bare path.
    // "deposit/destinations", NOT "trade/deposit/destinations". `purpose`
    // selects the API KEY; it is not part of the URL. The catch-all proxy
    // strips the prefix with splitPurpose before calling, so passing it here
    // requested /api/trade/deposit/destinations and got a 404 from Dextopus.
    const res = await dextopusRequest("deposit/destinations", {
      method: "GET",
      purpose: "trade",
      query,
      // Cached upstream too: this is a catalogue, not a price.
      revalidate,
    });
    // Same shape and same normalisation the buy catalogue uses. Reading
    // `data.data` and handing raw rows straight to `buyableSymbols` was wrong
    // twice over: the payload nests under `destinations`, and `isOfferable`
    // needs the MAPPED route (chainName from `blockchain`, asset from
    // `currency`). Every symbol was filtered out, so the published list held
    // only the hardcoded swap route.
    // dextopusRequest returns a RESPONSE, not a parsed body. Reading
    // `.destinations` off it gave undefined every time, so the list came back
    // holding nothing but the hardcoded swap route. This was the actual cause
    // of the DOGE-only list; the payload shape was a red herring.
    if (!res.ok) throw new Error(`destinations ${res.status}`);
    const raw: unknown = await res.json();

    const payload = raw as { destinations?: RawDestination[] };
    const rows: RawDestination[] = Array.isArray(raw)
      ? (raw as RawDestination[])
      : Array.isArray(payload.destinations)
        ? payload.destinations
        : [];
    const routes: BuyRoute[] = rows
      .filter(
        (d) => Boolean(d.currency) && Boolean(d.symbol) && Number.isFinite(d.destinationChainId)
      )
      .map((d) => ({
        destinationChainId: d.destinationChainId,
        chainName: d.blockchain ?? "",
        asset: d.currency,
        symbol: d.symbol,
        decimals: d.decimals ?? 18,
        logoUrl: d.logoUrl ?? null,
      }));
    const symbols = [...new Set([...buyableSymbols(routes), ...swapRouteSymbols()])].sort();

    // Price and 24h move, so the square can draw the same chip Ark does.
    // Best-effort and SEPARATE from the catalogue: if the feed is unavailable
    // the symbols still publish and the chip simply shows no number. A ticker
    // that links is worth more than a ticker that waits for a price.
    const listed = new Set(symbols);
    const feed = await fetchMarketTokens("popular").catch(() => []);
    const markets = feed
      .filter((token) => listed.has(token.symbol.toUpperCase()))
      .map((token) => ({
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        priceUsd: token.priceUsd,
        change24h: token.change24h,
        logo: token.logo,
      }));

    return NextResponse.json(
      // `asOf` is the honest part: a price is only true at an instant, and a
      // consumer that caches this needs to know which one. The catalogue could
      // be cached for hours; the prices in it cannot.
      { symbols, markets, asOf: new Date().toISOString() },
      {
        headers: {
          // Sixty seconds, not five minutes: this now carries prices, and a
          // five-minute-old price on a finance product is a wrong number
          // rendered confidently. The catalogue itself changes on the order of
          // days and would happily cache for hours — the prices are what set
          // this window. `stale-while-revalidate` still keeps an outage from
          // silently un-linking every ticker on the square.
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    // Never 500 for this. The caller renders tickers as plain text when the
    // list is empty, which is the correct degradation: no chip beats a chip
    // that leads nowhere. An error here must not take a post render with it.
    return NextResponse.json(
      { symbols: [] },
      { headers: { "Cache-Control": "public, s-maxage=30" } }
    );
  }
}
