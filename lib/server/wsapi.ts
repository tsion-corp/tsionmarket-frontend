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

export async function wsapiRwaRequest(
  path: string,
  init: { method: "GET" | "POST"; query?: URLSearchParams; body?: unknown; revalidate?: number }
): Promise<Response> {
  const url = new URL(`${BASE}/v1/rwa/${path}`);
  if (init.query) url.search = init.query.toString();
  return fetch(url, {
    method: init.method,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    ...(init.revalidate != null
      ? { next: { revalidate: init.revalidate } }
      : { cache: "no-store" }),
  });
}
