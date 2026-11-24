import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRequestIdentity, verifyRequest } from "@/lib/server/auth";
import {
  createPaycrestOfframpOrder,
  createPaycrestOnrampOrder,
  getPaycrestCurrencies,
  getPaycrestInstitutions,
  getPaycrestOrder,
  getPaycrestQuote,
  ONRAMP_CURRENCIES,
  PaycrestError,
  verifyPaycrestAccount,
} from "@/lib/server/paycrest";
import { parseUnits } from "@/lib/paycrest/amounts";
import { PAYCREST_TOKENS } from "@/lib/paycrest/types";

// The browser's only door to Paycrest (docs/adr/ADR-2026-11-24-paycrest-ramping.md).
// Rates, currencies and bank lists are public. Account checks and orders need
// a session, and the wallet on every order is the session's own embedded EVM
// wallet, set here: the browser never names one, so no user can make another
// user's wallet the refund target or the recipient. Paycrest has no notion of
// our users, so an order is only read back to the wallet it belongs to.
// KYC fields pass straight through to Paycrest and are never logged.

const TOKEN_DECIMALS = 6; // USDC and USDT on Base
const FIAT_DECIMALS = 2;

const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const decimalText = z.string().regex(/^\d+(\.\d+)?$/);
const institution = z.string().regex(/^[A-Z0-9]{4,16}$/);
const accountIdentifier = z.string().regex(/^[0-9A-Za-z+-]{4,32}$/);
const accountName = z.string().trim().min(2).max(120);
const reference = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

// A positive amount no finer than its unit allows, checked in bigint.
const amountIn = (decimals: number) =>
  decimalText.refine((text) => {
    const units = parseUnits(text, decimals);
    return units !== null && units > 0n;
  }, "Invalid amount");

const offrampBody = z
  .object({
    amount: amountIn(TOKEN_DECIMALS),
    token: z.enum(PAYCREST_TOKENS),
    currency: currencyCode,
    rate: decimalText.optional(),
    providerIds: z
      .array(z.string().regex(/^[A-Za-z]{8}$/))
      .max(3)
      .optional(),
    recipient: z
      .object({
        institution,
        accountIdentifier,
        accountName,
        memo: z.string().trim().min(1).max(140),
      })
      .strict(),
    reference,
  })
  .strict();

const onrampBody = z
  .object({
    amount: amountIn(FIAT_DECIMALS),
    token: z.enum(PAYCREST_TOKENS),
    currency: currencyCode.refine((c) => ONRAMP_CURRENCIES.includes(c), "Unsupported currency"),
    refundAccount: z.object({ institution, accountIdentifier, accountName }).strict(),
    kyc: z
      .object({
        fullName: accountName,
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        idType: z.enum(["BVN", "nationalID"]),
        // NGN's BVN and NIN are both 11 digits, the only corridor taken today.
        idNumber: z.string().regex(/^\d{11}$/),
      })
      .strict(),
    reference,
  })
  .strict();

const verifyBody = z.object({ institution, accountIdentifier }).strict();

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function ok(data: unknown, cacheSeconds?: number) {
  return NextResponse.json(
    { success: true, data },
    cacheSeconds
      ? {
          headers: {
            "cache-control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`,
          },
        }
      : { headers: { "cache-control": "no-store" } }
  );
}

function fromError(error: unknown) {
  if (error instanceof PaycrestError) return fail(error.status, error.code, error.message);
  // Network or timeout: logged (without any request body) and reported.
  console.error("Paycrest proxy failed:", error instanceof Error ? error.message : error);
  return fail(502, "SERVICE_UNAVAILABLE", "Paycrest unreachable");
}

async function sessionWallet(req: NextRequest): Promise<string | NextResponse> {
  const claims = await verifyRequest(req);
  if (!claims) return fail(401, "UNAUTHORIZED", "Sign in first.");
  const identity = await getRequestIdentity(req, claims);
  if (!identity?.evmAddress) return fail(409, "NO_WALLET", "No wallet on this account yet.");
  return identity.evmAddress;
}

async function readBody<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T | NextResponse> {
  const json: unknown = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Paths only: the values may be KYC data and are not echoed.
    const fields = parsed.error.issues.map((i) => i.path.join(".") || "body").join(", ");
    return fail(400, "INVALID_REQUEST", `Invalid request: ${fields}`);
  }
  return parsed.data;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  try {
    if (path.length === 1 && path[0] === "currencies") {
      return ok(await getPaycrestCurrencies(), 600);
    }
    if (path.length === 2 && path[0] === "institutions") {
      if (!currencyCode.safeParse(path[1]).success)
        return fail(400, "INVALID_REQUEST", "Bad currency");
      return ok(await getPaycrestInstitutions(path[1]), 600);
    }
    if (path.length === 4 && path[0] === "rates") {
      const [, token, amount, fiat] = path;
      const valid =
        z.enum(PAYCREST_TOKENS).safeParse(token).success &&
        amountIn(TOKEN_DECIMALS).safeParse(amount).success &&
        currencyCode.safeParse(fiat).success;
      if (!valid) return fail(400, "INVALID_REQUEST", "Bad rate request");
      return ok(await getPaycrestQuote(token, amount, fiat));
    }
    if (path.length === 2 && path[0] === "orders") {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(path[1])) return fail(404, "NOT_FOUND", "Not found");
      const wallet = await sessionWallet(req);
      if (wallet instanceof NextResponse) return wallet;
      const { order, owner } = await getPaycrestOrder(path[1]);
      // Someone else's order reads exactly like a missing one.
      if (!owner || owner.toLowerCase() !== wallet.toLowerCase()) {
        return fail(404, "NOT_FOUND", "Not found");
      }
      return ok(order);
    }
  } catch (error) {
    return fromError(error);
  }
  return fail(404, "NOT_FOUND", "Not found");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const joined = (await ctx.params).path.join("/");
  if (joined !== "verify-account" && joined !== "orders/offramp" && joined !== "orders/onramp") {
    return fail(404, "NOT_FOUND", "Not found");
  }
  const wallet = await sessionWallet(req);
  if (wallet instanceof NextResponse) return wallet;
  try {
    if (joined === "verify-account") {
      const body = await readBody(req, verifyBody);
      if (body instanceof NextResponse) return body;
      return ok(await verifyPaycrestAccount(body.institution, body.accountIdentifier));
    }
    if (joined === "orders/offramp") {
      const body = await readBody(req, offrampBody);
      if (body instanceof NextResponse) return body;
      return ok(await createPaycrestOfframpOrder(body, wallet));
    }
    const body = await readBody(req, onrampBody);
    if (body instanceof NextResponse) return body;
    return ok(await createPaycrestOnrampOrder(body, wallet));
  } catch (error) {
    return fromError(error);
  }
}
