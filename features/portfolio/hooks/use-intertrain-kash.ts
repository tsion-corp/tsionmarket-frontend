"use client";

import { useIntertrainAccount } from "@/hooks/use-intertrain-account";
import { useWskBalance } from "@/hooks/use-wsk-balance";
import { formatWsk } from "@/lib/intertrain/bridge";

/**
 * Kash is native WSK on Intertrain for anyone with the new wallet: one KASH is one WSK, and
 * the card shows what that wallet's Intertrain account holds. The legacy rewards engine is
 * left as it is for accounts without a new wallet.
 */
export interface IntertrainKash {
  /** The card is showing Intertrain Kash. */
  active: boolean;
  /** The balance, as text, once read. */
  balance: string | null;
  /** The read is in flight. */
  loading: boolean;
  /** No balance to show: the address is not known on this device yet, or the node failed. */
  unavailable: boolean;
}

export function useIntertrainKash(): IntertrainKash {
  const account = useIntertrainAccount();
  const wsk = useWskBalance(account.address);
  if (!account.hasWallet)
    return { active: false, balance: null, loading: false, unavailable: false };
  return {
    active: true,
    balance: wsk.data !== undefined ? formatWsk(wsk.data) : null,
    loading: account.address !== null && wsk.isLoading,
    unavailable: account.address === null || wsk.isError,
  };
}
