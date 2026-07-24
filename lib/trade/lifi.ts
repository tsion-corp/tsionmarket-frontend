// LI.FI aggregator client. Requests go through our server-side proxy
// (/api/lifi), which attaches the API key and the "wsws" integrator string and
// keeps the key off the client. Docs:
// https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer
import { apiFetch } from "@/lib/api";

const LIFI_QUOTE_PATH = "/api/lifi/quote";

// The wallet-ready transaction LI.FI returns. Numeric fields are hex strings,
// which the Privy sendTransaction Quantity type accepts as-is.
export interface LifiTransactionRequest {
  to: string;
  data: string;
  value: string;
  chainId: number;
  gasLimit?: string;
}

export interface LifiQuote {
  // Expected output in the receive token's base units.
  toAmount: bigint;
  // Guaranteed minimum output after slippage, in base units.
  toAmountMin: bigint;
  // Contract the from-token allowance must be granted to before the swap.
  approvalAddress: string;
  transactionRequest: LifiTransactionRequest;
  // Bridge or exchange LI.FI picked, for display. Null when not reported.
  toolName: string | null;
  // Value lost across the route as a percentage, derived from USD estimates.
  // Null when LI.FI does not return both USD figures.
  priceImpactPct: number | null;
}

export interface LifiQuoteRequest {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  fromAddress: string;
  // Maximum slippage as a decimal fraction, e.g. 0.005 for 0.5%.
  slippage: number;
  signal?: AbortSignal;
}

interface RawTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
  chainId?: number;
  gasLimit?: string;
}

interface RawEstimate {
  toAmount?: string;
  toAmountMin?: string;
  approvalAddress?: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
}

interface RawQuoteResponse {
  estimate?: RawEstimate;
  transactionRequest?: RawTransactionRequest;
  toolDetails?: { name?: string };
  tool?: string;
}

function priceImpact(fromUsd?: string, toUsd?: string): number | null {
  const from = parseFloat(fromUsd ?? "");
  const to = parseFloat(toUsd ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return ((from - to) / from) * 100;
}

function normalize(raw: RawQuoteResponse): LifiQuote {
  const estimate = raw.estimate ?? {};
  const tx = raw.transactionRequest;
  if (!tx?.to || !tx.data || tx.chainId == null) {
    throw new Error("LI.FI returned no transaction to sign");
  }
  if (!estimate.approvalAddress) {
    throw new Error("LI.FI returned no approval address");
  }
  return {
    toAmount: BigInt(estimate.toAmount ?? "0"),
    toAmountMin: BigInt(estimate.toAmountMin ?? "0"),
    approvalAddress: estimate.approvalAddress,
    transactionRequest: {
      to: tx.to,
      data: tx.data,
      value: tx.value ?? "0x0",
      chainId: tx.chainId,
      gasLimit: tx.gasLimit,
    },
    toolName: raw.toolDetails?.name ?? raw.tool ?? null,
    priceImpactPct: priceImpact(estimate.fromAmountUSD, estimate.toAmountUSD),
  };
}

// Fetch a LI.FI quote (through our /api/lifi proxy) for the given taker. The
// returned quote carries both the UI preview data (toAmount, priceImpactPct) and
// everything needed to execute the swap (approvalAddress, transactionRequest).
export async function fetchLifiQuote(req: LifiQuoteRequest): Promise<LifiQuote> {
  // LI.FI matches its token list by exact string, so a checksummed address can
  // 404 where the same address lowercased resolves (Polygon USDC is one). EVM
  // addresses are case-insensitive on-chain, so normalise to lowercase.
  const params = new URLSearchParams({
    fromChain: String(req.fromChain),
    toChain: String(req.toChain),
    fromToken: req.fromToken.toLowerCase(),
    toToken: req.toToken.toLowerCase(),
    fromAmount: req.fromAmount.toString(),
    fromAddress: req.fromAddress,
    slippage: String(req.slippage),
  });
  const res = await apiFetch(`${LIFI_QUOTE_PATH}?${params.toString()}`, { signal: req.signal });
  if (!res.ok) throw new Error(`LI.FI quote failed: ${res.status}`);
  return normalize(await res.json());
}
