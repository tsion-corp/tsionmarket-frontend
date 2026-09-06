import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@privy-io/node";
import {
  ACCESS_TOKEN_COOKIE,
  loadVerifiedUser,
  verifyAccessToken,
  type AccessClaims,
} from "@/lib/server/auth";
import { embeddedWalletAddress } from "@/lib/server/embedded-wallets";
import type { ServerSession } from "@/lib/session";

// The session a Server Component renders for, read from the cookie Privy sets
// in the browser. This is the server-side counterpart of verifyRequest for
// route handlers, and the two accept exactly the same tokens.
//
// Wrapped in React's cache so a request verifies its token once, however many
// components ask, and so the identity is derived where it is used rather than
// passed down as a prop that a component could be handed wrongly. Reading the
// cookie opts the route into dynamic rendering, which every signed-in route is
// anyway.
//
// Only the access token is consulted here. The identity token is a
// client-supplied shortcut that the request path accepts under a check; a
// Server Component has no need of it, since the verified user id is enough.
export const getSessionClaims = cache(async (): Promise<AccessClaims | null> => {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
});

// The full Privy user behind the session, or null when there is none. Shares
// the per-session cache with the request path, so a page render and the API
// calls it triggers resolve the user once between them.
export const getSessionUser = cache(async (): Promise<User | null> => {
  const claims = await getSessionClaims();
  if (!claims) return null;
  return loadVerifiedUser(claims);
});

// The session as a value the browser may hold: the user id and the embedded
// wallet addresses, nothing more. The (app) layout passes it down so the shell
// can render before Privy's browser SDK is ready, and so hooks that build a
// query key from a wallet build the right one in the meantime.
export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return {
    userId: user.id,
    wallets: {
      ethereum: embeddedWalletAddress(user, "ethereum"),
      solana: embeddedWalletAddress(user, "solana"),
    },
  };
});
