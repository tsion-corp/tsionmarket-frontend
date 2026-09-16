import { NextResponse, type NextRequest } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";
import { isSafeProxyPath } from "@/lib/server/proxy-path";
import { isProxiedVaultRead, isProxiedVaultWrite } from "@/lib/api/vault-proxy-paths";

// Server-side proxy for the world-street-vault game API. The gateway now sends
// CORS headers, so a browser could call it directly; the proxy stays because
// it collapses every user's polls into one upstream request per path under
// the gateway's shared rate limit, and it keeps the vault consistent with
// every other external API in this app, which is also proxied. Read-only:
// only the game read endpoints are forwarded.
// Override for a local vault service; unset, the shared gateway serves it.
const BASE = process.env.NEXT_PUBLIC_VAULT_API_URL ?? wsapiService("world-street-vault");

// The gateway rate-limits ~100 requests/min per IP, and every user's polls now
// share this server's IP. A short cache collapses concurrent/near-simultaneous
// requests for the same path into one upstream call so we stay well under it.
// game/status is the hot path at round end — the pot and timer must converge
// within a couple of seconds of settlement, so it gets a much shorter TTL
// than the slower-moving feeds.
const CACHE_TTL_MS = 4000;
const STATUS_TTL_MS = 1000;
// The contract's tunables change rarely and the service caches them for 30 s
// itself; a minute here keeps a lobby full of browsers to one upstream read.
const CONFIG_TTL_MS = 60_000;
const cache = new Map<string, { expires: number; body: string; status: number }>();

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Vault isn't configured" } },
      { status: 503 }
    );
  }

  const joined = path.join("/");
  if (!isSafeProxyPath(joined)) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid path" } },
      { status: 400 }
    );
  }
  // Only the public read endpoints are proxied; see lib/api/vault-proxy-paths.
  if (!isProxiedVaultRead(joined)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  const url = `${BASE}/${joined}${req.nextUrl.search}`;
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) {
    return new NextResponse(hit.body, {
      status: hit.status,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    // The lobby and a single game are the hot paths at round end: a pot and a
    // timer have to converge within a second or two of settlement. The feeds
    // move slowly enough to sit on the longer cache.
    const live = joined === "games" || /^games\/\d+$/.test(joined);
    const ttl = joined === "config" ? CONFIG_TTL_MS : live ? STATUS_TTL_MS : CACHE_TTL_MS;
    cache.set(url, { expires: Date.now() + ttl, body, status: res.status });
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Vault proxy failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Vault request failed" } },
      { status: 502 }
    );
  }
}

/**
 * The one write the proxy forwards: handing the service a hash the wallet just
 * sent, so it can report back what that transaction turned out to be.
 *
 * This is what replaces polling a receipt and decoding GameStarted to learn our
 * own gameId. Nothing is cached — a hash is handed over once — and no identity
 * is injected: the service treats it as a public claim about a public
 * transaction, and verifies it against the chain itself.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!BASE) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Vault isn't configured" } },
      { status: 503 }
    );
  }

  const joined = path.join("/");
  if (!isSafeProxyPath(joined) || !isProxiedVaultWrite(joined)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  try {
    const res = await fetch(`${BASE}/${joined}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: await req.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Vault proxy write failed:", error);
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Vault request failed" } },
      { status: 502 }
    );
  }
}
