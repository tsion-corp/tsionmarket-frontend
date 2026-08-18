import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  cosignAndSubmitWithLocalSponsor,
  localSponsorConfigured,
  prepareWithLocalSponsor,
  rewriteFeePayerWithRpc,
} from "@/lib/server/solana-cosigner";
import { wsapiService } from "@/lib/wsapi-base";

// Solana gas sponsorship, in the gas-sponsor service's contract: prepare puts
// the sponsor wallet in the fee-payer seat before the user signs, and sponsor
// adds the sponsor signature to the user-signed transaction and submits it.
// Both steps run against the local key when SOLANA_PRIVATE_KEY is set, and
// against the platform gas-sponsor service otherwise.

const GAS_SPONSOR_BASE = process.env.GAS_SPONSOR_API_URL ?? wsapiService("gas-sponsor");
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const RPC_URLS = () => {
  const configured = process.env.SOLANA_RPC_URL;
  const key = process.env.ALCHEMY_API_KEY;
  return [
    configured,
    key ? `https://solana-mainnet.g.alchemy.com/v2/${key}` : undefined,
    PUBLIC_SOLANA_RPC,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
};

interface SponsorBody {
  serializedTransaction: string;
  prefundRent?: boolean;
}

interface SponsorResponseData {
  sponsoredSerializedTransaction?: string;
  submittedSignature?: string | null;
  prefundRent?: boolean | null;
  signer?: string | null;
  sponsorPublicKey?: string | null;
  previewOnly?: boolean | null;
  configured?: boolean | null;
  note?: string | null;
}

function readMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header;
  const cookieToken = req.cookies.get("privy-token")?.value;
  return cookieToken ? `Bearer ${cookieToken}` : null;
}

function identityToken(req: NextRequest): string | null {
  return req.headers.get("privy-id-token") ?? req.cookies.get("privy-id-token")?.value ?? null;
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const authorization = bearerToken(req);
  if (authorization) headers.authorization = authorization;
  const privyIdToken = identityToken(req);
  if (privyIdToken) headers["privy-id-token"] = privyIdToken;
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const realIp = req.headers.get("x-real-ip");
  if (realIp) headers["x-real-ip"] = realIp;
  return headers;
}

async function readSponsorBody(req: NextRequest): Promise<SponsorBody | NextResponse> {
  const body = (await req.json().catch(() => null)) as SponsorBody | null;
  if (!body || typeof body.serializedTransaction !== "string") {
    return NextResponse.json({ error: "serializedTransaction is required" }, { status: 400 });
  }
  if (!BASE64_RE.test(body.serializedTransaction)) {
    return NextResponse.json({ error: "serializedTransaction must be base64" }, { status: 400 });
  }
  if (body.prefundRent != null && typeof body.prefundRent !== "boolean") {
    return NextResponse.json({ error: "prefundRent must be boolean" }, { status: 400 });
  }
  return body;
}

// The service's sponsor wallet, cached for the process: it only changes with
// a service redeploy, and prepare runs on every Solana transaction.
let cachedServiceSponsorKey: string | null = null;

async function serviceSponsorPublicKey(req: NextRequest): Promise<string> {
  if (cachedServiceSponsorKey) return cachedServiceSponsorKey;
  const res = await fetch(`${GAS_SPONSOR_BASE}/capabilities`, {
    headers: forwardHeaders(req),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await res.json().catch(() => ({}));
  const key = payload?.data?.solana?.sponsorPublicKey;
  if (!res.ok || typeof key !== "string" || !key) {
    throw new Error("Gas sponsor service did not report a sponsor wallet");
  }
  cachedServiceSponsorKey = key;
  return key;
}

// Step one of sponsorship: rewrite the fee payer to the sponsor wallet and
// hand the still-unsigned transaction back for the user's signature.
export async function prepareSolanaSponsorRequest(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await readSponsorBody(req);
  if (body instanceof NextResponse) return body;

  try {
    const prepared = localSponsorConfigured()
      ? await prepareWithLocalSponsor(body.serializedTransaction, body.prefundRent)
      : await rewriteFeePayerWithRpc(
          body.serializedTransaction,
          await serviceSponsorPublicKey(req),
          RPC_URLS(),
          body.prefundRent
        );
    return NextResponse.json({
      serializedTransaction: prepared.transaction,
      sponsorPublicKey: prepared.sponsorPublicKey,
    });
  } catch (error) {
    console.error("Solana sponsor prepare failed:", error);
    return NextResponse.json({ error: "Solana sponsorship failed" }, { status: 502 });
  }
}

// Step two: the user-signed transaction comes back, the sponsor signs its
// fee-payer slot and submits. The response always carries submittedSignature.
export async function forwardSolanaSponsorRequest(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await readSponsorBody(req);
  if (body instanceof NextResponse) return body;

  if (localSponsorConfigured()) {
    try {
      const result = await cosignAndSubmitWithLocalSponsor(body.serializedTransaction);
      return NextResponse.json({
        serializedTransaction: result.transaction,
        estimatedFeeLamports: null,
        estimatedRentLamports: null,
        prefundLamports: null,
        simulationSlot: null,
        usesDurableNonce: false,
        lastValidBlockHeight: null,
        submittedSignature: result.submittedSignature,
        prefundRent: body.prefundRent ?? false,
        signer: "local-key",
        sponsorPublicKey: result.sponsorPublicKey,
        previewOnly: false,
        configured: true,
        note: null,
      });
    } catch (error) {
      console.error("Local Solana sponsor failed:", error);
      return NextResponse.json({ error: "Solana sponsorship failed" }, { status: 502 });
    }
  }

  try {
    const res = await fetch(`${GAS_SPONSOR_BASE}/solana/sponsor`, {
      method: "POST",
      headers: forwardHeaders(req),
      // Rent was handled when /prepare rewrote the transaction. Forwarding
      // prefundRent here makes the remote service transfer the same reserve to
      // the user as well, charging the sponsor twice.
      body: JSON.stringify({ serializedTransaction: body.serializedTransaction }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.success === false) {
      const message =
        readMessage(payload?.error) ?? readMessage(payload?.message) ?? "Solana sponsorship failed";
      return NextResponse.json({ error: message }, { status: res.status || 502 });
    }

    const data = payload?.data as SponsorResponseData | undefined;
    if (!data?.sponsoredSerializedTransaction) {
      return NextResponse.json(
        { error: "Gas sponsor returned no sponsored transaction" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      serializedTransaction: data.sponsoredSerializedTransaction,
      estimatedFeeLamports: null,
      estimatedRentLamports: null,
      prefundLamports: null,
      simulationSlot: null,
      usesDurableNonce: false,
      lastValidBlockHeight: null,
      submittedSignature: data.submittedSignature ?? null,
      prefundRent: false,
      signer: data.signer ?? null,
      sponsorPublicKey: data.sponsorPublicKey ?? null,
      previewOnly: data.previewOnly ?? null,
      configured: data.configured ?? null,
      note: data.note ?? null,
    });
  } catch (error) {
    console.error("Solana sponsor proxy failed:", error);
    return NextResponse.json({ error: "Solana sponsorship request failed" }, { status: 502 });
  }
}
