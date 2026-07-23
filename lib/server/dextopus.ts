import "server-only";

// Dextopus cross-chain deposit/withdrawal. Key is server-only despite the
// pk_ prefix. Base path is confirmed against the live API when wiring the
// flows; flip DEXTOPUS_BASE if their docs settle on a different prefix.
const DEXTOPUS_BASE = "https://swap-api.dextopus.com/api";

// Only deposit-scoped paths may be proxied. Withdrawal reuses /deposit/quote.
const ALLOWED_PREFIXES = ["deposit/"];

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function dextopusRequest(
  path: string,
  init: { method: "GET" | "POST"; query?: URLSearchParams; body?: unknown; revalidate?: number }
): Promise<Response> {
  const key = process.env.DEXTOPUS_API_KEY;
  if (!key) throw new Error("DEXTOPUS_API_KEY is not set");

  const url = new URL(`${DEXTOPUS_BASE}/${path}`);
  if (init.query) url.search = init.query.toString();

  return fetch(url, {
    method: init.method,
    headers: {
      "x-api-key": key,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    ...(init.revalidate != null
      ? { next: { revalidate: init.revalidate } }
      : { cache: "no-store" }),
  });
}

// The chain and token catalogs barely change, so we cache them server-side to
// shield the shared Dextopus key from repeated client calls. Live paths like
// status and quote are never cached.
export function cacheSecondsFor(path: string): number | undefined {
  if (/^deposit\/(chains|tokens|sources|destinations)/.test(path)) return 600;
  return undefined;
}
