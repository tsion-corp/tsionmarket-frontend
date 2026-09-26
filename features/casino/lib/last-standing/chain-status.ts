import { apiFetch } from "@/lib/api";

export interface ChainGameStatus {
  endTime: number;
  settled: boolean;
  king: string;
  chainNow: number;
}

/** Null means "no answer", never "ended": the caller falls back to the service. */
export async function readChainGameStatus(gameId: number): Promise<ChainGameStatus | null> {
  const res = await apiFetch(`/api/vault/status?id=${gameId}`);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    known?: boolean;
    endTime?: unknown;
    settled?: unknown;
    king?: unknown;
    chainNow?: unknown;
  };
  if (
    body.known !== true ||
    typeof body.endTime !== "number" ||
    typeof body.settled !== "boolean" ||
    typeof body.king !== "string" ||
    typeof body.chainNow !== "number"
  ) {
    return null;
  }
  return {
    endTime: body.endTime,
    settled: body.settled,
    king: body.king,
    chainNow: body.chainNow,
  };
}
