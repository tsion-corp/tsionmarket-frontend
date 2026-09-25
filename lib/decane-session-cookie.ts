"use client";

// Mirrors the Decane access token into a cookie, for document navigations only.
//
// Every fetch carries the token as a Bearer header, put there by apiFetch. An
// <iframe src="/api/chess/play"> is not a fetch: it is a navigation, and a
// browser attaches no Authorization header to one. Privy used to set a
// `privy-token` cookie, which is why the chess board authenticated before the
// migration and answered "Sign in to play." after it.
//
// Deliberately narrow, because a bearer token in a cookie is readable by any
// script on the origin:
//   * Path=/api  — never sent to a page route, only to the proxies that need it
//   * SameSite=Lax — same-site navigations only; no cross-site request carries it
//   * Secure on https
//   * Max-Age tracks the token's own exp, so it cannot outlive the session
// It is not HttpOnly, and cannot be: the value only exists in the browser.

const COOKIE = "decane-token";
const FALLBACK_MAX_AGE_S = 3600;

// The `exp` claim, or null if the token is not readable as a JWT. Parsing is
// for the cookie's lifetime only — the server verifies the signature, this
// never trusts the contents.
function expiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: unknown;
    };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function write(value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${value}; Path=/api; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

/** Writes the token, or clears the cookie when there is no session. */
export function syncDecaneSessionCookie(token: string | null): void {
  if (typeof document === "undefined") return;
  if (!token) {
    write("", 0);
    return;
  }
  const exp = expiresAt(token);
  const remaining = exp ? exp - Math.floor(Date.now() / 1000) : FALLBACK_MAX_AGE_S;
  // An already-expired token is worth nothing to the proxy and should not sit
  // in the jar pretending otherwise.
  if (remaining <= 0) {
    write("", 0);
    return;
  }
  write(token, remaining);
}

export function clearDecaneSessionCookie(): void {
  syncDecaneSessionCookie(null);
}
