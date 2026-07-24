import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Remote Builder Signing endpoint. The browser Polymarket SDK sends the request
// details (method, path, body) it wants to authenticate; we HMAC-sign them with
// the builder secret server-side and return the four POLY_BUILDER_* headers. The
// secret never reaches the client. Gated to authenticated WSWS users.
//
// Signature per docs.polymarket.com/getting-started/api#authentication:
//   message   = timestamp + METHOD + path + body
//   signature = urlsafeBase64( HMAC-SHA256( base64Decode(secret), message ) )
function buildBuilderSignature(
  secret: string,
  timestamp: number,
  method: string,
  path: string,
  body: string
): string {
  const message = `${timestamp}${method}${path}${body}`;
  const key = Buffer.from(secret, "base64");
  const digest = crypto.createHmac("sha256", key).update(message).digest("base64");
  // URL-safe, padding preserved.
  return digest.replace(/\+/g, "-").replace(/\//g, "_");
}

interface SignBody {
  method?: string;
  path?: string;
  body?: string;
}

export async function POST(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.POLYMARKET_BUILDER_API_KEY;
  const secret = process.env.POLYMARKET_BUILDER_SECRET;
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) {
    return NextResponse.json({ error: "Polymarket builder not configured" }, { status: 503 });
  }

  const { method = "GET", path = "", body = "" } = (await req.json().catch(() => ({}))) as SignBody;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildBuilderSignature(secret, timestamp, method.toUpperCase(), path, body);

  return NextResponse.json({
    POLY_BUILDER_API_KEY: key,
    POLY_BUILDER_PASSPHRASE: passphrase,
    POLY_BUILDER_SIGNATURE: signature,
    POLY_BUILDER_TIMESTAMP: `${timestamp}`,
  });
}
