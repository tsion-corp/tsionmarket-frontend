/**
 * Reads from the Intertrain node. Public and read-only, and the node answers any origin, so
 * the browser asks it directly; set NEXT_PUBLIC_INTERTRAIN_RPC_URL to use a node of our own.
 */

const RPC_URL = process.env.NEXT_PUBLIC_INTERTRAIN_RPC_URL || "https://rpc.intertrain.online/rpc";

export async function intertrainRpc<T>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`The Intertrain network answered ${response.status}.`);
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) {
    throw new Error(body.error?.message ?? "The Intertrain network gave no answer.");
  }
  return body.result;
}

/** Native WSK in base units (6 decimals). An account the chain has never seen holds 0. */
export async function getWskBalance(address: string): Promise<bigint> {
  try {
    const account = await intertrainRpc<{ balance?: unknown }>("account_get", { address });
    const balance = account.balance;
    if (typeof balance === "string" && /^\d+$/.test(balance)) return BigInt(balance);
    if (typeof balance === "number" && Number.isSafeInteger(balance) && balance >= 0) {
      return BigInt(balance);
    }
    return 0n;
  } catch (error) {
    // A fresh address is "not found", which is a zero balance, not a failure.
    if (
      error instanceof Error &&
      /not.?found|unknown account|no such account/i.test(error.message)
    ) {
      return 0n;
    }
    throw error;
  }
}

/** "confirmed" once the relayer's mint has landed; "not_found" until it has picked the deposit up. */
export async function getBridgeOperationStatus(operationId: string): Promise<string> {
  const result = await intertrainRpc<{ status?: unknown }>("bridge_operation_status", {
    operation_id: operationId,
  });
  return typeof result.status === "string" ? result.status : "unknown";
}
