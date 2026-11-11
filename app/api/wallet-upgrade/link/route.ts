import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import {
  forwardMigration,
  migrationServiceEnabled,
  notConfigured,
  unauthorized,
} from "@/lib/server/migration";
import { decaneBearer, upstreamBlocked } from "@/lib/server/wallet-upgrade";

// Joins the signed-in Clerk account to the Decane account it replaces. BOTH
// proofs are required in the same request: the Clerk session (read here from
// its own cookie, never from the client) and the Decane access token. Both are
// verified here and again by the service, which resolves the Decane wallets
// itself; nothing about identity or addresses comes from the browser.
export async function POST(req: NextRequest) {
  const blocked = upstreamBlocked();
  if (blocked) return blocked;
  if (!migrationServiceEnabled()) return notConfigured();

  const decane = await verifyRequest(req);
  if (!decane || decane.provider !== "decane") return unauthorized();
  const decaneToken = decaneBearer(req);

  const { userId, getToken } = await auth();
  if (!userId) return unauthorized();
  const clerkToken = await getToken();
  if (!decaneToken || !clerkToken) return unauthorized();

  return forwardMigration("/clerk/link", {
    method: "POST",
    headers: {
      authorization: `Bearer ${clerkToken}`,
      "x-legacy-authorization": `Bearer ${decaneToken}`,
    },
    body: "{}",
  });
}
