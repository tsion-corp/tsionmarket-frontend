// Dextopus settlement survives a closed trade sheet and can outlive a browser
// tab. Persist only the request metadata: Dextopus remains the source of truth
// for status and no wallet secret or transaction payload is stored here.

const KEY = "wsws.rwa.pending-settlements.v1";
export const PENDING_RWA_SETTLEMENT_TTL_MS = 24 * 60 * 60 * 1000;

export type RwaSettlementDirection = "base-to-solana" | "solana-to-base";

export interface PendingRwaPurchase {
  assetAddress: string;
  assetSymbol: string;
  // Maximum the user approved for this order.
  amountInRaw: string;
  // Confirmed Solana USDC before Dextopus was funded. The order consumes only
  // the increase above this snapshot, never an unrelated existing balance.
  startingUsdcRaw?: string;
  minimumDeliveryRaw?: string;
  slippageBps: number;
}

export interface PendingRwaSale {
  // Confirmed Solana USDC before the RWA swap. Only the increase caused by
  // this sale can be routed, so an unrelated existing balance is never swept.
  startingUsdcRaw: string;
  minimumProceedsRaw: string;
  expectedProceedsRaw: string;
  slippageBps: number;
}

export interface PendingRwaSettlement {
  requestId: string;
  direction: RwaSettlementDirection;
  assetSymbol: string;
  createdAt: number;
  purchase?: PendingRwaPurchase;
  sale?: PendingRwaSale;
}

export function rwaPurchaseSpendRaw(
  requestedRaw: bigint,
  startingUsdcRaw: bigint,
  currentUsdcRaw: bigint
): bigint {
  if (requestedRaw <= 0n) throw new Error("The purchase amount must be positive.");
  if (startingUsdcRaw < 0n || currentUsdcRaw < 0n) {
    throw new Error("A purchase balance cannot be negative.");
  }
  const deliveredRaw = currentUsdcRaw > startingUsdcRaw ? currentUsdcRaw - startingUsdcRaw : 0n;
  if (deliveredRaw === 0n) return 0n;
  return requestedRaw < currentUsdcRaw ? requestedRaw : currentUsdcRaw;
}

export function rwaSaleProceedsRaw(
  startingUsdcRaw: bigint,
  minimumProceedsRaw: bigint,
  expectedProceedsRaw: bigint,
  currentUsdcRaw: bigint
): bigint {
  if (startingUsdcRaw < 0n || currentUsdcRaw < 0n) {
    throw new Error("A sale balance cannot be negative.");
  }
  if (minimumProceedsRaw <= 0n || expectedProceedsRaw < minimumProceedsRaw) {
    throw new Error("The sale proceeds bounds are invalid.");
  }
  const increase = currentUsdcRaw > startingUsdcRaw ? currentUsdcRaw - startingUsdcRaw : 0n;
  if (increase < minimumProceedsRaw) return 0n;
  return increase < expectedProceedsRaw ? increase : expectedProceedsRaw;
}

function isPendingRwaPurchase(value: unknown): value is PendingRwaPurchase {
  if (!value || typeof value !== "object") return false;
  const purchase = value as Record<string, unknown>;
  return (
    typeof purchase.assetAddress === "string" &&
    purchase.assetAddress !== "" &&
    typeof purchase.assetSymbol === "string" &&
    purchase.assetSymbol !== "" &&
    typeof purchase.amountInRaw === "string" &&
    /^\d+$/.test(purchase.amountInRaw) &&
    BigInt(purchase.amountInRaw) > 0n &&
    (purchase.startingUsdcRaw === undefined ||
      (typeof purchase.startingUsdcRaw === "string" && /^\d+$/.test(purchase.startingUsdcRaw))) &&
    (purchase.minimumDeliveryRaw === undefined ||
      (typeof purchase.minimumDeliveryRaw === "string" &&
        /^\d+$/.test(purchase.minimumDeliveryRaw))) &&
    typeof purchase.slippageBps === "number" &&
    Number.isInteger(purchase.slippageBps) &&
    purchase.slippageBps >= 0 &&
    purchase.slippageBps <= 10_000
  );
}

function isPendingRwaSale(value: unknown): value is PendingRwaSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Record<string, unknown>;
  return (
    typeof sale.startingUsdcRaw === "string" &&
    /^\d+$/.test(sale.startingUsdcRaw) &&
    typeof sale.minimumProceedsRaw === "string" &&
    /^\d+$/.test(sale.minimumProceedsRaw) &&
    BigInt(sale.minimumProceedsRaw) > 0n &&
    typeof sale.expectedProceedsRaw === "string" &&
    /^\d+$/.test(sale.expectedProceedsRaw) &&
    BigInt(sale.expectedProceedsRaw) >= BigInt(sale.minimumProceedsRaw) &&
    typeof sale.slippageBps === "number" &&
    Number.isInteger(sale.slippageBps) &&
    sale.slippageBps >= 0 &&
    sale.slippageBps <= 10_000
  );
}

function isPendingRwaSettlement(value: unknown): value is PendingRwaSettlement {
  if (!value || typeof value !== "object") return false;
  const settlement = value as Record<string, unknown>;
  return (
    typeof settlement.requestId === "string" &&
    settlement.requestId !== "" &&
    (settlement.direction === "base-to-solana" || settlement.direction === "solana-to-base") &&
    typeof settlement.assetSymbol === "string" &&
    typeof settlement.createdAt === "number" &&
    Number.isFinite(settlement.createdAt) &&
    (settlement.purchase === undefined || isPendingRwaPurchase(settlement.purchase)) &&
    (settlement.sale === undefined || isPendingRwaSale(settlement.sale)) &&
    !(settlement.purchase !== undefined && settlement.sale !== undefined)
  );
}

let cached: readonly PendingRwaSettlement[] | undefined;
const listeners = new Set<() => void>();

function read(): readonly PendingRwaSettlement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingRwaSettlement) : [];
  } catch {
    return [];
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribePendingRwaSettlements(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cached = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function pendingRwaSettlementsSnapshot(): readonly PendingRwaSettlement[] {
  if (cached === undefined) cached = read();
  return cached;
}

export function serverPendingRwaSettlementsSnapshot(): readonly PendingRwaSettlement[] {
  return [];
}

function write(next: readonly PendingRwaSettlement[]): void {
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing can reject storage. The in-memory record still lets
    // this browser finish tracking without making the user resend funds.
  }
  notify();
}

export function savePendingRwaSettlement(next: PendingRwaSettlement): void {
  const current = pendingRwaSettlementsSnapshot().filter(
    (settlement) => settlement.requestId !== next.requestId
  );
  // A normal account has one or two outstanding cross-chain requests. Keep a
  // small bound even if a corrupted client repeatedly creates records.
  write([...current, next].slice(-8));
}

export function clearPendingRwaSettlement(requestId: string): void {
  write(pendingRwaSettlementsSnapshot().filter((settlement) => settlement.requestId !== requestId));
}

export function isPendingRwaSettlementActive(
  settlement: PendingRwaSettlement,
  now: number
): boolean {
  return now - settlement.createdAt < PENDING_RWA_SETTLEMENT_TTL_MS;
}
