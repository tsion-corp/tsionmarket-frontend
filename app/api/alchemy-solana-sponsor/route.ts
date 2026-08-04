import type { NextRequest } from "next/server";
import { forwardSolanaSponsorRequest } from "@/lib/server/solana-sponsor";

export async function POST(req: NextRequest) {
  return forwardSolanaSponsorRequest(req);
}
