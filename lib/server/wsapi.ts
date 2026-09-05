import "server-only";
import { WSAPI_BASE } from "@/lib/wsapi-base";

// World Street backend gateway. Public API, standard { success, data | error }
// envelope. RWA endpoints live under /v1/rwa/*, perp endpoints under /v1/perp/*.
const BASE = WSAPI_BASE;

// The perp service can be pointed elsewhere while it is being stood up; it
// falls back to the shared gateway once deployed there.
const PERP_BASE = process.env.PERP_API_BASE_URL ?? BASE;

const ALLOWED = /^(health|categories|assets|assets\/[^/]+|quote|build)$/;

export function isAllowedRwaPath(path: string): boolean {
  // A dot segment or an encoded one would be normalized away by new URL(),
  // letting "assets/../../health" reach any gateway path. Reject the
  // characters that make traversal possible before the pattern is applied.
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  return ALLOWED.test(path);
}

// Trading endpoints must not be cached; the asset registry can be.
export function rwaRevalidate(path: string): number | undefined {
  if (path === "categories" || path === "assets" || path.startsWith("assets/")) return 60;
  return undefined;
}

// The perp surface: funding (Base -> Arbitrum) plus Ark's own reads and
// prepare/submit write pairs (see apps/perp's own README for the signing
// model: every write is signed client-side, this backend never forwards a
// private key).
const PERP_ALLOWED =
  /^(health|funding\/deposit-address\/[^/]+|funding\/deposit-status\/[^/]+|ark\/wallet\/[^/]+|ark\/assets|ark\/prices|ark\/market-contexts|ark\/funding-history\/[^/]+|ark\/candles\/[^/]+|ark\/account-state\/[^/]+|ark\/arbitrum-balance\/[^/]+|ark\/wallets\/[^/]+\/(positions|positions\/closed|orders|builder-fee|abstraction-mode|withdrawals\/pending)|ark\/orders\/(prepare|submit|cancel\/(prepare|submit)|trigger\/(prepare|submit))|ark\/leverage\/(prepare|submit)|ark\/bridge\/(prepare|confirm)|ark\/dex-transfer\/(prepare|submit)|ark\/withdrawals\/(prepare|submit)|ark\/positions\/close\/(prepare|submit)|ark\/builder-fee\/(prepare|submit)|ark\/abstraction-mode\/(prepare|submit))$/;

export function isAllowedPerpPath(path: string): boolean {
  // Same traversal guard as the RWA allowlist: a raw ".." or encoded segment
  // would otherwise slip through the pattern once the gateway normalizes the URL.
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  return PERP_ALLOWED.test(path);
}

// Ark's asset registry barely changes; live prices and per-market metrics turn
// over in seconds, so a short shared cache collapses concurrent users into one
// upstream call without serving stale marks. Everything else in the surface
// (margin, positions, orders) must never be stale.
export function perpRevalidate(path: string): number | undefined {
  if (path === "ark/assets") return 300;
  if (path === "ark/prices") return 3;
  return undefined;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GatewayInit {
  method: "GET" | "POST";
  query?: URLSearchParams;
  body?: unknown;
  revalidate?: number;
  clientIp?: string;
}

async function gatewayRequest(url: URL, init: GatewayInit): Promise<Response> {
  if (init.query) url.search = init.query.toString();

  // Every user's traffic is proxied through this server, so without the
  // originating IP the gateway sees one shared address and its per-IP rate limit
  // becomes a single bucket for all users. Forward the real client IP so the
  // limit is applied per user. Harmless if the gateway ignores it.
  const headers: Record<string, string> = {};
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.clientIp) {
    headers["X-Forwarded-For"] = init.clientIp;
    headers["X-Real-IP"] = init.clientIp;
  }

  const send = () =>
    fetch(url, {
      method: init.method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      // Without this a hung gateway hangs everything awaiting it, including
      // the portfolio's balances for every other chain.
      signal: AbortSignal.timeout(12_000),
      ...(init.revalidate != null
        ? { next: { revalidate: init.revalidate } }
        : { cache: "no-store" }),
    });

  // Retry idempotent GETs on a transient upstream failure (network error or 5xx)
  // so a brief backend hiccup does not surface to the client. POSTs are never
  // retried, since quote/build must not run twice.
  const retries = init.method === "GET" ? 2 : 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await send();
      if (res.status < 500 || attempt === retries) return res;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await delay(300 * (attempt + 1));
  }
  throw lastError;
}

export async function wsapiRwaRequest(path: string, init: GatewayInit): Promise<Response> {
  return gatewayRequest(new URL(`${BASE}/v1/rwa/${path}`), init);
}

export async function wsapiPerpRequest(path: string, init: GatewayInit): Promise<Response> {
  return gatewayRequest(new URL(`${PERP_BASE}/v1/perp/${path}`), init);
}
