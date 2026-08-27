/**
 * The little a post card needs to know about a tradeable symbol.
 *
 * Declared here rather than imported from the trade slice: slices never import
 * each other (eslint `boundaries`), and the dependency would be backwards
 * anyway — the square does not care how trading works, only that a symbol can
 * be opened. The dashboard, which composes both, maps one to the other.
 */
export interface TradableSymbol {
  symbol: string;
  name: string;
  priceUsd: number;
  /** 24h move as a percentage. Drives the price chip under a post. */
  change24h: number;
  logo: string | null;
}
