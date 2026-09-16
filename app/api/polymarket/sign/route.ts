import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  polymarketBuilderCredentials,
  polymarketBuilderHeaders,
} from "@/lib/server/polymarket-builder";

// Remote Builder Signing endpoint. The browser Polymarket SDK sends the request
// details (method, path, body) it wants to authenticate; we HMAC-sign them with
// the builder secret server-side and return the four POLY_BUILDER_* headers. The
// secret never reaches the client. Gated to authenticated WSWS users.
//
// Signature per docs.polymarket.com/getting-started/api#authentication:
//   message   = timestamp + METHOD + path + body
//   signature = urlsafeBase64( HMAC-SHA256( base64Decode(secret), message ) )
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

  const credentials = polymarketBuilderCredentials();
  if (!credentials) {
    return NextResponse.json({ error: "Polymarket builder not configured" }, { status: 503 });
  }

  const { method = "GET", path = "", body = "" } = (await req.json().catch(() => ({}))) as SignBody;

  return NextResponse.json(polymarketBuilderHeaders(credentials, { method, path, body }));
}
