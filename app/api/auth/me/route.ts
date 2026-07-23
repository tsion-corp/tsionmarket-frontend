import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, verifyRequest } from "@/lib/server/auth";

export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getRequestUser(req);

  return NextResponse.json({
    userId: claims.userId,
    sessionId: claims.sessionId,
    user: user
      ? {
          id: user.id,
          createdAt: user.created_at,
          linkedAccounts: user.linked_accounts.map((a) => a.type),
          wallets: user.linked_accounts
            .filter((a) => a.type === "wallet")
            .map((a) => ({
              address: "address" in a ? a.address : null,
              chainType: "chain_type" in a ? a.chain_type : null,
            })),
        }
      : null,
  });
}
