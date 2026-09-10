// The World Street / Tsion Ark API gateway. One base URL is the single source
// of truth; every platform service hangs off it at /v1/<service> (see the gateway's
// /docs). Deployments therefore need at most WSAPI_BASE_URL or NEXT_PUBLIC_WSAPI_BASE_URL
// set — and usually nothing at all, since the default is production.
//
// The per-service env vars (CHESS_API_URL, EARN_API_URL, …) survive purely as
// overrides for pointing ONE service at a local or staging instance while the
// rest of the app stays on the gateway; unset, everything derives from here.
//
// Isomorphic on purpose: server code reads WSAPI_BASE_URL, client bundles can
// only see the NEXT_PUBLIC_ variant, and both fall back to production.
export function normalizeWsapiBaseUrl(url?: string | null): string {
  if (!url) return "https://api.tsionark.com";
  let cleaned = url.trim();
  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");
  // Strip trailing /v1 if present so wsapiService does not double up /v1/v1
  cleaned = cleaned.replace(/\/v1$/, "");
  return cleaned || "https://api.tsionark.com";
}

export function getWsapiBase(): string {
  const raw = process.env.NEXT_PUBLIC_WSAPI_BASE_URL || process.env.WSAPI_BASE_URL;
  return normalizeWsapiBaseUrl(raw);
}

export const WSAPI_BASE = getWsapiBase();

export function wsapiService(service: string): string {
  const base = getWsapiBase();
  const cleanService = service.replace(/^\/+/, "");
  return `${base}/v1/${cleanService}`;
}
