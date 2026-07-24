import "server-only";

// World Street backend gateway. Public API, standard { success, data | error }
// envelope. RWA endpoints live under /v1/rwa/*.
const BASE = process.env.WSAPI_BASE_URL ?? "https://api.worldstreetwebservices.com";

const ALLOWED = /^(health|categories|assets|assets\/.+|quote|build)$/;

export function isAllowedRwaPath(path: string): boolean {
  return ALLOWED.test(path);
}

// Trading endpoints must not be cached; the asset registry can be.
export function rwaRevalidate(path: string): number | undefined {
  if (path === "categories" || path === "assets" || path.startsWith("assets/")) return 60;
  return undefined;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function wsapiRwaRequest(
  path: string,
  init: { method: "GET" | "POST"; query?: URLSearchParams; body?: unknown; revalidate?: number }
): Promise<Response> {
  const url = new URL(`${BASE}/v1/rwa/${path}`);
  if (init.query) url.search = init.query.toString();

  const send = () =>
    fetch(url, {
      method: init.method,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
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
