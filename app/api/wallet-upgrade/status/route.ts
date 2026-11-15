import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { forwardMigration, migrationServiceEnabled, unauthorized } from "@/lib/server/migration";
import { upstreamBlocked } from "@/lib/server/wallet-upgrade";

// Where the Clerk session stands: linked or not, and the uid it carries. Needs
// only the Clerk session. With the service off the answer is "not linked",
// not an error, so the page still renders.
export async function GET() {
  const blocked = upstreamBlocked();
  if (blocked) return blocked;
  const { userId, getToken } = await auth();
  if (!userId) return unauthorized();
  if (!migrationServiceEnabled()) {
    return NextResponse.json({ success: true, data: { linked: false, uid: null, legacy: null } });
  }
  const clerkToken = await getToken();
  if (!clerkToken) return unauthorized();
  return forwardMigration("/clerk/status", {
    method: "GET",
    headers: { authorization: `Bearer ${clerkToken}` },
  });
}
