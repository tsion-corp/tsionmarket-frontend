import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { forwardMigration, migrationServiceEnabled, unauthorized } from "@/lib/server/migration";

// What the service knows about the signed-in account's old wallet. With the
// flag off, or for an account the service has never heard of, the answer is
// the empty status: nothing known. `linked` is null rather than false on
// purpose — "could not say" and "said no" are different facts, and the offer
// only lets a real "no" overrule what this device remembers.
const EMPTY_STATUS = {
  linked: null,
  legacy: null,
  hasLegacyFunds: false,
  legacyFundsUsd: 0,
  pendingOnramps: [],
  rekey: {},
};

function empty() {
  return NextResponse.json({ success: true, data: EMPTY_STATUS });
}

export async function GET(req: NextRequest) {
  const claims = await verifyRequest(req);
  if (!claims) return unauthorized();
  if (!migrationServiceEnabled()) return empty();
  const res = await forwardMigration("/status", {
    method: "GET",
    headers: { authorization: req.headers.get("authorization") ?? "" },
  });
  return res.status === 404 ? empty() : res;
}
