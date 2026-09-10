import { isDepositChain, type DepositPrefill, type TradePrefill } from "@/lib/voice/intent";

// A voice buy/sell is carried to the target section as URL query params, so the
// section opens its trade form staged and the user confirms there. This module
// is the single encode/decode point: use-app-navigate writes the params,
// the section reads them back with readTradePrefill.
//
// Shape: ?trade=<symbol>&mode=<buy|sell>&amount=<decimal?>

const SYMBOL_PARAM = "trade";
const MODE_PARAM = "mode";
const AMOUNT_PARAM = "amount";

/** Encodes a prefill into a query string (no leading "?"). */
export function prefillToQuery(prefill: TradePrefill): string {
  const params = new URLSearchParams({
    [SYMBOL_PARAM]: prefill.symbol,
    [MODE_PARAM]: prefill.mode,
  });
  if (prefill.amount) {
    params.set(AMOUNT_PARAM, prefill.amount);
  }
  return params.toString();
}

/**
 * Reads a prefill back from URL search params, or null when none is present or
 * the values are malformed. The target section calls this on mount, opens its
 * trade form from the result, then clears the params so a reload doesn't re-open.
 */
export function readTradePrefill(params: URLSearchParams): TradePrefill | null {
  const symbol = params.get(SYMBOL_PARAM);
  const mode = params.get(MODE_PARAM);
  if (!symbol || (mode !== "buy" && mode !== "sell")) {
    return null;
  }
  const amount = params.get(AMOUNT_PARAM);
  return {
    symbol,
    mode,
    ...(amount && /^\d+(\.\d+)?$/.test(amount) ? { amount } : {}),
  };
}

// --- Crypto deposit prefill (opens Add Funds on the crypto screen) ---
// Shape: ?funds=crypto&depositChain=<chain>&depositToken=<token?>

const FUNDS_PARAM = "funds";
const DEPOSIT_CHAIN_PARAM = "depositChain";
const DEPOSIT_TOKEN_PARAM = "depositToken";

/** Encodes a deposit prefill into a query string (no leading "?"). */
export function depositToQuery(prefill: DepositPrefill): string {
  const params = new URLSearchParams({
    [FUNDS_PARAM]: "crypto",
    [DEPOSIT_CHAIN_PARAM]: prefill.chain,
  });
  if (prefill.token) {
    params.set(DEPOSIT_TOKEN_PARAM, prefill.token);
  }
  return params.toString();
}

/** Reads a deposit prefill back from URL params, or null when absent/malformed. */
export function readDepositPrefill(params: URLSearchParams): DepositPrefill | null {
  if (params.get(FUNDS_PARAM) !== "crypto") {
    return null;
  }
  const chain = params.get(DEPOSIT_CHAIN_PARAM);
  if (!chain || !isDepositChain(chain)) {
    return null;
  }
  const token = params.get(DEPOSIT_TOKEN_PARAM);
  return { chain, ...(token ? { token } : {}) };
}

/** The query-param keys this module owns — for clearing them after consumption. */
export const PREFILL_PARAMS = [
  SYMBOL_PARAM,
  MODE_PARAM,
  AMOUNT_PARAM,
  FUNDS_PARAM,
  DEPOSIT_CHAIN_PARAM,
  DEPOSIT_TOKEN_PARAM,
] as const;
