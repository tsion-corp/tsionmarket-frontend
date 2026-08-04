// Pouch Finance onramp: fund a wallet in Naira. A verified user asks for an
// amount, we create an onramp with Pouch and receive a one-off NGN bank account
// to pay into. Crypto settles to the wallet address we send, so the user
// transfers Naira and their USDC balance credits automatically. This module
// holds the domain types, the settlement asset, response normalization, and pure
// helpers. Provider raw shapes never leave here; components and hooks see only
// the normalized types below.

// The app credits every deposit as USDC on Base, so the onramp settles to the
// same asset and network. These are the values Pouch expects for the destination
// crypto. If Pouch's enum for the Base network ever differs, change it here only.
export const ONRAMP_SETTLEMENT = {
  cryptoCurrency: "USDC",
  cryptoNetwork: "BASE",
} as const;

// The fiat side. Pouch prices the onramp from a USD `amount` and converts it to
// the local payout currency (Naira, for Nigeria), so the request currency is USD
// and the country selects the payout rail.
export const ONRAMP_FIAT = {
  amountCurrency: "USD",
  countryCode: "NG",
  localCurrency: "NGN",
} as const;

// A small USD floor for the server, so a dust request never reaches the
// provider. The user-facing minimum is set in Naira below.
export const ONRAMP_MIN_USD = 1;

// The minimum deposit in Naira. This is the amount the user actually enters, so
// the floor is enforced against it directly rather than a converted figure.
export const ONRAMP_MIN_NGN = 5000;

// The unified status the UI reads, mapped from Pouch's create and session enums.
// "awaiting_payment" means the bank account is live and waiting for the transfer;
// "processing" means Pouch saw the payment and is settling crypto.
export type OnrampStatus = "awaiting_payment" | "processing" | "completed" | "failed" | "expired";

// The NGN account the user transfers into. All fields come from Pouch's payment
// instruction; amountNgn is the exact figure to send.
export interface BankInstructions {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amountNgn: number;
  reference: string;
  expiresAt: string | null;
}

// The result of creating an onramp: the account to pay into plus the identifiers
// used to poll for settlement.
export interface OnrampCreation {
  sessionId: string | null;
  providerRef: string | null;
  status: OnrampStatus;
  // USDC the user will receive, as quoted by Pouch.
  cryptoAmount: number | null;
  cryptoCurrency: string;
  bank: BankInstructions | null;
}

// A settlement status poll.
export interface OnrampStatusResult {
  status: OnrampStatus;
  cryptoAmount: number | null;
  transactionHash: string | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Parse a provider number that may arrive as a number or a numeric string.
// Returns null for anything else so a missing figure is never shown as 0.
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

// Map any of Pouch's raw status strings to our unified status. The session poll
// uses PENDING_IDENTITY / PAYMENT_PENDING while awaiting the transfer, then moves
// through processing states to COMPLETED; the transaction sub-status mirrors it.
export function normalizeOnrampStatus(raw: string | null | undefined): OnrampStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "COMPLETED":
    case "SETTLED":
    case "SUCCESS":
    case "SUCCESSFUL":
      return "completed";
    case "FAILED":
    case "CANCELLED":
    case "CANCELED":
    case "DECLINED":
      return "failed";
    case "EXPIRED":
      return "expired";
    case "PROCESSING":
    case "PAYMENT_PROCESSING":
    case "PAYMENT_RECEIVED":
    case "PROVIDER_INITIATED":
    case "IDENTITY_COLLECTED":
    case "SETTLING":
      return "processing";
    case "PENDING_PAYMENT":
    case "PAYMENT_PENDING":
    case "PENDING":
    case "PENDING_IDENTITY":
    case "":
      return "awaiting_payment";
    default:
      // An unknown status is treated as in-flight so we neither claim success
      // nor tell the user to keep waiting for a payment already made.
      return "processing";
  }
}

// A terminal status needs no more polling.
export function isTerminalOnrampStatus(status: OnrampStatus): boolean {
  return status === "completed" || status === "failed" || status === "expired";
}

// Pull the bank instructions out of a payment-instruction block. Pouch names the
// exact Naira figure `amountLocal`; older shapes used `amount`. Drops the block
// when no account number is present.
function normalizeBank(
  block: Record<string, unknown> | undefined,
  root: Record<string, unknown>
): BankInstructions | null {
  if (!block) return null;
  const accountNumber = asString(block.accountNumber).trim();
  if (!accountNumber) return null;
  return {
    bankName: asString(block.bankName).trim(),
    accountNumber,
    accountName: asString(block.accountName).trim(),
    amountNgn: asNumber(block.amountLocal) ?? asNumber(block.amount) ?? asNumber(root.amount) ?? 0,
    reference: asString(block.reference).trim(),
    expiresAt: asString(block.expiresAt) || null,
  };
}

// Normalize a create-onramp response into the domain object the UI renders. The
// Shared KYC ramp returns a singular `paymentInstruction` with the crypto amount
// inside it and no top-level status, so a fresh creation is awaiting payment.
export function normalizeOnrampCreation(raw: unknown): OnrampCreation {
  const record = asRecord(raw) ?? {};
  const block = asRecord(record.paymentInstruction) ?? asRecord(record.paymentInstructions);
  return {
    sessionId: asString(record.sessionId) || null,
    providerRef: asString(record.providerRef) || null,
    status: normalizeOnrampStatus(asString(record.status)),
    cryptoAmount: asNumber(record.cryptoAmount) ?? (block ? asNumber(block.cryptoAmount) : null),
    cryptoCurrency:
      asString(record.cryptoCurrency) ||
      (block ? asString(block.cryptoCurrency) : "") ||
      ONRAMP_SETTLEMENT.cryptoCurrency,
    bank: normalizeBank(block, record),
  };
}

// Normalize a session status response for polling. Completion is signalled by
// either the session status or the transaction sub-status reaching a terminal
// state, or the transaction being settled.
export function normalizeOnrampStatusResult(raw: unknown): OnrampStatusResult {
  const record = asRecord(raw) ?? {};
  const tx = asRecord(record.transaction);
  const block = asRecord(record.paymentInstruction) ?? asRecord(record.paymentInstructions);

  const sessionState = normalizeOnrampStatus(asString(record.status));
  const txState = tx ? normalizeOnrampStatus(asString(tx.status)) : null;
  const settled = tx ? asString(tx.settledAt).trim() !== "" : false;

  let status: OnrampStatus = sessionState;
  if (settled || txState === "completed" || sessionState === "completed") {
    status = "completed";
  } else if (txState === "failed" || sessionState === "failed") {
    status = "failed";
  } else if (sessionState === "expired") {
    status = "expired";
  } else if (txState === "processing" || sessionState === "processing") {
    status = "processing";
  }

  const hash =
    (tx ? asString(tx.transactionHash) || asString(tx.txHash) || asString(tx.hash) : "") ||
    asString(record.transactionHash);

  return {
    status,
    cryptoAmount:
      (tx ? asNumber(tx.cryptoAmount) : null) ??
      (block ? asNumber(block.cryptoAmount) : null) ??
      asNumber(record.cryptoAmount),
    transactionHash: hash || null,
  };
}

// Whether the requested USD amount is worth sending to Pouch.
export function isValidOnrampAmount(amountUsd: number): boolean {
  return Number.isFinite(amountUsd) && amountUsd >= ONRAMP_MIN_USD;
}

// Whether the Naira amount the user entered meets the minimum deposit.
export function isValidOnrampNgn(amountNgn: number): boolean {
  return Number.isFinite(amountNgn) && amountNgn >= ONRAMP_MIN_NGN;
}

// Pouch's live onramp rate (Naira per USD) from the crypto/rate response. Using
// this for the estimate keeps it in step with the amount Pouch actually charges,
// instead of a generic mid-market rate.
export function normalizePouchRate(raw: unknown): number | null {
  const record = asRecord(raw);
  const rate = record ? asNumber(record.rate) : null;
  return rate != null && rate > 0 ? rate : null;
}

// A display-only Naira estimate for the amount entry, before Pouch returns the
// exact figure. The real amount to pay always comes from the create response, so
// this is intentionally an approximation and is labelled as such in the UI.
export function estimatedNgn(amountUsd: number, usdNgnRate: number): number | null {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  if (!Number.isFinite(usdNgnRate) || usdNgnRate <= 0) return null;
  return amountUsd * usdNgnRate;
}

// The USD equivalent of a Naira amount the user typed, using the live rate
// (Naira per USD). Pouch is priced in USD, so this is what we send; it is also
// shown to the user so they can pick a precise amount. Approximate: the provider
// applies its own rate and returns the exact Naira to pay.
export function estimatedUsd(amountNgn: number, usdNgnRate: number): number | null {
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) return null;
  if (!Number.isFinite(usdNgnRate) || usdNgnRate <= 0) return null;
  return amountNgn / usdNgnRate;
}
