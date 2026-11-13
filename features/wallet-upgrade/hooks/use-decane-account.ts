"use client";

import { useSocialWallet } from "decane-connect-kit";
import { useAuthSession } from "@/hooks/use-auth-session";

/**
 * The signed-in Decane account and the addresses of its Decane wallet, whichever wallet
 * the rest of the app is using. useAuthSession follows the wallet in use (so the app's
 * reads and sends agree); the move needs the Decane wallet's own, as that is where the
 * funds are being moved from.
 */
export function useDecaneAccount() {
  const session = useAuthSession();
  const { addresses } = useSocialWallet();
  return {
    ready: session.ready,
    authenticated: session.authenticated,
    userId: session.userId,
    evmAddress: addresses?.evm ?? null,
    solanaAddress: addresses?.solana ?? null,
  };
}
