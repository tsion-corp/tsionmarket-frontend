// Pouch Finance offramp: withdraw USDC to a Nigerian bank account. A verified
// user picks a bank, enters the account, and an amount of USDC. Pouch returns a
// one-off Base address; the app sends the USDC there and Pouch pays Naira to the
// bank. Reuses the Shared KYC session and the USDC-on-Base settlement asset, and
// the shared session-status model from the onramp. Provider raw shapes never
// leave this module.

import {
  normalizeOnrampStatus,
  ONRAMP_FIAT,
  ONRAMP_SETTLEMENT,
  type OnrampStatus,
} from "@/lib/pouch/onramp";

// The offramp sells USDC on Base for the local payout currency.
export const OFFRAMP = {
  cryptoCurrency: ONRAMP_SETTLEMENT.cryptoCurrency,
  cryptoNetwork: ONRAMP_SETTLEMENT.cryptoNetwork,
  currency: ONRAMP_FIAT.localCurrency,
  countryCode: ONRAMP_FIAT.countryCode,
} as const;

// A small floor so a dust withdrawal never reaches the provider.
export const OFFRAMP_MIN_USDC = 1;

// The payout provider for Nigeria. Bank verification and settlement run through
// it, and verify-bank requires it explicitly.
export const POUCH_PROVIDER_ID = "yellowcard";

// A bank or mobile-money network the payout can target. `id` is the networkId
// Pouch expects; `name` is the display label.
export interface BankNetwork {
  id: string;
  name: string;
}

// The outcome of verifying an account number against a bank.
export interface VerifiedBank {
  verified: boolean;
  accountName: string;
}

// The payout account sent to the offramp endpoint.
export interface BankAccountInput {
  networkId: string;
  accountNumber: string;
  accountName: string;
}

// The result of creating an offramp: where to send the USDC and what the user
// receives, plus the identifiers used to poll for settlement.
export interface OfframpCreation {
  sessionId: string | null;
  providerRef: string | null;
  status: OnrampStatus;
  // The Base address to send the USDC to.
  walletAddress: string | null;
  cryptoAmount: number | null;
  // Naira the user receives.
  amountNgn: number | null;
  fxRate: number | null;
  expiresAt: string | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// Normalize the bank-networks list. Tolerates a bare array or a `{ networks }`
// wrapper, dropping entries without an id or name.
export function normalizeBankNetworks(raw: unknown): BankNetwork[] {
  const record = asRecord(raw);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(record?.networks)
      ? (record!.networks as unknown[])
      : Array.isArray(record?.data)
        ? (record!.data as unknown[])
        : [];
  const out: BankNetwork[] = [];
  for (const entry of list) {
    const item = asRecord(entry);
    if (!item) continue;
    const id = asString(item.id).trim();
    const name = asString(item.name).trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

// Normalize a verify-bank response into whether it verified and the resolved
// account holder name.
export function normalizeVerifiedBank(raw: unknown): VerifiedBank {
  const record = asRecord(raw) ?? {};
  return {
    verified: record.verified === true,
    accountName: asString(record.accountName).trim(),
  };
}

// Normalize a create-offramp response. The crypto details (where to send, the
// amount, the payout figure) live under `cryptoInstruction`; there is no
// top-level status on creation, so the offramp starts awaiting the deposit.
export function normalizeOfframpCreation(raw: unknown): OfframpCreation {
  const record = asRecord(raw) ?? {};
  const instruction = asRecord(record.cryptoInstruction) ?? {};
  return {
    sessionId: asString(record.sessionId) || null,
    providerRef: asString(record.providerRef) || null,
    status: normalizeOnrampStatus(asString(record.status)),
    walletAddress: asString(instruction.walletAddress) || null,
    cryptoAmount: asNumber(instruction.cryptoAmount),
    amountNgn: asNumber(instruction.amountLocal),
    fxRate: asNumber(instruction.fxRate),
    expiresAt: asString(instruction.expiresAt) || null,
  };
}

// Whether the requested USDC amount clears the minimum and the wallet balance.
export function isValidOfframpAmount(amountUsdc: number, balance: number): boolean {
  return (
    Number.isFinite(amountUsdc) &&
    amountUsdc >= OFFRAMP_MIN_USDC &&
    Number.isFinite(balance) &&
    amountUsdc <= balance
  );
}

// A Nigerian bank account number is exactly 10 digits.
export function isValidAccountNumber(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber.trim());
}

// A display-only Naira estimate for the amount entry, using the live sell rate.
// The exact figure comes from the create response.
export function estimatedPayoutNgn(amountUsdc: number, usdNgnRate: number): number | null {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) return null;
  if (!Number.isFinite(usdNgnRate) || usdNgnRate <= 0) return null;
  return amountUsdc * usdNgnRate;
}
