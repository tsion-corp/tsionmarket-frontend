"use client";

import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
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
import { RecordButton } from "@/components/voice/record-button";

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
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
        appearance: {
          walletChainType: "ethereum-and-solana",
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
            <RecordButton />
          </BalanceVisibilityProvider>
        </NetworkStatusProvider>
        <Toaster />
      </PersistQueryClientProvider>
    </PrivyProvider>
  );
}
