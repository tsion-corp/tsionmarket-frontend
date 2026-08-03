"use client";

import { useState } from "react";
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { createSolanaRpcSubscriptions } from "@solana/kit";
import { createAppSolanaRpc } from "@/lib/solana-rpc";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { createQueryClient } from "@/lib/query-client";
import {
  RQ_PERSIST_KEY,
  RQ_PERSIST_MAX_AGE,
  RQ_PERSIST_BUSTER,
  isPersistedKey,
} from "@/lib/query-persist";
import { Toaster } from "@/components/ui/toaster";
import { NetworkStatusProvider } from "@/components/providers/network-status";
import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
// import { RecordButton } from "@/components/voice/record-button";

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

type SolanaRpcs = NonNullable<NonNullable<PrivyClientConfig["solana"]>["rpcs"]>;
type SolanaRpcEntry = NonNullable<SolanaRpcs[keyof SolanaRpcs]>;

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  // Without this Privy has nowhere to broadcast a Solana transaction and every
  // Solana signature fails with "No RPC configuration found for chain
  // solana:mainnet". Reads and sends go through our proxy; the subscription
  // endpoint is only consulted when waiting for confirmation, which we skip
  // (optimisticBroadcast) and do ourselves against the same proxy.
  const [solanaRpcs] = useState<SolanaRpcs>(() => ({
    "solana:mainnet": {
      // Privy declares this against the test-cluster RPC API, which includes
      // requestAirdrop — a method mainnet does not have. The client is right;
      // only the declaration is too narrow.
      rpc: createAppSolanaRpc() as SolanaRpcEntry["rpc"],
      rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
      blockExplorerUrl: "https://explorer.solana.com",
    },
  }));
  // Storage is undefined on the server, which makes the persister a no-op there,
  // so the same provider tree renders on both sides without a hydration mismatch.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: RQ_PERSIST_KEY,
      throttleTime: 1000,
    })
  );
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "twitter", "email", "passkey"],
        embeddedWallets: {
          // Sign and send under the hood — no confirmation modal. The app
          // abstracts web3 away, so transactions (RWA buys, vault wagers,
          // swaps, deposits) go through without a Privy approval prompt. Can be
          // overridden per call with uiOptions.showWalletUIs when a specific
          // action ever needs an explicit confirmation.
          showWalletUIs: false,
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        solana: { rpcs: solanaRpcs },
        appearance: {
          walletChainType: "ethereum-and-solana",
          // Login modal only — tx signing stays headless (showWalletUIs: false).
          theme: "#0c0c0e",
          accentColor: "#d4d4d8",
          // Root-relative, not `${window.location.origin}/…`. That branch made
          // the logo undefined on the server and a string on the client, so
          // Privy's hidden preload <img> existed only in the client render and
          // every page load failed hydration. The browser resolves this against
          // the current origin anyway, which is all the branch was computing.
          logo: "/ark-logo.svg",
        },
      }}
    >
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: RQ_PERSIST_MAX_AGE,
          buster: RQ_PERSIST_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              defaultShouldDehydrateQuery(query) && isPersistedKey(query.queryKey),
          },
        }}
      >
        <NetworkStatusProvider>
          <BalanceVisibilityProvider>
            {children}
            {/* Inside BalanceVisibilityProvider so the voice command can read
                the hide-balances state; needs Privy + React Query too, both of
                which wrap this. */}
            {/* <RecordButton /> */}
          </BalanceVisibilityProvider>
        </NetworkStatusProvider>
        <Toaster />
      </PersistQueryClientProvider>
    </PrivyProvider>
  );
}
