"use client";

import { useState } from "react";
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { createSolanaRpcSubscriptions } from "@solana/kit";
import { createAppSolanaRpc } from "@/lib/solana-rpc";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  removeOldestQuery,
} from "@tanstack/react-query-persist-client";
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
import { AnalyticsIdentity } from "@/components/providers/analytics-identity";
import { AnalyticsSegments } from "@/components/providers/analytics-segments";
import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
import { ClickRipple } from "@/components/ui/click-ripple";
// Deep import, not the barrel. `@/features/casino` re-exports 27 components,
// including the chess and arkjet screens, and this provider is mounted on
// every route — so the barrel pulled the whole casino into the initial payload
// for one timer. optimizePackageImports only rewrites npm barrels, not ours.
import { MiniTimerHost } from "@/features/casino/components/last-standing/mini-timer";
import { BroadcastSessionProvider } from "@/components/broadcast/broadcast-session";
import { PrivyModalWatch } from "@/components/broadcast/privy-modal-watch";
import { PredictionCashoutTracker } from "@/features/prediction/components/prediction-cashout-tracker";
import { usePredictionQueryBroadcast } from "@/features/prediction/markets/query-broadcast";
import { WALLET_CHAINS } from "@/lib/trade/wallet-chains";
import { base } from "viem/chains";

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

type SolanaRpcs = NonNullable<NonNullable<PrivyClientConfig["solana"]>["rpcs"]>;
type SolanaRpcEntry = NonNullable<SolanaRpcs[keyof SolanaRpcs]>;

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  usePredictionQueryBroadcast(queryClient);
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
      // localStorage quotas vary by browser. Match Polymarket's behavior by
      // dropping the oldest dehydrated query and retrying instead of silently
      // losing the entire cache write.
      retry: removeOldestQuery,
    })
  );
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "twitter", "email", "passkey"],
        // Named explicitly so a chain id resolves to the chain we mean. See
        // lib/trade/wallet-chains: 999 is HyperEVM here, not Zora Goerli.
        supportedChains: [...WALLET_CHAINS],
        defaultChain: base,
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
            {/* The broadcast session sits above the router on purpose: it holds
                the LiveKit room and the Market Square stream, so a broadcast
                started on the chess board survives navigating to the portfolio
                instead of dying with the page that started it. */}
            <BroadcastSessionProvider>
              <ClickRipple />
              {children}
              {/* Holds the outgoing video while Privy's dialog is open, which is
                where wallet export, recovery phrases and private-key reveal
                live. Needs both contexts, so it mounts here rather than beside
                the session provider. Renders nothing. */}
              <PrivyModalWatch />
              {/* Syncs Mixpanel's identity to Privy auth state; needs to sit
                inside PrivyProvider to read it. Renders nothing. */}
              <AnalyticsIdentity />
              <AnalyticsSegments />
              <PredictionCashoutTracker />
              {/* Owns the Last Man Standing pop-out timer. Mounted here, above the
                pages, so the floating window survives navigating anywhere in
                the app; it only subscribes to game data while open. */}
              <MiniTimerHost />
            </BroadcastSessionProvider>
          </BalanceVisibilityProvider>
        </NetworkStatusProvider>
        <Toaster />
      </PersistQueryClientProvider>
    </PrivyProvider>
  );
}
