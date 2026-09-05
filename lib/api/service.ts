"use client";

import { apiFetch } from "@/lib/api";
import { unwrap } from "@/lib/api/envelope";

export type QueryParams = Record<string, string | number | boolean | undefined>;

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

// Strict servers reject a JSON content-type with an empty body.
function bodyInit(method: string, body: unknown): RequestInit {
  if (body === undefined) return { method };
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface ServiceClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  authedGet<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string, body?: unknown): Promise<T>;
  /**
   * POST a FormData body.
   *
   * Separate from `post` because the browser must set `content-type` ITSELF —
   * it is the only party that knows the multipart boundary it generated, and
   * setting the header by hand produces a body no parser can read.
   */
  postForm<T>(path: string, form: FormData): Promise<T>;
}

export function createServiceClient(basePath: string, fallbackMessage: string): ServiceClient {
  const url = (path: string, params?: QueryParams) => `${basePath}${path}${buildQuery(params)}`;

  // requireAuth turns a cold Privy token into a retryable error instead of a 401.
  const authed = <T>(path: string, init: RequestInit): Promise<T> =>
    apiFetch(path, init, { requireAuth: true }).then((res) => unwrap<T>(res, fallbackMessage));

  return {
    // Public reads send no credentials, so they stay cacheable, but they go
    // through the one transport so the circuit breaker sees them. On plain
    // fetch they did not: the lobby polls are among the loudest readers in the
    // app, and while their gateway was returning 502 every tick still left the
    // tab and cost an invocation, which is exactly what the breaker exists to
    // stop.
    get: <T>(path: string, params?: QueryParams) =>
      apiFetch(url(path, params), {}, { anonymous: true }).then((res) =>
        unwrap<T>(res, fallbackMessage)
      ),
    authedGet: <T>(path: string, params?: QueryParams) => authed<T>(url(path, params), {}),
    post: <T>(path: string, body?: unknown) => authed<T>(url(path), bodyInit("POST", body)),
    put: <T>(path: string, body?: unknown) => authed<T>(url(path), bodyInit("PUT", body)),
    del: <T>(path: string, body?: unknown) => authed<T>(url(path), bodyInit("DELETE", body)),
    // No `headers` on purpose — see the interface.
    postForm: <T>(path: string, form: FormData) =>
      authed<T>(url(path), { method: "POST", body: form }),
  };
}
