"use client";

// Every service on the platform gateway answers with { success, data | error }.
// This unwraps that envelope into a value or a typed error. It lives here
// rather than under one service so casino, chess and earn all fail the same
// way, and a new service does not arrive with a fifth copy of the logic.

export interface GatewayApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): GatewayApiError {
  const error = new Error(message) as GatewayApiError;
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

// A non-JSON body means the gateway is down, or answered with an error page, or
// rejected the URL before it reached the service. None of those are parseable,
// so they become SERVICE_UNAVAILABLE rather than a parse crash.
export async function unwrap<T>(res: Response, fallbackMessage: string): Promise<T> {
  const body = await res.json().catch(() => null);
  if (res.ok && body && body.success === true) return body.data as T;
  const err = body?.error;
  throw apiError(
    err?.code ?? (res.status === 404 ? "NOT_FOUND" : "SERVICE_UNAVAILABLE"),
    err?.message ?? fallbackMessage,
    res.status,
    err?.details
  );
}

// True when a failure means "nothing configured yet" rather than a real outage,
// so screens can show a plain empty state instead of an error.
export function isUnconfigured(error: unknown): boolean {
  const code = (error as GatewayApiError | null)?.code;
  return code === "NOT_CONFIGURED" || code === "SERVICE_UNAVAILABLE";
}

// The error code a failed call carried, or null when the throw did not come
// from the gateway at all (a network drop, a bug in our own code).
export function errorCode(error: unknown): string | null {
  return (error as GatewayApiError | null)?.code ?? null;
}
