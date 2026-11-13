import type { Hex } from "viem";
import { apiFetch } from "@/lib/api";
import { apiError, unwrap } from "@/lib/api/envelope";

/**
 * Send a transaction the self-custody wallet signed, through the app's broadcast
 * relay (the read proxy has no write method on purpose). The relay checks the sender
 * is this account's own address; here we only turn its answers into plain errors.
 */
export async function broadcastRaw(network: string, raw: Hex): Promise<Hex> {
  const res = await apiFetch(
    `/api/evm-broadcast/${network}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    },
    { requireAuth: true }
  );
  // A network the relay is not switched on for answers 404 and nothing more.
  if (res.status === 404) {
    throw apiError("NOT_AVAILABLE", "This wallet can't send on that network yet.", 404);
  }
  const data = await unwrap<{ hash: Hex }>(res, "We couldn't send that transaction.");
  return data.hash;
}
