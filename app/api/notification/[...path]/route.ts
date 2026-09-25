import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { wsapiService } from "@/lib/wsapi-base";

// Server-side proxy for the notification service: the store the vault and the
// other services publish into over the broker.
//
// It is NOT the store user-management holds, which the bell also reads and
// which carries operator announcements. Both are real and both are wanted, so
// the bell merges them; see ADR-2026-09-25-vault-notifications.
//
// Every route here reads or writes one person's own mail, so every one is
// session-verified and nothing is cached.
const BASE = process.env.NOTIFICATION_API_URL ?? wsapiService("notification");

// Only what the bell needs. The service's own health and docs are not ours to
// expose, and a notification id is matched rather than interpolated so a
// crafted one cannot reach a path that is not on this list.
const ALLOWED: Array<{ method: "GET" | "POST" | "DELETE"; pattern: RegExp }> = [
  { method: "GET", pattern: /^notifications$/ },
  { method: "GET", pattern: /^notifications\/unread-count$/ },
  { method: "POST", pattern: /^notifications\/read-all$/ },
  { method: "POST", pattern: /^notifications\/[A-Za-z0-9_-]+\/read$/ },
  { method: "POST", pattern: /^push\/subscriptions$/ },
  { method: "DELETE", pattern: /^push\/subscriptions$/ },
];

function isAllowed(method: "GET" | "POST" | "DELETE", path: string): boolean {
  if (path.includes("..") || path.includes("%") || path.includes("\\")) return false;
  return ALLOWED.some((rule) => rule.method === method && rule.pattern.test(path));
}

async function proxy(
  req: NextRequest,
  path: string[],
  method: "GET" | "POST" | "DELETE"
): Promise<NextResponse> {
  const joined = path.join("/");
  if (!isAllowed(method, joined)) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }

  const claims = await verifyRequest(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Sign in first." } },
      { status: 401 }
    );
  }

  const headers: Record<string, string> = {};
  // The service resolves the reader from this token, and for a Decane session
  // it also resolves the wallet from it. Without it nobody is identified and
  // no wallet is ever linked, which is what silently drops a payout notice.
  const authorization = req.headers.get("authorization");
  if (authorization) headers.authorization = authorization;
  const idToken = req.headers.get("privy-id-token");
  if (idToken) headers["privy-id-token"] = idToken;

  let body: string | undefined;
  if (method !== "GET") {
    headers["content-type"] = "application/json";
    body = await req.text();
  }

  try {
    const res = await fetch(`${BASE}/${joined}${req.nextUrl.search}`, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("Notification proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Notifications are unavailable" },
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "GET");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "POST");
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path, "DELETE");
}
