export interface ComputerWagerCopyInput {
  over: boolean;
  cancelled: boolean;
  humanWon: boolean;
  stakeUsdc: string;
  potentialPayoutUsdc: string;
  creditedPayoutUsdc: string | null;
  status: string;
}

export function computerWagerStatusLine(input: ComputerWagerCopyInput): string {
  if (!input.over) {
    return `Staked ${input.stakeUsdc} USDC · win pays ${input.potentialPayoutUsdc} USDC`;
  }
  if (input.cancelled || input.status.toLowerCase().includes("refund")) {
    return "Your stake was refunded.";
  }
  if (input.humanWon && input.status === "review") {
    return `Win under review · ${input.potentialPayoutUsdc} USDC will be owed if approved.`;
  }
  if (input.humanWon && input.status === "settled" && input.creditedPayoutUsdc) {
    return `Approved payout: ${input.creditedPayoutUsdc} USDC. It is credited to your chess balance and remains pending there if the cashier needs funding.`;
  }
  return "Stake forfeited to Stockfish.";
}
