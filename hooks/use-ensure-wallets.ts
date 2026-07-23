"use client";

import { useCallback, useRef } from "react";
import { useCreateWallet, type User } from "@privy-io/react-auth";
import { useCreateWallet as useCreateSolanaWallet } from "@privy-io/react-auth/solana";
import { hasEmbeddedWallet } from "@/lib/user";

// Whitelabel logins skip Privy's automatic wallet creation, so we provision
// the embedded wallets ourselves right after authentication.
export function useEnsureWallets() {
  const { createWallet: createEthereumWallet } = useCreateWallet();
  const { createWallet: createSolanaWallet } = useCreateSolanaWallet();
  const running = useRef(false);

  return useCallback(
    async (user: User) => {
      if (running.current) return;
      running.current = true;
      try {
        if (!hasEmbeddedWallet(user, "ethereum")) {
          await createEthereumWallet();
        }
        if (!hasEmbeddedWallet(user, "solana")) {
          await createSolanaWallet();
        }
      } catch (error) {
        // A failed wallet creation should not strand the user on the auth
        // page. Privy retries provisioning on the next session.
        console.error("Embedded wallet provisioning failed:", error);
      } finally {
        running.current = false;
      }
    },
    [createEthereumWallet, createSolanaWallet]
  );
}
