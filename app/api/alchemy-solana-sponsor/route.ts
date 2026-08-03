import type { NextRequest } from "next/server";
import { forwardAlchemySolanaSponsorRequest } from "@/lib/server/alchemy-solana-sponsor";

export async function POST(req: NextRequest) {
  return forwardAlchemySolanaSponsorRequest(req);
}
