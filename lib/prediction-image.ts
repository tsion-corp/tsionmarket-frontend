// Pure image-selection logic for prediction cards, kept out of the server-only
// Polymarket module so it can be unit tested. No imports, no side effects.

// Anything carrying optional Polymarket artwork fields (a Gamma market or event).
export interface ArtSource {
  image?: string | null;
  icon?: string | null;
}

// The artwork URL for a card. Prefer the market's own image, then its icon, then
// the event's image/icon, so a card shows the most specific art available and
// still falls back to the event banner when a market carries none. Empty strings
// count as absent. Returns null when nothing is set.
export function pickMarketImage(market: ArtSource, event: ArtSource): string | null {
  return market.image || market.icon || event.image || event.icon || null;
}
