"use client";

import { resolveAuthTokens as resolvePrivyAuthTokens, type AuthTokens } from "@/lib/privy-token";

// The one place the transport gets its bearer token. Two identities exist
// during the Privy to Decane migration window and the caller names which one
// it wants:
//
// - "current": the app's identity. Decane first; Privy only when no Decane
//   token source is registered at all (the prediction reclaim page mounts
//   Privy without a Decane session).
// - "legacy": the OLD Privy identity, and nothing else. Used only by the
//   migration flow, for calls that must act on the old wallets: the chess
//   cashier withdrawal, the Kash points claim, the gas-sponsor service.
//   Yields no token when Privy is not mounted or not signed in.
//
// The default is "current" on purpose. Privy's getters are module-level, so a
// live Privy session inside the migration flow would otherwise leak into every
// ordinary dashboard request and retarget them at the old wallet.
//
// Decane's getAccessToken() is synchronous and lives on the kit's React
// context, so the provider tree registers it here at mount through
// registerDecaneTokenSource (see components/providers/decane-token-bridge.tsx).
// Decane has no identity-token equivalent; idToken is null for Decane sessions
// and routes resolve the user from the verified claims instead.

export type { AuthTokens };

export type AuthIdentity = "current" | "legacy";

type DecaneTokenSource = () => string | null;

let decaneTokenSource: DecaneTokenSource | null = null;

export function registerDecaneTokenSource(source: DecaneTokenSource | null): void {
  decaneTokenSource = source;
}

interface AuthTokenResolverDeps {
  resolvePrivyTokens: () => Promise<AuthTokens>;
  // null when no Decane provider has registered a source; a string or null
  // from the source itself once one has.
  getDecaneToken: () => string | null;
  hasDecaneSource: () => boolean;
}

const NO_TOKENS: AuthTokens = { accessToken: null, idToken: null };

// Builds the resolver over injected sources. The real one is exported below;
// tests build their own with fakes.
export function createAuthTokenResolver({
  resolvePrivyTokens,
  getDecaneToken,
  hasDecaneSource,
}: AuthTokenResolverDeps): (identity?: AuthIdentity) => Promise<AuthTokens> {
  const privy = async (): Promise<AuthTokens> => {
    try {
      return await resolvePrivyTokens();
    } catch {
      // Privy's module-level getters can throw when no PrivyProvider is
      // mounted, which is the post-cutover normal on every ordinary route.
      return NO_TOKENS;
    }
  };

  return async function resolveTokens(identity: AuthIdentity = "current"): Promise<AuthTokens> {
    if (identity === "legacy") return privy();
    if (hasDecaneSource()) {
      const decaneToken = getDecaneToken();
      return decaneToken ? { accessToken: decaneToken, idToken: null } : NO_TOKENS;
    }
    return privy();
  };
}

// The app-wide resolver used by apiFetch.
export const resolveAuthTokens = createAuthTokenResolver({
  resolvePrivyTokens: resolvePrivyAuthTokens,
  getDecaneToken: () => (decaneTokenSource ? decaneTokenSource() : null),
  hasDecaneSource: () => decaneTokenSource !== null,
});
