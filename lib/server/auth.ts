import "server-only";

import type { NextRequest } from "next/server";
import type { User } from "@privy-io/node";
import { getPrivyClient } from "@/lib/server/privy";

export interface AccessClaims {
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
}

function extractAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return req.cookies.get("privy-token")?.value ?? null;
}

// Verifies the caller's Privy access token. Returns null when the request
// carries no token or the token fails verification.
export async function verifyRequest(req: NextRequest): Promise<AccessClaims | null> {
  const token = extractAccessToken(req);
  if (!token) return null;
  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(token);
    return {
      userId: claims.user_id,
      sessionId: claims.session_id,
      issuedAt: claims.issued_at,
      expiration: claims.expiration,
    };
  } catch {
    return null;
  }
}

// Resolves the full Privy user from an identity token, when the client sent
// one. When the identity token is missing or cold, fall back to the verified
// user id so money-moving routes can still prove which wallet the session owns.
export async function getRequestUser(
  req: NextRequest,
  claims: AccessClaims | null = null
): Promise<User | null> {
  const idToken = req.headers.get("privy-id-token") ?? req.cookies.get("privy-id-token")?.value;
  if (idToken) {
    try {
      return await getPrivyClient().users().get({ id_token: idToken });
    } catch {
      // Fall through to the verified user id below.
    }
  }
  if (!claims) return null;
  try {
    return await getPrivyClient().users()._get(claims.userId);
  } catch {
    return null;
  }
}
