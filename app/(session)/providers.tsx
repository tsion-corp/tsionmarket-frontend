"use client";

import { useState } from "react";
import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import { createSolanaRpcSubscriptions } from "@solana/kit";
import { base } from "viem/chains";
import { createAppSolanaRpc } from "@/lib/solana-rpc";
import { NetworkStatusProvider } from "@/components/providers/network-status";
import { SessionCacheGuard } from "@/components/providers/session-cache-guard";
import { AnalyticsIdentity } from "@/components/providers/analytics-identity";
import { AnalyticsSegments } from "@/components/providers/analytics-segments";
import { BalanceVisibilityProvider } from "@/components/ui/balance-visibility";
// Deep import, not the barrel. `@/features/casino` re-exports 27 components,
// including the chess and arkjet screens, and this provider is mounted on
// every signed-in route — so the barrel pulled the whole casino into the
// initial payload for one timer. optimizePackageImports only rewrites npm
// barrels, not ours. This file sits under app/ rather than components/ for
// the same reason the root providers do: it composes a feature, and only the
// app layer may. The gate loads the host itself on demand.
import { MiniTimerGate } from "@/features/casino/components/last-standing/mini-timer-gate";
import { BroadcastSessionProvider } from "@/components/broadcast/broadcast-session";
import { PrivyModalWatch } from "@/components/broadcast/privy-modal-watch";
import { WALLET_CHAINS } from "@/lib/trade/wallet-chains";

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

type SolanaRpcs = NonNullable<NonNullable<PrivyClientConfig["solana"]>["rpcs"]>;
type SolanaRpcEntry = NonNullable<SolanaRpcs[keyof SolanaRpcs]>;

/**
 * Everything a signed-in session needs and a signed-out page does not: the
 * Privy wallet SDK, the broadcast session that holds the LiveKit room, the
 * balance-visibility toggle, the analytics identity, the timer pop-out.
 *
 * Mounted by the layout beside it, so it wraps sign-in, onboarding, the
 * product routes and the games, and persists across every navigation among
 * them. It used to sit in the root providers, which put Privy, viem and
 * livekit-client, over a megabyte of JavaScript, in front of the landing page
 * and the privacy policy. Neither uses any of it.
 */
export function SessionProviders({ children }: { children: React.ReactNode }) {
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
      <NetworkStatusProvider>
        <BalanceVisibilityProvider>
          {/* The broadcast session sits above the router on purpose: it holds
              the LiveKit room and the Market Square stream, so a broadcast
              started on the chess board survives navigating to the portfolio
              instead of dying with the page that started it. */}
          <BroadcastSessionProvider>
            {children}
            {/* Holds the outgoing video while Privy's dialog is open, which is
                where wallet export, recovery phrases and private-key reveal
                live. Needs both contexts, so it mounts here rather than beside
                the session provider. Renders nothing. */}
            <PrivyModalWatch />
            {/* Empties the persisted query cache when the session ends, so
                a signed-out browser holds no balances. Needs both the Privy
                and query contexts. Renders nothing. */}
            <SessionCacheGuard />
            {/* Syncs Mixpanel's identity to Privy auth state; needs to sit
                inside PrivyProvider to read it. Renders nothing. */}
            <AnalyticsIdentity />
            <AnalyticsSegments />
            {/* Owns the Last Man Standing pop-out timer. Mounted here, above the
                pages, so the floating window survives navigating anywhere in
                the app. The gate loads the host only on Arkade routes or while
                a game is followed; the rest of the time nothing is loaded. */}
            <MiniTimerGate />
          </BroadcastSessionProvider>
        </BalanceVisibilityProvider>
      </NetworkStatusProvider>
    </PrivyProvider>
  );
}
