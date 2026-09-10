// Shared Polymarket config. Prediction trading settles on Polygon in pUSD, a
// 1:1 USDC-backed ERC-20. Builder credentials live in env and stay server-side;
// only the builder code (public, embedded in signed orders for attribution) is
// exposed to the client.

export const POLYGON_CHAIN_ID = 137;

// Public builder code for on-chain trade attribution to the "wsws" integration.
export const BUILDER_CODE = process.env.NEXT_PUBLIC_POLYMARKET_BUILDER_CODE ?? "";

// Polygon contract addresses (from docs.polymarket.com — CTF Exchange V2 era).
export const CONTRACTS = {
  // pUSD collateral token (1:1 USDC-backed).
  pusd: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  standardExchange: "0xE111180000d2663C0091e4f400237545B87B996B",
  negRiskExchange: "0xe2222d279d744050d28e00520010520000310F59",
  // Wraps positions for multi-candidate ("neg-risk") markets. Selling into one
  // needs this as an ERC-1155 operator, and the SDK's setupTradingApprovals
  // does not grant it. See useNegRiskApproval in hooks/use-polymarket-cashout.
  negRiskAdapter: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
  // USDC <-> pUSD wrap/unwrap.
  collateralOnramp: "0x93070a847efEf7F70739046A929D47a521F5B8ee",
  collateralOfframp: "0x2957922Eb93258b93368531d39fAcCA3B4dC5854",
  // Bridged USDC.e on Polygon — the stablecoin pUSD unwraps back into.
  usdcE: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
} as const;

// pUSD uses 6 decimals, like USDC.
export const PUSD_DECIMALS = 6;

export function isPolymarketCollateral(network: string, address: string | null): boolean {
  return network === "polygon-mainnet" && address?.toLowerCase() === CONTRACTS.pusd.toLowerCase();
}

// Polymarket's cross-chain deposit bridge. Sending USDC to the returned address
// auto-wraps it to pUSD in the account's Deposit Wallet.
export const DEPOSIT_BRIDGE_URL = "https://bridge.polymarket.com/deposit";

// Path of the server route that signs Builder-authenticated requests. The
// browser SDK's remoteBuilderSigning points here; the builder secret never
// leaves the server.
export const BUILDER_SIGN_PATH = "/api/polymarket/sign";

// Path of the Polygon JSON-RPC proxy the SDK reads through, replacing the
// public endpoint it ships with (polygon.drpc.org, which answers 500 often
// enough to break trading approvals). Shares the app's one EVM RPC proxy on the
// server-only ZeroDev project. See app/api/evm-rpc/[network].
export const POLYGON_RPC_PATH = "/api/evm-rpc/polygon-mainnet";
