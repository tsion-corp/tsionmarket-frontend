// The signed-in account's id on a Decane session.
//
// Decane keeps no user object on the client; the one place the account id
// lives is the access token's `uid` claim (the `sub` claim is an HMAC, not an
// id). The user-management routes are scoped by that id — the path segment
// must equal what the gateway verifies from the same token — so it is read
// here, once, and every hook keyed on "which account" uses it.
//
// Decoded, never verified: this is the browser reading its own token to know
// what to ask for. Anything of consequence is verified server-side.
export function decodeDecaneUserId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      uid?: unknown;
    };
    return typeof json.uid === "string" && json.uid !== "" ? json.uid : null;
  } catch {
    return null;
  }
}
