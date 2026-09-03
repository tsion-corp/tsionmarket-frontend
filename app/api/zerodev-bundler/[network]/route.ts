import type { NextRequest } from "next/server";
import { forwardZeroDevBundlerRequest } from "@/lib/server/zerodev-bundler";

export async function POST(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  return forwardZeroDevBundlerRequest(req, network);
}
