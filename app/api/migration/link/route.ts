import type { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  forwardMigration,
  migrationServiceEnabled,
  notConfigured,
  unauthorized,
  verifyLegacyAuthorization,
} from "@/lib/server/migration";

// Links the signed-in Decane account to the Privy account whose token rides
// in x-legacy-authorization, and asks the service to re-key the ledgers. Both
// tokens are verified here before anything reaches the service; the service
// verifies them again and resolves the wallets on each side itself.
export async function POST(req: NextRequest) {
  if (!migrationServiceEnabled()) return notConfigured();
  const current = await verifyRequest(req);
  if (!current) return unauthorized();
  const legacy = await verifyLegacyAuthorization(req);
  if (!legacy) return unauthorized();

  const headers: Record<string, string> = {
    authorization: req.headers.get("authorization") ?? "",
    "x-legacy-authorization": `Bearer ${legacy.accessToken}`,
  };
  if (legacy.idToken) headers["privy-id-token"] = legacy.idToken;
  return forwardMigration("/link", { method: "POST", headers, body: "{}" });
}
