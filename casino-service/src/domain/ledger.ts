import { BadRequest } from "./money.js";

// The book's own account. Fees land here and payouts are drawn from it.
export const HOUSE = "house";

// Custody for staked funds.
//
// A staked game needs somewhere to hold both players' money between the
// commitment and the settlement, so neither side can walk away with it. This
// interface is that boundary. The in-memory implementation below is a real,
// double-entry-safe ledger: it never creates or destroys value, and every
// balance change is recorded.
//
// Swapping in on-chain escrow means implementing this interface against the
// casino escrow contract. Nothing above this file changes.

export interface EscrowHold {
  id: string;
  userId: string;
  amountWei: bigint;
  reference: string;
  releasedTo: string | null;
}

export interface Ledger {
  balanceOf(userId: string): Promise<bigint>;
  credit(userId: string, wei: bigint, reason: string): Promise<void>;
  // Moves funds out of a user's balance into a hold. Throws
  // INSUFFICIENT_BALANCE rather than allowing an overdraft.
  hold(userId: string, wei: bigint, reference: string): Promise<EscrowHold>;
  // Pays every hold under a reference to one user, minus the fee.
  settle(reference: string, winnerUserId: string, feeWei: bigint): Promise<bigint>;
  // Returns every hold under a reference to whoever placed it.
  refund(reference: string): Promise<void>;
}

interface Entry {
  userId: string;
  deltaWei: bigint;
  reason: string;
  at: string;
}

export class InMemoryLedger implements Ledger {
  private balances = new Map<string, bigint>();
  private holds = new Map<string, EscrowHold>();
  // Append-only audit trail. A real deployment persists this.
  readonly journal: Entry[] = [];
  private seq = 0;

  // The house account is the book's own position and may go negative: a
  // winning bet at long odds pays out more than the losing stakes collected,
  // and the difference is the house's liability. Player accounts can never go
  // negative, which is what stops an overdraft.
  private record(userId: string, deltaWei: bigint, reason: string) {
    const next = (this.balances.get(userId) ?? 0n) + deltaWei;
    if (next < 0n && userId !== HOUSE) {
      throw new BadRequest("INSUFFICIENT_BALANCE", "Not enough balance for that stake.");
    }
    this.balances.set(userId, next);
    this.journal.push({ userId, deltaWei, reason, at: new Date().toISOString() });
  }

  async balanceOf(userId: string): Promise<bigint> {
    return this.balances.get(userId) ?? 0n;
  }

  async credit(userId: string, wei: bigint, reason: string): Promise<void> {
    this.record(userId, wei, reason);
  }

  async hold(userId: string, wei: bigint, reference: string): Promise<EscrowHold> {
    this.record(userId, -wei, `hold:${reference}`);
    const hold: EscrowHold = {
      id: `h${++this.seq}`,
      userId,
      amountWei: wei,
      reference,
      releasedTo: null,
    };
    this.holds.set(hold.id, hold);
    return hold;
  }

  private openHolds(reference: string): EscrowHold[] {
    return [...this.holds.values()].filter((h) => h.reference === reference && !h.releasedTo);
  }

  async settle(reference: string, winnerUserId: string, feeWei: bigint): Promise<bigint> {
    const holds = this.openHolds(reference);
    const total = holds.reduce((sum, h) => sum + h.amountWei, 0n);
    if (total === 0n) return 0n;
    const payout = total - feeWei;
    this.record(winnerUserId, payout, `settle:${reference}`);
    // The fee leaves the pot to the house account, so the books still balance.
    this.record(HOUSE, feeWei, `fee:${reference}`);
    for (const h of holds) h.releasedTo = winnerUserId;
    return payout;
  }

  async refund(reference: string): Promise<void> {
    for (const h of this.openHolds(reference)) {
      this.record(h.userId, h.amountWei, `refund:${reference}`);
      h.releasedTo = h.userId;
    }
  }

  // Total value across every balance. Used by the tests to prove that no
  // operation invents or loses money.
  totalValue(): bigint {
    let sum = 0n;
    for (const v of this.balances.values()) sum += v;
    for (const h of this.holds.values()) if (!h.releasedTo) sum += h.amountWei;
    return sum;
  }
}
