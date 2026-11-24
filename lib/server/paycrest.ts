import "server-only";
import { z } from "zod";
import {
  PAYCREST_NETWORK,
  type OfframpOrderRequest,
  type OnrampOrderRequest,
  type PaycrestCurrency,
  type PaycrestDeposit,
  type PaycrestInstitution,
  type PaycrestOrder,
  type PaycrestQuote,
} from "@/lib/paycrest/types";

// Server-only client for Paycrest's v2 Sender API, the bank rail for both
// directions (see docs/adr/ADR-2026-11-24-paycrest-ramping.md). Paycrest is a
// third-party API, not a WSAPI gateway service, so its base URL is a constant
// here rather than a wsapiService() lookup; the only env var is the key.
// Every response is parsed with Zod into lib/paycrest/types shapes, so a
// field we act on going missing fails loudly here instead of reaching a screen.
export const PAYCREST_BASE_URL = "https://api.paycrest.io/v2";
const TIMEOUT_MS = 20_000;

/** An error Paycrest itself returned, or a response we could not parse. */
export class PaycrestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "UPSTREAM" | "BAD_RESPONSE" | "NOT_CONFIGURED"
  ) {
    super(message);
    this.name = "PaycrestError";
  }
}

const decimal = z.string().regex(/^\d+(\.\d+)?$/);

const envelope = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z.unknown(),
});

// Paycrest validation failures carry `data: {field, message}` (sometimes an
// array of them); the useful text is there, not in the generic `message`.
const errorDetail = z.object({ field: z.string().optional(), message: z.string() });

function upstreamMessage(body: z.infer<typeof envelope> | null, status: number): string {
  if (body) {
    const one = errorDetail.safeParse(body.data);
    if (one.success) return one.data.message;
    const many = z.array(errorDetail).safeParse(body.data);
    if (many.success && many.data.length > 0) return many.data.map((d) => d.message).join("; ");
    if (body.message) return body.message;
  }
  return `Paycrest answered ${status}`;
}

function apiKey(): string {
  const key = process.env.PAYCREST_API_KEY;
  if (!key) throw new PaycrestError("Paycrest is not configured", 503, "NOT_CONFIGURED");
  return key;
}

async function call(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; auth?: boolean; revalidate?: number } = {}
): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (init.auth) headers["API-Key"] = apiKey();
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${PAYCREST_BASE_URL}/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(init.revalidate != null
      ? { next: { revalidate: init.revalidate } }
      : { cache: "no-store" }),
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new PaycrestError(`Paycrest answered ${res.status} with non-JSON`, 502, "BAD_RESPONSE");
    }
  }
  const parsed = envelope.safeParse(json);
  if (!res.ok || !parsed.success || parsed.data.status !== "success") {
    if (res.ok) {
      throw new PaycrestError("Paycrest response was not a success envelope", 502, "BAD_RESPONSE");
    }
    // 4xx is the caller's request (bad account, amount out of range): pass the
    // status through. 5xx is Paycrest's own failure: report it as a 502.
    const status = res.status >= 500 ? 502 : res.status;
    throw new PaycrestError(
      upstreamMessage(parsed.success ? parsed.data : null, res.status),
      status,
      "UPSTREAM"
    );
  }
  return parsed.data.data;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new PaycrestError(`Unexpected Paycrest ${what} response`, 502, "BAD_RESPONSE");
  }
  return result.data;
}

// --- Public reads ----------------------------------------------------------

const currencySchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
});

export async function getPaycrestCurrencies(): Promise<PaycrestCurrency[]> {
  const data = await call("currencies", { revalidate: 600 });
  return parse(z.array(currencySchema), data, "currencies").map((c) => ({
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    decimals: c.decimals,
  }));
}

const institutionSchema = z.object({ code: z.string(), name: z.string(), type: z.string() });

export async function getPaycrestInstitutions(currency: string): Promise<PaycrestInstitution[]> {
  const data = await call(`institutions/${encodeURIComponent(currency)}`, { revalidate: 600 });
  return parse(z.array(institutionSchema), data, "institutions").map((i) => ({
    code: i.code,
    name: i.name,
    type: i.type,
  }));
}

const quoteSide = z
  .object({ rate: decimal, providerIds: z.array(z.string()).nullish() })
  .transform((s) => ({ rate: s.rate, providerIds: s.providerIds ?? [] }));
const quoteSchema = z.object({ buy: quoteSide.nullish(), sell: quoteSide.nullish() });

/** Live buy and sell rates (fiat per token) for `amount` tokens on Base. */
export async function getPaycrestQuote(
  token: string,
  amount: string,
  fiat: string
): Promise<PaycrestQuote> {
  const path = ["rates", PAYCREST_NETWORK, token, amount, fiat].map(encodeURIComponent).join("/");
  const data = await call(path);
  const quote = parse(quoteSchema, data, "rate");
  return { buy: quote.buy ?? null, sell: quote.sell ?? null };
}

// --- Authenticated ---------------------------------------------------------

/**
 * Resolve the holder's name for a bank or mobile account. Paycrest answers
 * "OK" when the account is valid but the corridor gives no name: that is
 * reported as `accountName: null`, and the caller asks the user for it.
 */
export async function verifyPaycrestAccount(
  institution: string,
  accountIdentifier: string
): Promise<{ accountName: string | null }> {
  const data = await call("verify-account", {
    method: "POST",
    auth: true,
    body: { institution, accountIdentifier },
  });
  const name = parse(z.string().min(1), data, "verify-account");
  return { accountName: name === "OK" ? null : name };
}

const statusSchema = z.enum([
  "initiated",
  "deposited",
  "pending",
  "fulfilling",
  "fulfilled",
  "validated",
  "settling",
  "settled",
  "cancelled",
  "refunding",
  "refunded",
  "expired",
]);

const cryptoDeposit = z.object({
  network: z.string(),
  receiveAddress: z.string().min(1),
  amountToTransfer: decimal,
  currency: z.string(),
  validUntil: z.string().min(1),
  memo: z.string().nullish(),
});

const fiatDeposit = z.object({
  institution: z.string(),
  accountIdentifier: z.string().min(1),
  accountName: z.string(),
  amountToTransfer: decimal,
  currency: z.string(),
  validUntil: z.string().min(1),
});

function toDeposit(raw: unknown): PaycrestDeposit | null {
  const crypto = cryptoDeposit.safeParse(raw);
  if (crypto.success) return { kind: "crypto", ...crypto.data, memo: crypto.data.memo ?? null };
  const fiat = fiatDeposit.safeParse(raw);
  if (fiat.success) return { kind: "fiat", ...fiat.data };
  return null;
}

const orderSchema = z.object({
  id: z.string().min(1),
  status: statusSchema,
  direction: z.enum(["offramp", "onramp"]).nullish(),
  amount: decimal,
  rate: decimal.nullish(),
  txHash: z.string().nullish(),
  paymentReference: z.string().nullish(),
  providerAccount: z.unknown().optional(),
  source: z
    .object({ type: z.string(), refundAddress: z.string().nullish() })
    .passthrough()
    .nullish(),
  destination: z
    .object({
      type: z.string(),
      recipient: z.object({ address: z.string().nullish() }).passthrough().nullish(),
    })
    .passthrough()
    .nullish(),
});

function toOrder(raw: z.infer<typeof orderSchema>): PaycrestOrder {
  return {
    id: raw.id,
    status: raw.status,
    direction: raw.direction ?? null,
    amount: raw.amount,
    rate: raw.rate ?? null,
    deposit: toDeposit(raw.providerAccount),
    txHash: raw.txHash || null,
    paymentReference: raw.paymentReference || null,
  };
}

// The issuing country for the ID documents each onramp corridor accepts.
const KYC_ISSUER: Record<string, string> = { NGN: "NG" };

/** Fiat currencies the onramp can take KYC for today. */
export const ONRAMP_CURRENCIES = Object.keys(KYC_ISSUER);

function requireDeposit(order: PaycrestOrder, kind: PaycrestDeposit["kind"]): PaycrestOrder {
  // A new order without somewhere to pay is useless to the user, and paying a
  // guessed address would lose the money: fail instead.
  if (order.deposit?.kind !== kind) {
    throw new PaycrestError(
      "Paycrest created the order without payment details",
      502,
      "BAD_RESPONSE"
    );
  }
  return order;
}

/**
 * Create a stablecoin → fiat order. `refundAddress` is the caller's own
 * wallet, set by the server from the session, never by the browser.
 */
export async function createPaycrestOfframpOrder(
  input: OfframpOrderRequest,
  refundAddress: string
): Promise<PaycrestOrder> {
  const body = {
    amount: input.amount,
    ...(input.rate ? { rate: input.rate } : {}),
    reference: input.reference,
    source: {
      type: "crypto",
      currency: input.token,
      network: PAYCREST_NETWORK,
      refundAddress,
    },
    destination: {
      type: "fiat",
      currency: input.currency,
      ...(input.providerIds && input.providerIds.length > 0
        ? { providerIds: input.providerIds.slice(0, 3) }
        : {}),
      recipient: input.recipient,
    },
  };
  const data = await call("sender/orders", { method: "POST", auth: true, body });
  return requireDeposit(toOrder(parse(orderSchema, data, "create order")), "crypto");
}

/**
 * Create a fiat → stablecoin order. The tokens go to `recipientAddress`, the
 * caller's own wallet, set by the server. `kyc` identifies the customer paying
 * in, which Paycrest requires on every onramp; it is forwarded, never stored.
 */
export async function createPaycrestOnrampOrder(
  input: OnrampOrderRequest,
  recipientAddress: string
): Promise<PaycrestOrder> {
  const issuerCountry = KYC_ISSUER[input.currency];
  if (!issuerCountry) {
    throw new PaycrestError(`Deposits in ${input.currency} are not supported`, 400, "UPSTREAM");
  }
  const body = {
    amount: input.amount,
    amountIn: "fiat",
    reference: input.reference,
    source: {
      type: "fiat",
      currency: input.currency,
      refundAccount: input.refundAccount,
      kyc: {
        entityType: "person",
        personDetails: {
          fullName: input.kyc.fullName,
          birthDate: input.kyc.birthDate,
          idDocument: { type: input.kyc.idType, number: input.kyc.idNumber, issuerCountry },
        },
      },
    },
    destination: {
      type: "crypto",
      currency: input.token,
      recipient: { address: recipientAddress, network: PAYCREST_NETWORK },
    },
  };
  const data = await call("sender/orders", { method: "POST", auth: true, body });
  return requireDeposit(toOrder(parse(orderSchema, data, "create order")), "fiat");
}

/**
 * Read one order, with the wallet it belongs to: the refund address of an
 * offramp, the recipient of an onramp. Paycrest does not know our users, so
 * the proxy compares `owner` with the session's wallet before answering.
 */
export async function getPaycrestOrder(
  id: string
): Promise<{ order: PaycrestOrder; owner: string | null }> {
  const data = await call(`sender/orders/${encodeURIComponent(id)}`, { auth: true });
  const raw = parse(orderSchema, data, "order");
  const owner =
    raw.source?.type === "crypto"
      ? (raw.source.refundAddress ?? null)
      : (raw.destination?.recipient?.address ?? null);
  return { order: toOrder(raw), owner };
}
