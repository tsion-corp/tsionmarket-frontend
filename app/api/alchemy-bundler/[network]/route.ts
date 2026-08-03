import type { NextRequest } from "next/server";
import { forwardAlchemyBundlerRequest } from "@/lib/server/alchemy-bundler";

export async function POST(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  return forwardAlchemyBundlerRequest(req, network);
}
