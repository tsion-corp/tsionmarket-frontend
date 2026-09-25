import { NextResponse, type NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server/auth";
import { fetchActivity } from "@/lib/server/activity";
import { forwardMigration, migrationServiceEnabled, unauthorized } from "@/lib/server/migration";

/**
 * THE OLD WALLET'S ACTIVITY, KEPT UNDER THE NEW ACCOUNT.
 *
 * Once the sweep is done the old wallet never changes again, so its history
 * is read ONCE and stored, rather than swept from the chain for two wallet
 * sets on every poll — one sweep is already the most expensive read in the
 * app.
 *
 * POST takes the snapshot: the legacy addresses come from the service's own
 * record of the link (never from the client, which could name any wallet),
 * the sweep runs here with the feed's own shaping and action tagging, and
 * the result is stored under the account. Called when the link lands, and
 * again when the sweep finishes so the outgoing legs are in it.
 *
 * GET hands the stored snapshot back, or null.
 */
export const maxDuration = 60;

/** Deeper than a feed page: this is the whole readable history, once. */
const SNAPSHOT_LIMIT = 200;

function bearer(req: NextRequest): Record<string, string> {
  return { authorization: req.headers.get("authorization") ?? "" };
}

export async function GET(req: NextRequest) {
  if (!(await verifyRequest(req))) return unauthorized();
  if (!migrationServiceEnabled()) return NextResponse.json({ success: true, data: null });
  return forwardMigration("/legacy-activity", { method: "GET", headers: bearer(req) });
}

export async function POST(req: NextRequest) {
  if (!(await verifyRequest(req))) return unauthorized();
  if (!migrationServiceEnabled()) return NextResponse.json({ success: true, data: { saved: 0 } });

  const status = await forwardMigration("/status", { method: "GET", headers: bearer(req) });
  if (!status.ok) return status;
  const body = (await status.json().catch(() => null)) as {
    data?: { linked?: unknown; legacy?: { evm?: unknown; solana?: unknown } | null };
  } | null;
  const legacy = body?.data?.legacy;
  const evm = typeof legacy?.evm === "string" ? legacy.evm : undefined;
  const solana = typeof legacy?.solana === "string" ? legacy.solana : undefined;
  if (body?.data?.linked !== true) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_LINKED", message: "Link the old account first." } },
      { status: 409 }
    );
  }
  // An old account with no wallet has no on-chain history to keep.
  if (!evm && !solana) return NextResponse.json({ success: true, data: { saved: 0 } });

  let items: unknown[];
  try {
    const read = await fetchActivity(evm, solana, SNAPSHOT_LIMIT);
    // An incomplete sweep is not stored: a snapshot with a hole in it would
    // be served as the whole history for good. The next trigger tries again.
    if (read.unavailable.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PARTIAL_READ",
            message: "Could not read all of the old wallet's history.",
          },
        },
        { status: 503 }
      );
    }
    items = read.items.map((item) => ({ ...item, legacy: true }));
  } catch (error) {
    console.error("Legacy activity snapshot failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "UPSTREAM_ERROR", message: "Could not read the old wallet's history." },
      },
      { status: 503 }
    );
  }
  return forwardMigration("/legacy-activity", {
    method: "POST",
    headers: bearer(req),
    body: JSON.stringify({ items }),
  });
}
