"use client";

import { useState } from "react";
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { createSolanaRpcSubscriptions } from "@solana/kit";
import { createAppSolanaRpc } from "@/lib/solana-rpc";

// Privy's last mounts. The app runs on Decane; this provider wraps only the
// surfaces that must still sign with the OLD Privy embedded wallets: the
// one-click Update Balance button (the asset sweep out of them) and
// /prediction/reclaim (claims owed to them).
// All four historical login methods stay enabled so twitter and
// passkey accounts can still get in. No wallets are created on login: an
// account that never had one has nothing legacy to touch. This file goes away
// when the migration window closes.

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

type SolanaRpcs = NonNullable<NonNullable<PrivyClientConfig["solana"]>["rpcs"]>;
type SolanaRpcEntry = NonNullable<SolanaRpcs[keyof SolanaRpcs]>;

export function LegacyPrivyProvider({ children }: { children: React.ReactNode }) {
  // Without this Privy has nowhere to broadcast a Solana transaction and every
  // Solana signature fails with "No RPC configuration found for chain
  // solana:mainnet". See the pre-migration app/providers.tsx for the history.
  const [solanaRpcs] = useState<SolanaRpcs>(() => ({
    "solana:mainnet": {
      // Privy declares this against the test-cluster RPC API; mainnet lacks
      // requestAirdrop, so only the declaration is too narrow, not the client.
      rpc: createAppSolanaRpc() as SolanaRpcEntry["rpc"],
      rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
      blockExplorerUrl: "https://explorer.solana.com",
    },
  }));
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "twitter", "email", "passkey"],
        embeddedWallets: {
          // Sign under the hood, no confirmation modal, matching how the app
          // always drove these wallets.
          showWalletUIs: false,
        },
        solana: { rpcs: solanaRpcs },
        appearance: {
          walletChainType: "ethereum-and-solana",
          theme: "#0c0c0e",
          accentColor: "#d4d4d8",
          logo: "/ark-logo.svg",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
