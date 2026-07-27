"use client";

// REST client for the Last Standing vault game (world-street-vault service).
// Called directly against the game's own gateway, not proxied through our
// /api/* routes: the gateway handles CORS and every read here is public, no
// key required. See world-street-vault-frontend.md for the full contract.

export interface TokenAmount {
  amount: string;
  tokenSymbol: string;
  usdValue: number;
  formattedUsd: string;
}

export interface VaultGameStatus {
  timeRemaining: number;
  isGameStarted: boolean;
  lastPlayer: string | null;
  vaultBalance: TokenAmount;
  entryFee: TokenAmount;
  timerDuration: number;
  gameActive: boolean;
}

export interface VaultWinner {
  id: string;
  contractAddress: string;
  networkId: number;
  tokenName: string;
  winnerAddress: string;
  winnerPrizeWei: string;
  playerCount: number;
  endedAt: string;
}

export type VaultActivityAction = "joined" | "won";

export interface VaultActivity {
  id: string;
  action: VaultActivityAction;
  address: string;
  amountWei: string;
  transactionHash: string;
  createdAt: string;
}

interface VaultApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Reads go through our own same-origin proxy (app/api/vault) rather than the
// vault gateway directly: the gateway sends no CORS headers, so a direct
// browser fetch is blocked. The proxy forwards server-side and caches briefly.
const BASE_PATH = "/api/vault";

// Unwraps the { success, data | error } envelope and throws a typed error.
async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (body && body.success === true) return body.data as T;
  const err: VaultApiError = body?.error ?? {
    code: "SERVICE_UNAVAILABLE",
    message: "Request failed",
  };
  const thrown = new Error(err.message) as Error & { code: string; details?: unknown };
  thrown.code = err.code;
  thrown.details = err.details;
  throw thrown;
}

export async function fetchVaultStatus(): Promise<VaultGameStatus> {
  return unwrap<VaultGameStatus>(await fetch(`${BASE_PATH}/game/status`));
}

export async function fetchPendingWinnings(address: string): Promise<TokenAmount> {
  const data = await unwrap<{ pendingWinnings: TokenAmount }>(
    await fetch(`${BASE_PATH}/game/pending-winnings/${encodeURIComponent(address)}`)
  );
  return data.pendingWinnings;
}

export async function fetchVaultWinners(): Promise<VaultWinner[]> {
  const data = await unwrap<{ winners: VaultWinner[] }>(await fetch(`${BASE_PATH}/game/winners`));
  return data.winners;
}

export async function fetchVaultActivities(): Promise<VaultActivity[]> {
  const data = await unwrap<{ activities: VaultActivity[] }>(
    await fetch(`${BASE_PATH}/game/activities`)
  );
  return data.activities;
}
