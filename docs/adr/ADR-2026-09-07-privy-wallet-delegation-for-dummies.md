# ADR for Dummies: Privy Wallet Delegation to Backend

## Will Our 20,000 Live Users Lose Any Data or Funds?

**NO. Absolute zero risk of data loss or fund loss.**

Here is why:

1. **Your wallet address does not change**: When you delegate a wallet, Privy does not generate a new wallet. It keeps your exact same Ethereum and Solana address.
2. **Your funds, balances, and NFTs stay exactly where they are**: Delegation does not touch on-chain state, balances, or tokens.
3. **No keys are reset or wiped**: Delegation simply tells Privy: _"Allow the backend server to sign approved transactions on this wallet."_
4. **Completely seamless for returning users**: If an existing user logs in, the app checks if their wallet is already delegated. If not, it quietly enables delegation in the background. If already delegated, it does nothing.
5. **No login lockout**: If delegation fails due to a network glitch, the user still logs in and enters the dashboard normally.

---

## What Are We Doing?

We are enabling **Headless Privy Wallet Delegation** on the frontend. When a user logs in (or visits the auth flow), the platform checks if their Ethereum and Solana wallets are delegated to the World Street backend. If not, it quietly provisions delegation without annoying popups.

---

## Why Is This Needed?

Without delegation, the backend server cannot sponsor transactions, execute automated trades, or manage on-chain actions for users because the embedded wallet is locked to the user's browser. Delegation authorizes the backend to perform permitted on-chain actions on the user's behalf.
