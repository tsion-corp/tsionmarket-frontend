import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import {
  readUpgradeEnv,
  walletUpgradeConfig,
  type DeployTarget,
} from "@/lib/wallet-upgrade/environment";
import { accessTokenFromCookie } from "@/lib/server/auth";
import { migrationBase } from "@/lib/server/migration";

/**
 * Why the wallet-upgrade routes must refuse to run, or null when they may.
 *
 * The upgrade links real Decane accounts to Clerk accounts in the service's
 * database. A DEVELOPMENT deployment that is pointed at the production gateway
 * would write its throwaway Clerk users into that production data and could
 * claim a real person's Decane account for a test user. So development
 * refuses a production upstream unless someone says, explicitly, that they
 * mean it. Pure so it can be tested without the environment.
 */
export function upstreamProblem(input: {
  target: DeployTarget;
  base: string;
  allowProduction: boolean;
}): string | null {
  if (input.target !== "development" || input.allowProduction) return null;
  let host: string;
  try {
    host = new URL(input.base).hostname.toLowerCase();
  } catch {
    return "The migration service address is not a valid URL.";
  }
  if (host === "tsionark.com" || host.endsWith(".tsionark.com")) {
    return "Development is pointed at the production gateway. Point MIGRATION_API_URL at a development service, or set WALLET_UPGRADE_ALLOW_PROD_UPSTREAM=true if you really mean it.";
  }
  return null;
}

/** A response when the upgrade is switched off or pointed somewhere unsafe, else null. */
export function upstreamBlocked(): NextResponse | null {
  const config = walletUpgradeConfig(readUpgradeEnv());
  const reason = !config.enabled
    ? (config.blockedReason ?? "The wallet upgrade is not switched on.")
    : upstreamProblem({
        target: config.target,
        base: migrationBase(),
        allowProduction: process.env.WALLET_UPGRADE_ALLOW_PROD_UPSTREAM === "true",
      });
  if (!reason) return null;
  return NextResponse.json(
    { success: false, error: { code: "NOT_AVAILABLE", message: reason } },
    { status: 503 }
  );
}

/** The Decane access token on a request: the bearer header, else the bridge cookie. */
export function decaneBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length) || null;
  return accessTokenFromCookie((name) => req.cookies.get(name)?.value) ?? null;
}
