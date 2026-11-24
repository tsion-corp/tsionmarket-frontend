import type { NextRequest } from "next/server";
import { forwardPimlicoBundlerRequest } from "@/lib/server/pimlico-bundler";

export async function POST(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  return forwardPimlicoBundlerRequest(req, network);
}
