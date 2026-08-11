export type UsdcChain = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "polygon";

export const USDC_BY_CHAIN: Record<UsdcChain, { address: string; decimals: number }> = {
  ethereum: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  base: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  arbitrum: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  polygon: { address: "0x3c499c542cEF5E3811e1192cE70d8cC03d5c3359", decimals: 6 },
  // BSC bridges USDC at 18 decimals, unlike every other chain here.
  bsc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  solana: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
};
