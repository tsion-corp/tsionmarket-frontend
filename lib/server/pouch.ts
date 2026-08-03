import "server-only";

// Server-side gateway to Pouch Finance. The partner API key is a secret and must
// never reach the browser, so every Pouch call is proxied through our route
// handlers and authenticated here. The partner key always rides in `x-api-key`.
// Partner-only endpoints (initiate, verify) also send `Authorization: ApiKey
// <key>`; per-user endpoints instead send the user's Shared KYC JWT as
// `Authorization: Bearer <token>`, which the client forwards and we pass through.

const BASE = process.env.POUCH_API_BASE_URL ?? "https://api.pouchfinance.xyz";
const API_KEY = process.env.POUCHPAY_API_LIVE_KEY;

// Thrown when the server is missing its key. Surfaced to the route as a 500 with
// a generic message, never leaking whether a key exists.
export class PouchConfigError extends Error {
  constructor() {
    super("Pouch API key is not configured");
    this.name = "PouchConfigError";
  }
}

interface PouchInit {
  method: "GET" | "POST";
  // The user's Shared KYC JWT, for endpoints that authenticate per user.
  token?: string;
  query?: URLSearchParams;
  body?: unknown;
}

// Perform a Pouch request and return the parsed JSON plus the HTTP status. The
// caller decides how to map non-2xx responses; we do not throw on them so a
// provider validation error (a rejected amount, a bad OTP) can be relayed to the
// client verbatim.
export async function pouchRequest(
  path: string,
  init: PouchInit
): Promise<{ status: number; data: unknown }> {
  if (!API_KEY) throw new PouchConfigError();

  const url = new URL(`${BASE}${path}`);
  if (init.query) url.search = init.query.toString();

  // Partner key in x-api-key on every call. The Authorization header carries the
  // user JWT when we have one, otherwise the partner key in Pouch's ApiKey form.
  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
    Authorization: init.token ? `Bearer ${init.token}` : `ApiKey ${API_KEY}`,
  };
  if (init.body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    // A hung provider must not hold our route open indefinitely.
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  // Pouch returns JSON on both success and error. Guard against an empty or
  // non-JSON body (for example a gateway 502) so parsing never throws.
  let data: unknown = null;
  const raw = await res.text();
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { message: raw.slice(0, 200) };
    }
  }
  return { status: res.status, data };
}

// Read the forwarded user JWT from an incoming request's Authorization header.
// Returns null when absent so the route can answer 401 rather than call Pouch.
export function bearerFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

// Extract a short, user-safe message from a Pouch error payload. Pouch returns
// JSON with a `message` or `error` field on failures. We surface a trimmed
// version and fall back to a generic line, so a stray HTML or oversized body
// never reaches the client.
export function pouchErrorMessage(data: unknown, fallback = "Something went wrong"): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : "";
    const trimmed = message.trim();
    if (trimmed && trimmed.length <= 200 && !/<[a-z!]/i.test(trimmed)) return trimmed;
  }
  return fallback;
}
