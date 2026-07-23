// Domain types and pure helpers for the Dextopus deposit and withdrawal flows.
// No framework or wallet imports here. On-chain amounts stay in integer base
// units (bigint) so we never lose precision to floating point.

import { toBaseUnits } from "@/lib/trade/math";

// Relay/Dextopus chain ids. Everything in the supported set is EVM except
// Solana, which uses this large synthetic id.
export const SOLANA_CHAIN_ID = 792703809;
export const BASE_CHAIN_ID = 8453;

// Sentinel address Dextopus uses for a chain's native asset.
export const NATIVE_ASSET_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

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

export interface DepositStatusResult {
  success: boolean;
  depositRequestId: string;
  depositAddress: string;
  status: string;
  executionStatus: string;
  originTransactionHashes: string[];
  destinationTransactionHashes: string[];
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
