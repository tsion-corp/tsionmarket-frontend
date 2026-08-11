// Types and pure helpers for the cross-border off-ramp (the payment service's
// composed Dextopus + PouchPay rail). The flow: quote by the fiat the
// recipient should receive, create an order that mints a deposit address, send
// the quoted USDC there from the embedded wallet, and poll the order until the
// payout resolves. Everything here is pure and unit tested; components and
// hooks stay thin.

import { SETTLE_CHAINS } from "@/lib/deposit";

// What the user funds the payout with: their USDC on Base, the app's home
// balance. The service converts and settles under the hood.
export const OFFRAMP_ORIGIN = {
  chainId: SETTLE_CHAINS.base.chainId,
  asset: SETTLE_CHAINS.base.usdc,
  decimals: SETTLE_CHAINS.base.decimals,
  network: SETTLE_CHAINS.base.alchemyNetwork,
} as const;

export interface Corridor {
  country: string;
  currencies: string[];
}

export interface PayoutBank {
  id: string;
  name: string;
  country: string;
}

// A mobile-money operator for a corridor (transactionType "wallet"). The name
// doubles as the selection id; per-transaction limits may be empty strings
// when the rail does not publish them.
export interface WalletProvider {
  name: string;
  country: string;
  minPerTx: string;
  maxPerTx: string;
}

interface TokenAmount {
  amount: string;
  chainId: number;
  asset: string;
  decimals: number;
}

export interface OfframpQuote {
  provider: string;
  fiat: {
    fxRate: string;
    receive: { amount: string; currency: string };
    send: { amount: string; currency: string };
    // The rail stopped quoting an explicit fee line; present only when it does.
    totalFee?: string;
  };
  spreadBps: number;
  settlement: TokenAmount;
  pay: {
    amountIn: TokenAmount;
    accuracyBps?: number;
    expiresAt?: string;
  };
}

export type RampPublicStatus = "awaiting_deposit" | "processing" | "completed" | "needs_attention";

export interface RampOrder {
  id: string;
  status: string;
  publicStatus: RampPublicStatus;
  depositAddress: string;
  expectedSettlement?: TokenAmount;
  fiatQuote?: OfframpQuote["fiat"];
  createdAt: string;
  updatedAt: string;
}

export interface OfframpQuoteInput {
  toCountry: string;
  receiveCurrency: string;
  receiveAmount: string;
}

export interface VerifyRecipientInput {
  transactionType: "bank" | "wallet";
  toCountry: string;
  receiveCurrency: string;
  payeePhoneNumber: string;
  receiverAccountNumber?: string;
  bankCode?: string;
}

export interface VerifyRecipientResult {
  verified: boolean;
  accountName?: string;
}

export interface CreateOfframpInput {
  recipient: {
    transactionType: "bank" | "wallet";
    toCountry: string;
    receiveCurrency: string;
    receiveAmount: string;
    payeePhoneNumber: string;
    receiverAccountNumber?: string;
    bankCode?: string;
    receiverName: string;
    receiverSurname?: string;
  };
  // The fiat sender is the platform's float identity, configured server-side —
  // an order carries only the recipient and the refund address.
  refundTo: string;
}

// The corridors the payout rail can actually pay today, intersected with the
// countries the UI knows how to present. The static list is the catalogue; the
// live list is the truth — a country in one but not the other is not offered.
export function liveCountryCodes(corridors: Corridor[]): Set<string> {
  return new Set(corridors.map((c) => c.country.toLowerCase()));
}

// The fiat amount the recipient should receive, derived from the USD the
// sender typed and our FX rate. The quote is keyed on this; the rail's own FX
// then decides the exact charge, so this only has to be a sane starting point.
// Two decimals because every corridor currency is minor-unit based.
export function receiveAmountFromUsd(amountUsd: string, rate: number | null): string | null {
  const usd = Number(amountUsd);
  if (!Number.isFinite(usd) || usd <= 0 || rate == null || !(rate > 0)) return null;
  return (usd * rate).toFixed(2);
}

// The payout partner wants dial-code-prefixed digits with no plus sign
// ("233554235160"). Accepts whatever the user typed — spaces, dashes, a
// leading zero or a full international form — and normalises against the
// corridor's dial code.
export function normalizePhone(raw: string, dialCode: string): string {
  const digits = raw.replace(/\D/g, "");
  const cc = dialCode.replace(/\D/g, "");
  if (digits.startsWith(cc)) return digits;
  return cc + digits.replace(/^0+/, "");
}

// receiverName / receiverSurname from one name field: first word is the name,
// the rest the surname. A single word travels as the name alone — the surname
// field is optional upstream.
export function splitName(full: string): { name: string; surname?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { name: parts[0] ?? "" };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

// The USDC the quote asks the user to send, as a display dollar amount.
// Settlement is 6-decimal USDC, so this is exact division, not float drift.
export function payAmountUsd(quote: OfframpQuote): number {
  const { amount, decimals } = quote.pay.amountIn;
  return Number(amount) / 10 ** decimals;
}

export function isTerminalRampStatus(status: RampPublicStatus): boolean {
  return status === "completed" || status === "needs_attention";
}

// Envelope unwrap shared by every call. The service always answers
// { success, data | error }, and a transport-level failure has neither.
export function unwrapEnvelope<T>(body: unknown, fallback: string): T {
  const env = body as { success?: boolean; data?: T; error?: { message?: string } } | null;
  if (!env?.success || env.data == null) {
    throw new Error(env?.error?.message ?? fallback);
  }
  return env.data;
}
