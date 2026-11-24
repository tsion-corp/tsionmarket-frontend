# ADR for Dummies: A gas balance that only shows when it matters

- **Status:** Accepted 2026-11-24
- **Full version:** [ADR-2026-11-24-base-gas-balance](./ADR-2026-11-24-base-gas-balance.md)

## The Idea

Today we pay the network fees ("gas") on Base, so users never need ETH
there. If we ever stop paying, users would need a little ETH of their own.
This change gets the app ready for that.

## What Users See

- **Now, while we pay the fees:** nothing changes.
- **If we stop paying:**
  - The portfolio shows their Base gas balance.
  - It warns when the balance is under $1 and offers an "Add ETH" button.
  - A buy that can't pay its fee is held back with a clear message.

## What We Dropped

An automatic top-up that swapped $1 of a user's USDC into ETH without
asking. We don't move people's money without them pressing a button.
