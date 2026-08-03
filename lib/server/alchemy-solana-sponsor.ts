import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

const API_KEY = process.env.ALCHEMY_API_KEY;
const POLICY_ID = process.env.ALCHEMY_SOLANA_POLICY_ID;
const SOLANA_HOST = "solana-mainnet.g.alchemy.com";
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

interface SponsorBody {
  serializedTransaction: string;
  prefundRent?: boolean;
}

export async function forwardAlchemySolanaSponsorRequest(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "Alchemy API key is missing" }, { status: 500 });
  }
  if (!POLICY_ID) {
    return NextResponse.json({ error: "Alchemy Solana policy id is missing" }, { status: 500 });
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

  try {
    const res = await fetch(`https://${SOLANA_HOST}/v2/${API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_requestFeePayer",
        params: [
          {
            policyId: POLICY_ID,
            serializedTransaction: body.serializedTransaction,
            ...(body.prefundRent ? { prefundRent: true } : {}),
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json().catch(() => ({}));
    if (data?.error) {
      return NextResponse.json(
        {
          error: data.error.message ?? "Alchemy Solana sponsorship failed",
          code: data.error.code ?? null,
        },
        { status: res.ok ? 400 : res.status }
      );
    }

    const result = data?.result;
    if (!result?.serializedTransaction || typeof result.serializedTransaction !== "string") {
      return NextResponse.json(
        { error: "Alchemy returned no sponsored transaction" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      serializedTransaction: result.serializedTransaction,
      estimatedFeeLamports: result.estimatedFeeLamports ?? null,
      estimatedRentLamports: result.estimatedRentLamports ?? null,
      prefundLamports: result.prefundLamports ?? null,
      simulationSlot: result.simulationSlot ?? null,
      usesDurableNonce: result.usesDurableNonce ?? false,
      lastValidBlockHeight: result.lastValidBlockHeight ?? null,
    });
  } catch (error) {
    console.error("Alchemy Solana sponsor proxy failed:", error);
    return NextResponse.json({ error: "Solana sponsorship request failed" }, { status: 502 });
  }
}
