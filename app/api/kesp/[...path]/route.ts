import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";

// Buying Kash with naira. The order service answers no browser origin, so the app asks it on the
// browser's behalf. Three calls only (a quote, an order, an order's state), each with its input
// checked here, and only for a signed-in user. Nothing else of the service is reachable.
const BASE = (process.env.KESP_API_URL ?? "https://crypto-backend.worldstreetgold.com/v1").replace(
  /\/+$/,
  ""
);

const NGN = /^\d{1,9}(\.\d{1,2})?$/;
const ADDRESS = /^(wsk|mna)1[0-9a-z]{30,60}$/;
const ORDER_ID = /^[0-9a-zA-Z_-]{8,80}$/;

const refuse = (status: number, message: string) =>
  NextResponse.json({ success: false, error: { message } }, { status });

async function relay(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return refuse(502, "Buying with naira is not available right now. Try again shortly.");
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await verifyRequest(req))) return refuse(401, "Sign in to continue.");
  const { path } = await ctx.params;
  if (path.length === 1 && path[0] === "quote") {
    const amount = req.nextUrl.searchParams.get("amountNgn") ?? "";
    if (!NGN.test(amount)) return refuse(400, "Enter an amount in naira.");
    return relay(`${BASE}/kesp/quote?amountNgn=${encodeURIComponent(amount)}`);
  }
  if (path.length === 2 && path[0] === "orders" && ORDER_ID.test(path[1]!)) {
    return relay(`${BASE}/kesp/orders/${encodeURIComponent(path[1]!)}`);
  }
  return refuse(404, "Not found.");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!(await verifyRequest(req))) return refuse(401, "Sign in to continue.");
  const { path } = await ctx.params;
  if (!(path.length === 1 && path[0] === "orders")) return refuse(404, "Not found.");
  const body = (await req.json().catch(() => null)) as {
    amountNgn?: unknown;
    address?: unknown;
  } | null;
  const amount = String(body?.amountNgn ?? "");
  const address = String(body?.address ?? "").toLowerCase();
  if (!NGN.test(amount)) return refuse(400, "Enter an amount in naira.");
  if (!ADDRESS.test(address)) return refuse(400, "That is not an Intertrain address.");
  return relay(`${BASE}/kesp/orders`, {
    method: "POST",
    body: JSON.stringify({ amountNgn: amount, address }),
  });
}
