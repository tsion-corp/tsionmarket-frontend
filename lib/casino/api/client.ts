"use client";

// Transport for the casino gateway. Reads and writes go through our own
// same-origin proxy (app/api/casino) rather than the gateway directly, the
// same arrangement the vault uses: the gateway sends no CORS headers, and the
// proxy attaches the caller's session server-side so a browser never holds a
// service key.
//
// The gateway speaks the platform's { success, data | error } envelope.

const BASE_PATH = "/api/casino";

export interface CasinoApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
}

function apiError(code: string, message: string, status: number, details?: unknown) {
  const error = new Error(message) as CasinoApiError;
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

// Unwraps the envelope and throws a typed error the UI can branch on. A
// non-JSON body (a gateway that is down, or an HTML error page) becomes a
// SERVICE_UNAVAILABLE rather than a parse crash.
async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (res.ok && body && body.success === true) return body.data as T;
  const err = body?.error;
  throw apiError(
    err?.code ?? (res.status === 404 ? "NOT_FOUND" : "SERVICE_UNAVAILABLE"),
    err?.message ?? "The casino is unavailable right now.",
    res.status,
    err?.details
  );
}

export async function casinoGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return unwrap<T>(await fetch(`${BASE_PATH}${path}${query}`));
}

export async function casinoPost<T>(path: string, body?: unknown): Promise<T> {
  // Actions like accept and resign carry no body. Sending a JSON content-type
  // with nothing in it is rejected by strict servers, so the header only goes
  // on when there is actually a body.
  return unwrap<T>(
    await fetch(`${BASE_PATH}${path}`, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    })
  );
}

// True when a failure means "no casino configured yet" rather than a real
// outage, so screens can show a plain empty state instead of an error.
export function isCasinoUnconfigured(error: unknown): boolean {
  const code = (error as CasinoApiError | null)?.code;
  return code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
}
