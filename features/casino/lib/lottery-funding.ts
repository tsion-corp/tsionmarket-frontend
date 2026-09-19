import { z } from "zod";

const pendingTicketSchema = z.object({
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  drawId: z.string().min(1),
  amountUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  selection: z.object({
    whiteNumbers: z.array(z.number().int().min(1).max(69)).length(5),
    powerNumber: z.number().int().min(1).max(26),
  }),
  idempotencyKey: z.string().min(1),
  txHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .nullable(),
});

export type PendingLotteryTicket = z.infer<typeof pendingTicketSchema>;

export class LotteryFundingError extends Error {
  readonly pending: boolean;

  constructor(message: string, options?: ErrorOptions & { pending?: boolean }) {
    super(message, options);
    this.name = "LotteryFundingError";
    this.pending = options?.pending ?? false;
  }
}

export function pendingLotteryTicketKey(wallet: string): string {
  return `arkball:pending-ticket:v1:${wallet.toLowerCase()}`;
}

export function readPendingLotteryTicket(wallet: string): PendingLotteryTicket | null {
  const raw = localStorage.getItem(pendingLotteryTicketKey(wallet));
  if (!raw) return null;
  const ticket = pendingTicketSchema.parse(JSON.parse(raw));
  if (ticket.wallet.toLowerCase() !== wallet.toLowerCase()) {
    throw new Error("The pending ArkBall ticket belongs to a different wallet.");
  }
  return ticket;
}
