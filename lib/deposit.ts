// Domain types and pure helpers for the Dextopus deposit and withdrawal flows.
// No framework or wallet imports here. On-chain amounts stay in integer base
// units (bigint) so we never lose precision to floating point.

import { toBaseUnits } from "@/lib/trade/math";

// Relay/Dextopus chain ids. Everything in the supported set is EVM except
// Solana, which uses this large synthetic id.
export const SOLANA_CHAIN_ID = 792703809;
export const BASE_CHAIN_ID = 8453;
export const ARBITRUM_CHAIN_ID = 42161;
export const POLYGON_CHAIN_ID = 137;

// Dextopus represents native SOL by three different addresses across its
// endpoints, and only the system-program placeholder is accepted by the
// quote/generate endpoints (all verified live):
//   - /deposit/destinations and master /deposit/tokens  -> wrapped-SOL mint
//   - per-chain /deposit/tokens?chainId=792703809        -> native placeholder
//   - /deposit/quote and /deposit/static/generate        -> system-program id
// We normalize every representation to the last one so a SOL deposit or
// withdrawal actually goes through.
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
export const DEXTOPUS_NATIVE_SOL = "11111111111111111111111111111111";
// The generic "native gas token" address the per-chain token catalog uses.
const NATIVE_GAS_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Native ETH has the same two-address split as SOL, just across fewer forms
// (verified live against /deposit/tokens for chain 1/8453/42161/10):
//   - per-chain /deposit/tokens?chainId=X (any EVM chain) -> NATIVE_GAS_PLACEHOLDER
//   - master /deposit/tokens (no chainId), and /deposit/destinations -> all-zero
// Left unnormalized, a deposit's origin token carries the per-chain address,
// which never matches the master eligibility set's all-zero key — so
// supportsStaticAddress comes back false and native ETH silently disappears
// from the deposit token picker on every EVM chain, Ethereum included.
const EVM_NATIVE_ETH = "0x0000000000000000000000000000000000000000";

// Maps a destination currency (from /deposit/destinations) to the id the quote
// endpoint accepts. Only native SOL needs it today.
export function quoteReadyDestinationAsset(chainId: number, currency: string): string {
  if (chainId === SOLANA_CHAIN_ID && currency === WRAPPED_SOL_MINT) {
    return DEXTOPUS_NATIVE_SOL;
  }
  return currency;
}

// Maps an origin token address (from the per-chain /deposit/tokens catalog) to
// the id the generate/quote endpoints accept. The per-chain catalog lists
// native SOL as the generic gas placeholder, which generate rejects; the
// system-program id is the only form it honors. Native ETH on any EVM chain
// carries the same placeholder per-chain but must be normalized to the
// all-zero address the master catalog (and generate/quote) actually use.
export function depositOriginAsset(chainId: number, address: string): string {
  if (address.toLowerCase() !== NATIVE_GAS_PLACEHOLDER.toLowerCase()) return address;
  return chainId === SOLANA_CHAIN_ID ? DEXTOPUS_NATIVE_SOL : EVM_NATIVE_ETH;
}

// The master eligibility catalog keys native SOL under the wrapped mint, but
// after depositOriginAsset() the origin token carries the placeholder id. This
// maps the placeholder back to the wrapped mint so the eligibility lookup for
// SOL still matches.
export function eligibilityLookupAddress(chainId: number, address: string): string {
  if (chainId === SOLANA_CHAIN_ID && address === DEXTOPUS_NATIVE_SOL) {
    return WRAPPED_SOL_MINT;
  }
  return address;
}

// The address family a chain's addresses belong to. Matches the enum the
// validate-address endpoint accepts.
export type AddressKind =
  "evm" | "near" | "solana" | "tron" | "bitcoin" | "litecoin" | "stellar" | "sui" | "ton" | "xrp";

export type WalletChainType = "ethereum" | "solana";

export interface DepositChain {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  logoUrl: string | null;
  blockExplorer: string | null;
}

// Tron's explorer uses a hash-route path; every other chain in Dextopus's
// catalog (EVM, Solana, Bitcoin, XRP, ...) follows the plain /tx/{hash}
// convention. Verified against Dextopus's own chain list.
const TRON_CHAIN_ID = 728126428;

// Builds a link to view a transaction on its chain's block explorer, or null
// when we don't have an explorer URL for that chain.
export function txExplorerUrl(
  chainId: number,
  blockExplorer: string | null,
  hash: string
): string | null {
  if (!blockExplorer) return null;
  const base = blockExplorer.replace(/\/$/, "");
  return chainId === TRON_CHAIN_ID ? `${base}/#/transaction/${hash}` : `${base}/tx/${hash}`;
}

export interface DepositToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUrl: string | null;
  supportsStaticAddress: boolean;
}

export interface QuoteRequest {
  originChainId: number;
  destinationChainId: number;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo?: string;
  slippageBps?: number;
  static?: boolean;
  // Locks the deposit address to the exact quoted amount: an under/overpay
  // auto-refunds to refundTo instead of settling at a different rate.
  strict?: boolean;
}

// A valid conversion target for a given origin asset, as reported by
// GET /deposit/destinations. Used to build the "withdraw to" chain + token
// picker: only options Dextopus itself confirms it can route to are offered.
export interface WithdrawDestination {
  destinationChainId: number;
  blockchain: string;
  currency: string;
  symbol: string;
  decimals: number;
  addressKind: AddressKind;
  logoUrl: string | null;
}

export interface QuoteResult {
  success: boolean;
  depositRequestId: string;
  depositAddress: string;
  isStaticAddress: boolean;
  amountOut: string;
  minAmountOut: string;
  status: string;
  expiresInSeconds: number;
}

// Dextopus's routing fee, shown as a rate where a flow has no amount to quote.
export const DEXTOPUS_FEE_RATE = 0.005;

// Clamped at zero so a rounding wobble or a direct send never reads as a bonus.
export function quoteFee(amountIn: number, amountOut: number): number {
  return Math.max(0, amountIn - amountOut);
}

export interface DepositStatusResult {
  success: boolean;
  depositRequestId: string;
  depositAddress: string;
  status: string;
  executionStatus: string;
  originTransactionHashes: string[];
  destinationTransactionHashes: string[];
  providerUnavailable?: boolean;
  retryAfterMs?: number;
}

export interface ValidateAddressResult {
  valid: boolean;
  reason?: string;
}

// Where a cross-chain deposit settles. USDC on Base credits the EVM wallet;
// USDC on Solana credits the Solana wallet.
export interface SettlementTarget {
  chainType: WalletChainType;
  chainId: number;
  chainName: string;
  asset: string;
  assetSymbol: string;
  decimals: number;
}

const SETTLEMENTS: Record<WalletChainType, SettlementTarget> = {
  ethereum: {
    chainType: "ethereum",
    chainId: BASE_CHAIN_ID,
    chainName: "Base",
    asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    assetSymbol: "USDC",
    decimals: 6,
  },
  solana: {
    chainType: "solana",
    chainId: SOLANA_CHAIN_ID,
    chainName: "Solana",
    asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    assetSymbol: "USDC",
    decimals: 6,
  },
};

export function settlementFor(chainType: WalletChainType): SettlementTarget {
  return SETTLEMENTS[chainType];
}

// The four chains a deposit can settle to (as USDC in the user's own wallet).
// EVM chains share one embedded wallet address; nativeSymbol is the gas token we
// also track/hold on that chain. This is the single source of truth for the
// deposit "settle to" chooser and for withdrawal source selection.
export type SettleChainKey = "base" | "arbitrum" | "polygon" | "solana";

export interface SettleChain {
  key: SettleChainKey;
  chainType: WalletChainType;
  chainId: number;
  chainName: string;
  usdc: string;
  decimals: number;
  nativeSymbol: string;
  // Alchemy portfolio network id, so we can find the native gas balance.
  alchemyNetwork: string;
}

export const SETTLE_CHAINS: Record<SettleChainKey, SettleChain> = {
  base: {
    key: "base",
    chainType: "ethereum",
    chainId: BASE_CHAIN_ID,
    chainName: "Base",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    nativeSymbol: "ETH",
    alchemyNetwork: "base-mainnet",
  },
  arbitrum: {
    key: "arbitrum",
    chainType: "ethereum",
    chainId: ARBITRUM_CHAIN_ID,
    chainName: "Arbitrum",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    nativeSymbol: "ETH",
    alchemyNetwork: "arb-mainnet",
  },
  polygon: {
    key: "polygon",
    chainType: "ethereum",
    chainId: POLYGON_CHAIN_ID,
    chainName: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192cE70d8cC03d5c3359",
    decimals: 6,
    nativeSymbol: "POL",
    alchemyNetwork: "polygon-mainnet",
  },
  solana: {
    key: "solana",
    chainType: "solana",
    chainId: SOLANA_CHAIN_ID,
    chainName: "Solana",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    nativeSymbol: "SOL",
    alchemyNetwork: "solana-mainnet",
  },
};

export const SETTLE_ORDER: readonly SettleChainKey[] = ["base", "arbitrum", "polygon", "solana"];

// The portfolio only ever holds balances on these four networks (see
// lib/server/alchemy.ts), so this reverse lookup is exhaustive: every held
// token's Alchemy network resolves to a Dextopus chain id.
export function chainIdForNetwork(network: string): number | null {
  return (
    SETTLE_ORDER.map((key) => SETTLE_CHAINS[key]).find((c) => c.alchemyNetwork === network)
      ?.chainId ?? null
  );
}

// Identifies a (chain, token) pair across Dextopus's origin-token catalog, so
// a held token can be checked against the solver-eligible set it was fetched
// from.
export function eligibilityKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

// Per-origin deposit minimum in USD value of the sent asset (Dextopus docs).
// Matched by chain name since only a few chains carry a non-default minimum.
export function depositMinimumUsd(chain: { name: string }): number {
  const n = chain.name.toLowerCase();
  if (n.includes("bitcoin")) return 5;
  if (n.includes("tron")) return 3;
  if (n.includes("solana")) return 2;
  if (n === "ethereum") return 2;
  return 1;
}

// Static (permanent) deposit address. Minted once per (user, origin asset,
// settlement) and reused forever; the address lives on the origin chain and any
// supported token sent to it converts to the settlement USDC.
export interface StaticAddressRequest {
  userId: string;
  originChainId: number;
  originAsset: string;
  settlementChainId: number;
  settlementAsset: string;
  settlementAddress: string;
  refundTo?: string;
}

export interface StaticAddress {
  id: string;
  depositAddress: string;
  originChainId: number;
  originAsset: string;
  settlementChainId: number;
  settlementAsset: string;
  settlementAddress: string;
  userId: string;
  qrCodeData?: string;
  createdAt: string;
}

export interface StaticAddressResult {
  success: boolean;
  data: StaticAddress;
}

export interface StaticAddressListResult {
  success: boolean;
  data: StaticAddress[];
  count?: number;
}

// The addresses the profile hands out, one per wallet family. Each takes USDC
// on its own chain and settles the same USDC into the user's embedded wallet on
// that chain, so what the profile shows is a Dextopus-routed address rather than
// the embedded wallet itself: funds sent from a chain we do not index still
// arrive somewhere the app can see, instead of stranding at an address the
// dashboard never reads.
export interface ProfileAddressSpec {
  key: WalletChainType;
  label: string;
  // The wallet the settled USDC lands in — the user's own embedded wallet.
  settlementAddress: string;
  request: StaticAddressRequest;
}

// Null for a family whose embedded wallet is not ready yet: minting against a
// missing settlement address would bind the address to the wrong destination
// permanently, and a static address cannot be repointed.
export function profileAddressSpec(
  userId: string,
  chainType: WalletChainType,
  walletAddress: string | null
): ProfileAddressSpec | null {
  if (!walletAddress) return null;
  const settle = SETTLEMENTS[chainType];
  return {
    key: chainType,
    label: settle.chainName,
    settlementAddress: walletAddress,
    request: {
      userId,
      originChainId: settle.chainId,
      originAsset: settle.asset,
      settlementChainId: settle.chainId,
      settlementAsset: settle.asset,
      settlementAddress: walletAddress,
      // Same family as the origin, which is what Dextopus requires.
      refundTo: walletAddress,
    },
  };
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// The address already minted for this exact request, oldest first. Minting is
// not idempotent — the same body posted twice returns two different addresses —
// so a profile that posted on every open would show a new address each time and
// scatter the user's funds across a growing set of them. Reusing the oldest
// match keeps the address a user saves valid forever.
export function findStaticAddress(
  existing: StaticAddress[],
  req: StaticAddressRequest
): StaticAddress | null {
  const matches = existing.filter(
    (a) =>
      a.originChainId === req.originChainId &&
      sameAddress(a.originAsset, req.originAsset) &&
      a.settlementChainId === req.settlementChainId &&
      sameAddress(a.settlementAsset, req.settlementAsset) &&
      sameAddress(a.settlementAddress, req.settlementAddress)
  );
  if (matches.length === 0) return null;
  return matches.reduce((oldest, a) => (a.createdAt < oldest.createdAt ? a : oldest));
}

// A direct (same-chain) USDC deposit or send network. Keyless for deposits,
// signed by the embedded wallet for withdrawals.
export interface DirectNetwork extends SettlementTarget {
  nativeSymbol: string;
  networkKey: string;
}

export const DIRECT_NETWORKS: DirectNetwork[] = [
  { ...SETTLEMENTS.ethereum, nativeSymbol: "ETH", networkKey: "base-mainnet" },
  { ...SETTLEMENTS.solana, nativeSymbol: "SOL", networkKey: "solana-mainnet" },
];

// Which address family a picked chain uses. The supported set is EVM plus
// Solana, so anything that is not the Solana id validates as an EVM address.
export function addressKindForChain(chainId: number): AddressKind {
  return chainId === SOLANA_CHAIN_ID ? "solana" : "evm";
}

export type DepositStage =
  "waiting" | "detected" | "processing" | "settled" | "refunded" | "failed";

export interface DepositProgress {
  stage: DepositStage;
  pct: number;
  label: string;
  terminal: boolean;
}

const STAGE_RANK: Record<DepositStage, number> = {
  waiting: 0,
  detected: 1,
  processing: 2,
  settled: 3,
  refunded: 3,
  failed: 3,
};

function stageFromToken(raw: string): DepositStage | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/(settled|complete|success|filled|done|relayed|fulfilled)/.test(s)) return "settled";
  if (/refund/.test(s)) return "refunded";
  if (/(fail|error|expired|invalid)/.test(s)) return "failed";
  if (/(process|bridg|relay|submit|inflight|in_flight|executing)/.test(s)) return "processing";
  if (/(detect|deposit|received|confirm|found)/.test(s)) return "detected";
  return "waiting";
}

const STAGE_META: Record<DepositStage, { pct: number; label: string; terminal: boolean }> = {
  waiting: { pct: 10, label: "Waiting for your deposit", terminal: false },
  detected: { pct: 40, label: "Deposit detected", terminal: false },
  processing: { pct: 70, label: "Bridging across chains", terminal: false },
  settled: { pct: 100, label: "Funds settled", terminal: true },
  refunded: { pct: 100, label: "Deposit refunded", terminal: true },
  failed: { pct: 100, label: "Deposit failed", terminal: true },
};

// Collapse the provider's status and executionStatus strings into one UI
// stage. We take whichever field is furthest along.
export function depositProgress(status: string, executionStatus = ""): DepositProgress {
  const a = stageFromToken(status);
  const b = stageFromToken(executionStatus);
  let stage: DepositStage = "waiting";
  if (a && b) stage = STAGE_RANK[a] >= STAGE_RANK[b] ? a : b;
  else stage = a ?? b ?? "waiting";
  return { stage, ...STAGE_META[stage] };
}

export const TERMINAL_STAGES: ReadonlySet<DepositStage> = new Set([
  "settled",
  "refunded",
  "failed",
]);

// ERC-20 transfer(address,uint256) calldata. Pure so it can be tested exactly.
const ERC20_TRANSFER_SELECTOR = "a9059cbb";

export function encodeErc20Transfer(to: string, amount: bigint): `0x${string}` {
  const cleanTo = to.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(cleanTo)) {
    throw new Error("Invalid recipient address");
  }
  if (amount < 0n) throw new Error("Amount must not be negative");
  const paddedTo = cleanTo.padStart(64, "0");
  const paddedAmount = amount.toString(16).padStart(64, "0");
  return `0x${ERC20_TRANSFER_SELECTOR}${paddedTo}${paddedAmount}`;
}

// USDC on both settlement chains has 6 decimals.
export function usdcBaseUnits(human: string): bigint {
  return toBaseUnits(human, 6);
}

// Format a remaining-seconds count as mm:ss, clamped at zero. Used for the
// deposit address expiry countdown.
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
