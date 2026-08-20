// Spot markets that settle through a same-chain swap on Base instead of a
// Dextopus cross-chain route. Dextopus does not offer every asset (it has no
// DOGE destination on any chain, checked live against its own catalog), but a
// legitimate wrapped version can already exist on Base with real liquidity.
// These trade through the meme feature's swap engine (features/trade/hooks/
// use-meme-trade.ts), which spot reuses directly since both live under
// features/trade.

export interface SwapRoute {
  // The market symbol shown in the UI (e.g. "DOGE"), not the on-chain symbol.
  displaySymbol: string;
  tokenAddress: string;
  decimals: number;
  chainId: number;
}

// Coinbase Wrapped DOGE on Base. Verified on-chain: real contract code,
// symbol "cbDOGE", 8 decimals (matching Dogecoin's own precision). Same
// trust tier as cbBTC, which this app already recognizes as a legitimate
// wrapped representation.
const SPOT_SWAP_ROUTES: Record<string, SwapRoute> = {
  DOGE: {
    displaySymbol: "DOGE",
    tokenAddress: "0xcbD06E5A2B0C65597161de254AA074E489dEb510",
    decimals: 8,
    chainId: 8453,
  },
};

export function swapRouteForSymbol(symbol: string): SwapRoute | null {
  return SPOT_SWAP_ROUTES[symbol.trim().toUpperCase()] ?? null;
}

// Every symbol with a swap route, for merging into the spot market list
// alongside the Dextopus-buyable set.
export function swapRouteSymbols(): string[] {
  return Object.keys(SPOT_SWAP_ROUTES);
}
