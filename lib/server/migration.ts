import "server-only";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  accessTokenFromCookie,
  verifyPrivyAccessToken,
  type AccessClaims,
} from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// The gateway's migration service: links a Decane account to the Privy
// account it replaced and re-keys the wallet-keyed ledgers (Kash, cashier,
// lottery, Swiss, earn) from the old address to the new one. The contract is
// documented in docs/MIGRATION_SERVICE.md. Until the service ships the flag
// stays off and the proxies answer as if no account were linked, so the
// migration flow still works from the on-chain venues alone.

export function migrationServiceEnabled(): boolean {
  return process.env.MIGRATION_SERVICE_ENABLED === "1";
}

// Override for a local service; unset, the shared gateway serves it.
function base(): string {
  return process.env.MIGRATION_API_URL ?? wsapiService("user-management");
}

// The OLD identity's credentials, sent alongside the Decane bearer on the link
// call: `x-legacy-authorization: Bearer <privy access token>` plus the Privy
// identity token so the service can read the old account's wallets.
export interface LegacyAuthorization {
  accessToken: string;
  idToken: string | null;
  claims: AccessClaims;
}

export async function verifyLegacyAuthorization(
  req: NextRequest
): Promise<LegacyAuthorization | null> {
  const header = req.headers.get("x-legacy-authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const accessToken = header.slice("Bearer ".length);
  const claims = await verifyPrivyAccessToken(accessToken);
  if (!claims) return null;
  return { accessToken, idToken: req.headers.get("privy-id-token"), claims };
}

export function notConfigured(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Account linking is not available yet." },
    },
    { status: 503 }
  );
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
    { status: 401 }
  );
}

// Forwards to the service with the standard envelope passthrough: the
// upstream body and status come back untouched, an unreachable service is a
// 502 in the same envelope shape.
export async function forwardMigration(
  path: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string }
): Promise<NextResponse> {
  const headers: Record<string, string> = { accept: "application/json", ...init.headers };
  if (init.method !== "GET") headers["content-type"] = "application/json";
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method,
      headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Migration service proxy failed:", path, error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "UPSTREAM_ERROR", message: "The migration service is unreachable." },
      },
      { status: 502 }
    );
  }
}

// ── The old wallet a session is linked to ────────────────────────────────────
//
// Address-keyed proxies (the perp proxy above all) pin a path's address to the
// wallet the session owns. That is right for every read but one: the upgrade
// reads the OLD wallet's positions, margin and Arbitrum balance, which belong
// to the same person by the link the migration service holds. This asks that
// service — the one authority on the link — and caches the answer briefly, so
// a page that polls the old account does not ask it on every tick.
//
// Keyed on a hash of the token, never the token: the map is process-wide and
// a token must not sit in memory beyond the request that carried it.

const LEGACY_LINK_TTL_MS = 60_000;
const LEGACY_LINK_MAX_ENTRIES = 1_000;
const legacyLinks = new Map<string, { evm: string | null; expiresAt: number }>();

function bearerOf(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return accessTokenFromCookie((name) => req.cookies.get(name)?.value);
}

/** The EVM address of the old account linked to this session, or null. */
export async function linkedLegacyEvmAddress(req: NextRequest): Promise<string | null> {
  if (!migrationServiceEnabled()) return null;
  const token = bearerOf(req);
  if (!token) return null;
  const key = createHash("sha256").update(token).digest("hex");
  const cached = legacyLinks.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.evm;

  let evm: string | null = null;
  try {
    const res = await forwardMigration("/status", {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        data?: { legacy?: { evm?: unknown } | null };
      } | null;
      const value = body?.data?.legacy?.evm;
      evm = typeof value === "string" && value !== "" ? value : null;
    }
  } catch {
    // Unreachable service: no link known, which is the safe answer.
  }
  if (legacyLinks.size >= LEGACY_LINK_MAX_ENTRIES) {
    const oldest = legacyLinks.keys().next().value;
    if (oldest !== undefined) legacyLinks.delete(oldest);
  }
  legacyLinks.set(key, { evm, expiresAt: Date.now() + LEGACY_LINK_TTL_MS });
  return evm;
}
