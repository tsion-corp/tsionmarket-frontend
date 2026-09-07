// The identity token the Privy SDK currently holds, mirrored here so code
// outside React (the fetch wrapper) can read it without a network call.
//
// The SDK issues a new identity token on login, page load, account link and
// every access-token refresh, and keeps it in its own store, which the
// useIdentityToken hook reads. Its imperative getIdentityToken(), by contrast,
// GETs Privy's /users/me on every call. IdentityTokenBridge writes the hook's
// value here; lib/privy-token reads it first and only calls Privy when nothing
// usable is held.

let held: string | null = null;

export function setHeldIdentityToken(token: string | null): void {
  held = token;
}

export function peekHeldIdentityToken(): string | null {
  return held;
}
