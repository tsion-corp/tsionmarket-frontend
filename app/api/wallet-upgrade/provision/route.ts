import { auth } from "@clerk/nextjs/server";
import {
  migrationServiceEnabled,
  forwardMigration,
  notConfigured,
  unauthorized,
} from "@/lib/server/migration";
import { upstreamBlocked } from "@/lib/server/wallet-upgrade";

// For a person who never had an account here: gives their new Clerk account a
// platform id. Deliberately separate from the link and never automatic, so
// someone migrating from the old account always arrives without one.
export async function POST() {
  const blocked = upstreamBlocked();
  if (blocked) return blocked;
  if (!migrationServiceEnabled()) return notConfigured();
  const { userId, getToken } = await auth();
  if (!userId) return unauthorized();
  const clerkToken = await getToken();
  if (!clerkToken) return unauthorized();
  return forwardMigration("/clerk/provision", {
    method: "POST",
    headers: { authorization: `Bearer ${clerkToken}` },
    body: "{}",
  });
}
