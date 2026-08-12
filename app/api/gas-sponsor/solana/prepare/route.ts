import type { NextRequest } from "next/server";
import { prepareSolanaSponsorRequest } from "@/lib/server/solana-sponsor";

export async function POST(req: NextRequest) {
  return prepareSolanaSponsorRequest(req);
}
