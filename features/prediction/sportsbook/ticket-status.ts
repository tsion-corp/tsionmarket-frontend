import type { SportsbookOrderStatus } from "./api/types";

const TERMINAL_STATUS_DETAIL: Partial<Record<SportsbookOrderStatus, string>> = {
  rejected: "Order rejected before placement",
  failed: "Order submission failed",
  canceled: "Order canceled",
  lost: "Bet settled without a payout",
  partially_void: "Settlement completed with voided selections",
  cashed_out: "Cashout confirmed",
};

export function ticketStatusDetail(status: SportsbookOrderStatus, processing: boolean): string {
  if (processing) return `Latest state: ${status.replaceAll("_", " ")}`;
  return TERMINAL_STATUS_DETAIL[status] ?? "Settlement confirmed";
}
