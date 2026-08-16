// Dextopus quote client for selling a held asset. A sell settles to USDC on
// Base, credited to the user's balance: origin is the held token on its own
// chain, destination is USDC-Base, recipient is the user's Base wallet. Requests
// go through the /api/dextopus proxy. The response shape matches a buy, so the
// buy normalizer is reused. Amounts stay in integer base units (bigint).

import { apiFetch } from "@/lib/api";
import { normalizeBuyQuote, type BuyQuote } from "@/lib/buy-quote";
import { DEXTOPUS_NATIVE_SOL, SETTLE_CHAINS } from "@/lib/deposit";

// Every sell settles here.
export const SELL_DESTINATION = {
  chainId: SETTLE_CHAINS.base.chainId,
  asset: SETTLE_CHAINS.base.usdc,
  decimals: SETTLE_CHAINS.base.decimals,
} as const;

// Dextopus chain id per Alchemy network id, limited to the chains we hold
// balances on. Keep in sync with the portfolio's queried chains.
const NETWORK_TO_CHAIN: Record<string, number> = {
  "base-mainnet": 8453,
  "eth-mainnet": 1,
  "arb-mainnet": 42161,
  "opt-mainnet": 10,
  "polygon-mainnet": 137,
  "solana-mainnet": 792703809,
};

// A native balance has no contract address; Dextopus takes a chain-specific
// native sentinel. Its Solana quote endpoint expects the system-program id,
// not the wrapped-SOL mint returned by its token catalog.
const EVM_NATIVE = "0x0000000000000000000000000000000000000000";
const NATIVE_ORIGIN: Record<string, string> = {
  "base-mainnet": EVM_NATIVE,
  "eth-mainnet": EVM_NATIVE,
  "arb-mainnet": EVM_NATIVE,
  "opt-mainnet": EVM_NATIVE,
  "polygon-mainnet": EVM_NATIVE,
  "solana-mainnet": DEXTOPUS_NATIVE_SOL,
};

// Whether a held asset's network can be sold (it maps to a Dextopus chain).
export function canSell(network: string): boolean {
  return network in NETWORK_TO_CHAIN;
}

// Chains whose native token is ETH. Dextopus accepts native ETH and SOL as
// origins, but native POL is not currently exposed as a sellable route.
const NATIVE_ETH_CHAINS = new Set(["base-mainnet", "eth-mainnet", "arb-mainnet", "opt-mainnet"]);

// Whether a specific held asset can be sold. A token (has an address) is assumed
// sellable and the quote is the final authority. A native balance is sellable
// where the native token is ETH (a direct Dextopus origin) and on Solana,
// whose sells prefer Dextopus and retain LI.FI as a small/no-route fallback.
export function canSellAsset(network: string, address: string | null): boolean {
  if (!canSell(network)) return false;
  if (address === null) return NATIVE_ETH_CHAINS.has(network) || network === "solana-mainnet";
  return true;
}

export interface SellQuoteInput {
  // Alchemy network id of the held asset.
  network: string;
  // Held token address, or null for a native balance.
  asset: string | null;
  // Amount of the held asset to sell, in its base units.
  amount: bigint;
  // The user's Base wallet, where the USDC proceeds land.
  recipient: string;
  // The user's wallet on the origin chain, refunded if the sale cannot complete.
  refundTo: string;
  slippageBps: number;
}

// Build the Dextopus deposit/quote body for a sell. Pure, so it is unit tested.
export function buildSellQuoteBody(input: SellQuoteInput) {
  const originChainId = NETWORK_TO_CHAIN[input.network];
  if (!originChainId) throw new Error("This asset's network is not supported for selling.");
  return {
    originChainId,
    originAsset: input.asset ?? NATIVE_ORIGIN[input.network],
    destinationChainId: SELL_DESTINATION.chainId,
    destinationAsset: SELL_DESTINATION.asset,
    amount: input.amount.toString(),
    recipient: input.recipient,
    refundTo: input.refundTo,
    slippageBps: input.slippageBps,
    strict: true,
  };
}

export type SellQuoteFailure = "minimum" | "no-route" | "provider";

// Preserve why Dextopus rejected a quote. Solana sells may safely fall back to
// LI.FI only when the provider explicitly has no route or the amount is below
// its minimum; auth, rate-limit, and server failures must remain visible.
export class SellQuoteError extends Error {
  readonly status: number;
  readonly reason: SellQuoteFailure;
  readonly providerMessage: string;

  constructor(status: number, reason: SellQuoteFailure, providerMessage: string) {
    const message =
      reason === "minimum"
        ? "This amount is below the primary route minimum."
        : reason === "no-route"
          ? "The primary provider found no route for this sale."
          : "The primary sale provider is unavailable right now.";
    super(message);
    this.name = "SellQuoteError";
    this.status = status;
    this.reason = reason;
    this.providerMessage = providerMessage;
  }
}

function providerErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error === "object") {
      const error = body.error as Record<string, unknown>;
      if (typeof error.message === "string") return error.message;
    }
    if (Array.isArray(body.details)) {
      const detail = body.details.find(
        (item): item is Record<string, unknown> => item !== null && typeof item === "object"
      );
      if (detail && typeof detail.message === "string") return detail.message;
    }
  }
  return `Dextopus quote failed with status ${status}`;
}

export function classifySellQuoteFailure(message: string): SellQuoteFailure {
  if (
    /(?:minimum|min(?:imum)? amount|below (?:the )?min|too (?:small|low)|amount.{0,24}(?:small|low)|at least)/i.test(
      message
    )
  ) {
    return "minimum";
  }
  if (
    /(?:no (?:available )?route|route (?:not found|unavailable)|not supported|unsupported|no (?:deposit )?quote|insufficient liquidity|no liquidity|cannot (?:find|create).{0,20}quote)/i.test(
      message
    )
  ) {
    return "no-route";
  }
  return "provider";
}

export function shouldFallbackFromSellQuote(error: unknown): boolean {
  return (
    error instanceof SellQuoteError && (error.reason === "minimum" || error.reason === "no-route")
  );
}

export async function fetchSellQuote(input: SellQuoteInput): Promise<BuyQuote> {
  const res = await apiFetch("/api/dextopus/deposit/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSellQuoteBody(input)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const providerMessage = providerErrorMessage(data, res.status);
    console.error("Sell quote failed:", providerMessage);
    throw new SellQuoteError(
      res.status,
      classifySellQuoteFailure(providerMessage),
      providerMessage
    );
  }
  // Proceeds are USDC on Base (6 decimals).
  return normalizeBuyQuote(data, SELL_DESTINATION.decimals);
}
