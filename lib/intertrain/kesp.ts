import { authHeaders } from "@/lib/api";

/** Buying Kash with naira. The app's own route (app/api/kesp) asks the order service for us. */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/kesp/${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(await authHeaders("current")) },
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
    message?: string;
  } | null;
  if (!res.ok || !body?.success || body.data === undefined) {
    throw new Error(
      body?.error?.message ??
        body?.message ??
        "Buying with naira is not available right now. Try again shortly."
    );
  }
  return body.data;
}

export interface KespQuote {
  amountNgn: string;
  amountKesp: string;
  sellRateNgnPerKesp: string;
}
export interface KespOrder {
  orderId: string;
  quote: KespQuote;
  expiresAt?: string;
  paymentInstructions?: unknown;
}
export interface KespOrderState {
  state: string;
  depositTx?: string;
}

export const getQuote = (amountNgn: string) =>
  call<{ quote: KespQuote }>(`quote?amountNgn=${encodeURIComponent(amountNgn)}`).then(
    (d) => d.quote
  );
export const createOrder = (amountNgn: string, address: string) =>
  call<KespOrder>("orders", { method: "POST", body: JSON.stringify({ amountNgn, address }) });
export const getOrder = (orderId: string) =>
  call<KespOrderState>(`orders/${encodeURIComponent(orderId)}`);

/** Bank details come back in whatever shape the provider uses: show the plain text fields as label and value. */
export function instructionRows(obj: unknown, out: Array<[string, string]> = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 2) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/^(id|reference|status|type|metadata|links?)$/i.test(k)) continue;
    if (typeof v === "string" || typeof v === "number") {
      const label = k
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase());
      out.push([label, String(v)]);
    } else if (v && typeof v === "object") instructionRows(v, out, depth + 1);
  }
  return out;
}

export const ngn = (v: string | number) =>
  Number(v).toLocaleString("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  });
