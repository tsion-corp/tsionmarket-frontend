import type { SectionId } from "@/lib/sections";

// The chains a user can hold an embedded wallet on. Matches the values
// getWalletAddress expects.
export type ChainType = "ethereum" | "solana";

// A pre-filled trade the target section should open. Derived from a Vivid
// command frame (rwa.buy / rwa.sell): navigate to the section AND stage this
// so the buy/sell form opens ready — the USER reviews and confirms the trade
// themselves (we never auto-execute money actions).
export interface TradePrefill {
  symbol: string;
  amount?: string;
  mode: "buy" | "sell";
}

// A pre-filled PERPS position from a Vivid `perp.long` / `perp.short` command
// ("long $2 of bitcoin with 30x leverage"). Unlike TradePrefill (spot RWA, which
// only stages), a perp prefill carries the leverage and the long/short side, and
// the perps section AUTO-EXECUTES it: navigate to the trade page, stage the form
// (asset, side, collateral, leverage), and fire the order — no manual tap.
export interface PerpPrefill {
  symbol: string;
  side: "long" | "short";
  // Collateral (margin) in USD as a decimal string. Position = amount × leverage.
  amount: string;
  // Leverage multiplier as a whole-number string (e.g. "30"). Clamped to the
  // pair's maxLeverage by the perps form before submit.
  leverage: string;
}

// A spoken origin-chain name — free text, NOT a fixed set. Dextopus offers a
// large, dynamic list of deposit chains; the deposit screen resolves whatever
// the user said ("solana", "arbitrum", "polygon", …) against the live list, so
// voice deposit is never limited to a hardcoded subset.
export type DepositChain = string;

// A pre-selected crypto deposit, from a Vivid `deposit` frame ("deposit USDC on
// Solana"): open Add Funds on the crypto screen with this chain (and token, when
// it resolves) so the deposit address is shown. No money moves; the address is
// the user's own non-custodial wallet.
export interface DepositPrefill {
  chain: DepositChain;
  token?: string;
}

// Any non-empty, sanely-short chain name is accepted; matching against the live
// Dextopus list happens in the deposit screen, which no-ops on no match.
export function isDepositChain(value: string): value is DepositChain {
  return /^[a-z0-9 .-]{1,32}$/i.test(value);
}

// The typed result of understanding one spoken command. The Vivid backend
// (apps/ai) returns typed frames over the /audio socket; lib/voice/vivid-intent
// maps them to this union so the rest of the app only ever sees WSWS types,
// never a raw model payload.
//
// - navigate: open a section. When `prefill` is present the section opens its
//   trade form pre-filled from a spoken buy/sell (user confirms).
// - speak: a spoken read result (price, list) to surface in a toast, no nav.
// - getBalance / getWalletAddress / refresh: local read actions.
// - "unsupported": understood but not voice-enabled yet. "unknown": genuine
//   non-understanding.
export type Intent =
  | { action: "navigate"; target: SectionId; prefill?: TradePrefill }
  | { action: "perp"; prefill: PerpPrefill }
  | { action: "deposit"; prefill: DepositPrefill }
  | { action: "speak"; message: string }
  | { action: "getBalance" }
  | { action: "getWalletAddress"; chain: ChainType }
  | { action: "refresh" }
  | { action: "unsupported"; what: string }
  | { action: "unknown"; transcript: string };

// Where a spoken navigation command can go. Every value is a SectionId, so the
// dispatcher can hand it straight to use-app-navigate, which already knows how
// to route each one (earn and casino are real pages, the rest are dashboard
// sections).
export const NAV_TARGETS: readonly SectionId[] = [
  "portfolio",
  "spot",
  "perps",
  "rwa",
  "prediction",
  "earn",
  "casino",
];

export const CHAIN_TYPES: readonly ChainType[] = ["ethereum", "solana"];

export function isNavTarget(value: string): value is SectionId {
  return (NAV_TARGETS as readonly string[]).includes(value);
}

export function isChainType(value: string): value is ChainType {
  return (CHAIN_TYPES as readonly string[]).includes(value);
}
