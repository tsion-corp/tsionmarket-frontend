// The ramping service: crypto <-> Naira over the Difference rail. This module
// holds the domain types, response normalization, the unified status the two
// bank screens render, and the exact-money conversions. Raw rail shapes never
// leave here.
//
// Money rules, from the service's own reference: every amount is a decimal
// STRING (USDC 6 dp, NGN 2 dp, rates 2 dp), conversion truncates at the
// asset's precision, and the figures shown to a user come from the order once
// they are non-null, never from arithmetic done here. The exact helpers below
// are bigint end to end; floats only ever feed display estimates.

import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

// The minimum deposit in Naira. Ours, not the rail's: below this the transfer
// fees eat the deposit.
export const ONRAMP_MIN_NGN = 5000;

// A small floor so a dust withdrawal never reaches the rail.
export const OFFRAMP_MIN_USDC = 1;

// How long an onramp's locked rate holds. The payment account itself stays
// payable forever; only the rate lapses (the order then reads `expired` and a
// later payment converts at the live rate).
export const RATE_LOCK_MS = 30 * 60 * 1000;

// The unified status both screens render. "processing" covers everything
// between money seen and money delivered (paid/delivering on an onramp,
// funded/paying_out on an offramp).
export type RampProgress = "awaiting" | "processing" | "completed" | "failed" | "expired";

export interface RampingRates {
  // NGN per USDC, decimal strings ("1650").
  onrampRate: string | null;
  offrampRate: string | null;
}

export interface RampBank {
  uuid: string;
  name: string;
}

export interface PaymentAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
}

export interface OnrampOrder {
  id: string;
  status: RampProgress;
  rawStatus: string;
  // NGN per USDC locked at creation, decimal string.
  rate: string;
  paymentAccount: PaymentAccount | null;
  // What actually moved, decimal strings; null until the rail fills them in.
  amountNgn: string | null;
  amountUsdc: string | null;
  error: string | null;
  expiresAt: string | null;
}

export interface OfframpOrder {
  id: string;
  status: RampProgress;
  rawStatus: string;
  rate: string;
  // The per-order crypto deposit address on the origin chain.
  depositAddress: string | null;
  recipientName: string | null;
  amountNgn: string | null;
  amountUsdc: string | null;
  error: string | null;
  expiresAt: string | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringOrNull(value: unknown): string | null {
  const s = asString(value).trim();
  return s ? s : null;
}

// Map a rail status to the unified progress. An unknown status is treated as
// in-flight so we neither claim success nor tell the user to keep waiting for
// a payment already made.
export function onrampProgress(raw: string | null | undefined): RampProgress {
  switch ((raw ?? "").toLowerCase()) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "awaiting_payment":
    case "":
      return "awaiting";
    default:
      return "processing";
  }
}

export function offrampProgress(raw: string | null | undefined): RampProgress {
  switch ((raw ?? "").toLowerCase()) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "awaiting_deposit":
    case "":
      return "awaiting";
    default:
      return "processing";
  }
}

export function isTerminalProgress(status: RampProgress): boolean {
  return status === "completed" || status === "failed";
}

export function normalizeRates(raw: unknown): RampingRates {
  const record = asRecord(raw) ?? {};
  return {
    onrampRate: stringOrNull(record.onramp_rate),
    offrampRate: stringOrNull(record.offramp_rate),
  };
}

export function normalizeBanks(raw: unknown): RampBank[] {
  if (!Array.isArray(raw)) return [];
  const out: RampBank[] = [];
  for (const entry of raw) {
    const item = asRecord(entry);
    if (!item) continue;
    const uuid = asString(item.uuid).trim();
    const name = asString(item.name).trim();
    if (uuid && name) out.push({ uuid, name });
  }
  return out;
}

export function normalizeOnrampOrder(raw: unknown): OnrampOrder {
  const record = asRecord(raw) ?? {};
  const account = asRecord(record.payment_account);
  const rawStatus = asString(record.status);
  return {
    id: asString(record.id),
    status: onrampProgress(rawStatus),
    rawStatus,
    rate: asString(record.rate),
    paymentAccount: account
      ? {
          accountNumber: asString(account.account_number).trim(),
          accountName: asString(account.account_name).trim(),
          bankName: asString(account.bank_name).trim(),
        }
      : null,
    amountNgn: stringOrNull(record.amount_ngn),
    amountUsdc: stringOrNull(record.amount_usdc),
    error: stringOrNull(record.error),
    expiresAt: stringOrNull(record.expires_at),
  };
}

export function normalizeOfframpOrder(raw: unknown): OfframpOrder {
  const record = asRecord(raw) ?? {};
  const rawStatus = asString(record.status);
  return {
    id: asString(record.id),
    status: offrampProgress(rawStatus),
    rawStatus,
    rate: asString(record.rate),
    depositAddress: stringOrNull(record.deposit_address),
    recipientName: stringOrNull(record.recipient_name),
    amountNgn: stringOrNull(record.amount_ngn),
    amountUsdc: stringOrNull(record.amount_usdc),
    error: stringOrNull(record.error),
    expiresAt: stringOrNull(record.expires_at),
  };
}

// --- exact money, bigint end to end -----------------------------------------

// NGN -> USDC at a rate, truncated to 6 dp exactly as the rail truncates:
// ₦2000 at 1650 is "1.212121", never 1.2121212121…. Returns null when either
// figure fails to parse or the rate is zero.
export function usdcForNgnExact(ngn: string, rate: string): string | null {
  const ngnCents = toBaseUnits(ngn, 2);
  const rateCents = toBaseUnits(rate, 2);
  if (ngnCents <= 0n || rateCents <= 0n) return null;
  const usdcUnits = (ngnCents * 1_000_000n) / rateCents;
  return fromBaseUnits(usdcUnits, 6);
}

// USDC -> NGN at a rate, truncated to 2 dp. What an offramp of this size pays
// out, before the rail reports the real figure.
export function ngnForUsdcExact(usdc: string, rate: string): string | null {
  const usdcUnits = toBaseUnits(usdc, 6);
  const rateCents = toBaseUnits(rate, 2);
  if (usdcUnits <= 0n || rateCents <= 0n) return null;
  const ngnCents = (usdcUnits * rateCents) / 1_000_000n;
  return fromBaseUnits(ngnCents, 2);
}

export function isValidOnrampNgn(amountNgn: number): boolean {
  return Number.isFinite(amountNgn) && amountNgn >= ONRAMP_MIN_NGN;
}

export function isValidOfframpAmount(amountUsdc: number, balance: number): boolean {
  return (
    Number.isFinite(amountUsdc) && amountUsdc >= OFFRAMP_MIN_USDC && amountUsdc <= balance + 1e-9
  );
}

// The idempotency key for a create. Generated once per attempt and reused
// verbatim on retries of THAT attempt (react-query retries the same mutation
// input); a new user action builds a new key. Namespaced per wallet so keys
// cannot collide across users.
export function idempotencyKey(kind: "onramp" | "offramp", wallet: string): string {
  const who = wallet.replace(/^0x/, "").slice(0, 8) || "anon";
  return `${kind}-${who}-${crypto.randomUUID()}`;
}
