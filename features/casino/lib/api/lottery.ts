"use client";

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import type { AuthIdentity } from "@/lib/auth-token";
import type {
  LotteryCheck,
  LotteryConfig,
  LotteryDraw,
  LotteryEligibility,
  LotterySelection,
  LotteryTicket,
} from "@/lib/api/schemas/lottery";

export type {
  LotteryCheck,
  LotteryConfig,
  LotteryDraw,
  LotteryEligibility,
  LotterySelection,
  LotteryTicket,
};

interface QuickPickResponse {
  tickets: LotterySelection[];
}

export interface PurchaseLotteryTicketInput extends LotterySelection {
  player: string;
  idempotencyKey: string;
}

export function fetchLotteryConfig(): Promise<LotteryConfig> {
  return chessGet<LotteryConfig>("/lottery/config");
}

export function fetchCurrentLotteryDraw(): Promise<LotteryDraw> {
  return chessGet<LotteryDraw>("/lottery/draws/current");
}

export function fetchLotteryResults(limit = 8): Promise<LotteryDraw[]> {
  return chessGet<LotteryDraw[]>("/lottery/draws/results", { limit });
}

export function fetchLotteryTickets(
  wallet: string,
  limit = 50,
  identity: AuthIdentity = "current"
): Promise<LotteryTicket[]> {
  return chessGet<LotteryTicket[]>(
    `/lottery/players/${encodeURIComponent(wallet)}/tickets`,
    { limit },
    { requireAuth: true, identity }
  );
}

export function fetchLotteryEligibility(wallet: string): Promise<LotteryEligibility> {
  return chessGet<LotteryEligibility>(
    `/lottery/players/${encodeURIComponent(wallet)}/eligibility`,
    undefined,
    { requireAuth: true }
  );
}

export async function createLotteryQuickPick(
  drawId: string,
  count = 1
): Promise<LotterySelection[]> {
  const response = await chessPost<QuickPickResponse>(
    `/lottery/draws/${encodeURIComponent(drawId)}/quick-pick`,
    { count }
  );
  return response.tickets;
}

export function purchaseLotteryTicket(
  drawId: string,
  input: PurchaseLotteryTicketInput
): Promise<LotteryTicket> {
  return chessPost<LotteryTicket>(`/lottery/draws/${encodeURIComponent(drawId)}/tickets`, {
    ...input,
  });
}

export function checkLotteryNumbers(
  drawId: string,
  tickets: LotterySelection[]
): Promise<LotteryCheck> {
  return chessPost<LotteryCheck>(`/lottery/draws/${encodeURIComponent(drawId)}/check`, {
    tickets,
  });
}
