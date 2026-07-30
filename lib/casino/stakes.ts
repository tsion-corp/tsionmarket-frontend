// Stake and fee math for casino head-to-head games. All arithmetic runs on
// integer minor units (kobo, USDC cents, hundredths of SOL) so display values
// never drift from floating point.

export type CasinoCurrency = "NGN" | "USDC" | "SOL";

// Platform participation fee, taken from the pot when a game settles.
export const PARTICIPATION_FEE_BPS = 500;

export interface StakeBreakdown {
  // Both players' stakes combined.
  potMinor: number;
  // Participation fee taken from the pot.
  feeMinor: number;
  // What the winner takes home.
  potentialMinor: number;
}

// Parses a user-typed stake ("50000", "340.50") into minor units. Returns 0
// for anything unparseable so callers can treat it as an empty stake.
export function parseStakeToMinor(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [whole, frac = ""] = cleaned.split(".");
  const wholeMinor = Number(whole || "0") * 100;
  const fracMinor = Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(wholeMinor) || !Number.isFinite(fracMinor)) return 0;
  return wholeMinor + fracMinor;
}

export function stakeBreakdown(stakeMinor: number): StakeBreakdown {
  const potMinor = stakeMinor * 2;
  const feeMinor = Math.floor((potMinor * PARTICIPATION_FEE_BPS) / 10_000);
  return { potMinor, feeMinor, potentialMinor: potMinor - feeMinor };
}

// Formats minor units in the shape each currency reads naturally: whole naira
// with the sign, two decimals for USDC and SOL.
export function formatCasinoAmount(minor: number, currency: CasinoCurrency): string {
  if (currency === "NGN") {
    return "₦" + Math.round(minor / 100).toLocaleString("en-US");
  }
  const units = (minor / 100).toFixed(2);
  return `${units} ${currency}`;
}
