import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

const GAS_SPONSOR_BASE = process.env.GAS_SPONSOR_API_URL ?? wsapiService("gas-sponsor");
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

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

export async function forwardSolanaSponsorRequest(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const authorization = bearerToken(req);
  if (authorization) headers.authorization = authorization;
  const privyIdToken = identityToken(req);
  if (privyIdToken) headers["privy-id-token"] = privyIdToken;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const realIp = req.headers.get("x-real-ip");
  if (realIp) headers["x-real-ip"] = realIp;

  try {
    const res = await fetch(`${GAS_SPONSOR_BASE}/solana/sponsor`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        serializedTransaction: body.serializedTransaction,
        ...(body.prefundRent ? { prefundRent: true } : {}),
      }),
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
      prefundRent: data.prefundRent ?? body.prefundRent ?? false,
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
