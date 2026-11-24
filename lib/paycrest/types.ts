// Domain shapes for the Paycrest rail, shared by the server client, the
// /api/paycrest proxy and the client hooks. Raw Paycrest JSON is parsed into
// these at the proxy and never reaches a screen as-is. Every amount and rate
// is a validated decimal string; arithmetic goes through ./amounts (bigint).

/** Tokens the app ramps, all on Base. Other Paycrest tokens are refused. */
export const PAYCREST_TOKENS = ["USDC", "USDT"] as const;
export type PaycrestToken = (typeof PAYCREST_TOKENS)[number];

/** Every order this app creates is on Base. */
export const PAYCREST_NETWORK = "base";

export type PaycrestDirection = "offramp" | "onramp";

export type PaycrestOrderStatus =
  | "initiated"
  | "deposited"
  | "pending"
  | "fulfilling"
  | "fulfilled"
  | "validated"
  | "settling"
  | "settled"
  | "cancelled"
  | "refunding"
  | "refunded"
  | "expired";

export interface PaycrestInstitution {
  code: string;
  name: string;
  /** "bank" or "mobile_money" today; kept open for new rails. */
  type: string;
}

export interface PaycrestCurrency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface PaycrestQuoteSide {
  /** Fiat per token. */
  rate: string;
  /** Ranked provider ids, best first; passed back on create to keep the quoted provider. */
  providerIds: string[];
}

export interface PaycrestQuote {
  /** Onramp side (user buys tokens with fiat). */
  buy: PaycrestQuoteSide | null;
  /** Offramp side (user sells tokens for fiat). */
  sell: PaycrestQuoteSide | null;
}

/** Offramp: where the user sends their tokens. */
export interface PaycrestCryptoDeposit {
  kind: "crypto";
  network: string;
  receiveAddress: string;
  /** Exact token amount to send: amount + fees. */
  amountToTransfer: string;
  currency: string;
  validUntil: string;
  /** Present only when the deposit must carry it. */
  memo: string | null;
}

/** Onramp: the virtual bank account the user pays fiat into. */
export interface PaycrestFiatDeposit {
  kind: "fiat";
  institution: string;
  accountIdentifier: string;
  accountName: string;
  /** Exact fiat amount to transfer. */
  amountToTransfer: string;
  currency: string;
  validUntil: string;
}

export type PaycrestDeposit = PaycrestCryptoDeposit | PaycrestFiatDeposit;

export interface PaycrestOrder {
  id: string;
  status: PaycrestOrderStatus;
  direction: PaycrestDirection | null;
  /** Token amount (for onramp: what the wallet receives). */
  amount: string;
  rate: string | null;
  /** Where to pay. Null once Paycrest stops returning it after the deposit. */
  deposit: PaycrestDeposit | null;
  txHash: string | null;
  /** Offramp payout receipt from the bank, once confirmed. */
  paymentReference: string | null;
}

/** Body the browser posts to /api/paycrest/orders/offramp. */
export interface OfframpOrderRequest {
  /** Token amount, decimal string. */
  amount: string;
  token: PaycrestToken;
  /** Fiat currency code, e.g. "NGN". */
  currency: string;
  /** A rate locked from the quote; omitted to let Paycrest pick. */
  rate?: string;
  providerIds?: string[];
  recipient: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
    memo: string;
  };
  /** Client idempotency key, reused verbatim on retry. */
  reference: string;
}

export type PaycrestIdType = "BVN" | "nationalID";

/** Body the browser posts to /api/paycrest/orders/onramp. */
export interface OnrampOrderRequest {
  /** Fiat amount the user pays, decimal string. */
  amount: string;
  token: PaycrestToken;
  currency: string;
  /** The customer's own account; fiat refunds go back here. */
  refundAccount: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
  };
  kyc: {
    fullName: string;
    /** YYYY-MM-DD */
    birthDate: string;
    idType: PaycrestIdType;
    idNumber: string;
  };
  reference: string;
}

/** What the user is waiting on, reduced from the order's status for display. */
export type PaycrestProgress =
  "awaiting" | "processing" | "paid" | "refunded" | "expired" | "failed";

export function paycrestProgress(
  status: PaycrestOrderStatus,
  direction: PaycrestDirection
): PaycrestProgress {
  switch (status) {
    case "initiated":
      return "awaiting";
    // Offramp: the fiat has reached the bank once the provider validates it.
    case "validated":
      return direction === "offramp" ? "paid" : "processing";
    // Onramp: done when the tokens land in the wallet.
    case "settled":
      return "paid";
    case "refunding":
    case "refunded":
      return "refunded";
    case "expired":
      return "expired";
    case "cancelled":
      return "failed";
    default:
      return "processing";
  }
}

export function isTerminalProgress(progress: PaycrestProgress): boolean {
  return (
    progress === "paid" ||
    progress === "refunded" ||
    progress === "expired" ||
    progress === "failed"
  );
}
