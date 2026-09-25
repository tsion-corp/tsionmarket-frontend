"use client";

// Client-side helpers for the Decane wallet session.

interface UnlockableWallet {
  isUnlocked: boolean;
  unlock: () => Promise<void>;
}

// Decane signs inside a TEE session that expires (default two hours). Signing
// hooks call this before every send so an expired session prompts the user to
// unlock instead of failing the operation. When even unlock cannot succeed
// (page reload dropped the JWT) the kit throws ReconnectRequiredError, whose
// message tells the user to sign in again; callers surface it as-is.
export async function ensureUnlocked(wallet: UnlockableWallet): Promise<void> {
  if (wallet.isUnlocked) return;
  await wallet.unlock();
}
