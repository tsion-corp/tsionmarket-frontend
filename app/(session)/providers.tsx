"use client";

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { DecaneKit } from "decane-connect-kit";
import { returningFromPrivyOAuth } from "@/features/migrate/lib/oauth-return";
import { useDecaneCredentials } from "@/hooks/use-decane-credentials";
// Staging (post-Decane-fork) addition: fans Polymarket query invalidations
// across tabs. Pure query-cache plumbing, no wallet — safe under Decane.
import { usePredictionQueryBroadcast } from "@/features/prediction/markets/query-broadcast";
import { NetworkStatusProvider } from "@/components/providers/network-status";
import { SessionCacheGuard } from "@/components/providers/session-cache-guard";
import { DecaneTokenBridge } from "@/components/providers/decane-token-bridge";
import { DecaneRecoveryHost } from "@/components/providers/decane-recovery-host";
import { AnalyticsIdentity } from "@/components/providers/analytics-identity";
import { AnalyticsSegments } from "@/components/providers/analytics-segments";
// Deep imports, not the barrels, for the reason given for the casino import
// below: this provider is on every session route.
import { DepositAnalytics } from "@/features/activity/components/deposit-analytics";
import { BankDepositAnalytics } from "@/features/funds/components/bank-deposit-analytics";
import { BankWithdrawAnalytics } from "@/features/funds/components/bank-withdraw-analytics";
import { PredictionCashoutTracker } from "@/features/prediction/components/prediction-cashout-tracker";
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
import {
  collectRotatedRecoveryPassword,
  deliverRecoveryFile,
  promptForRecoveryFile,
  promptPin,
  promptUnlockPassword,
} from "@/lib/decane-recovery";

// Well-formed placeholders let the app build before env vars are set. Decane
// only talks to its backend when a sign-in is attempted, so mounting the kit
// with these is inert.
// Both now come from the server at runtime (hooks/use-decane-credentials), so
// the publishable key is not baked into the bundle or its source maps. The app
// id stays inlined as a fallback: it is an identifier, not a credential.
const DECANE_APP_ID_FALLBACK = process.env.NEXT_PUBLIC_DECANE_APP_ID || "wsws-placeholder";

// The chains the app holds value on, in Decane's social chain-id format. Keep
// in sync with EVM_NETWORKS in lib/server/alchemy.ts.
// Deferred, and deep-imported through a host rather than the @/features/migrate
// barrel. That barrel re-exports UpdateBalanceButton, which mounts
// LegacyPrivyProvider — the whole Privy SDK — and the host pulls
// MIGRATION_ADAPTERS, which reaches into four feature barrels. Statically
// imported here they would ship on every signed-in route for a component that
// renders on one page load in a user's life. Same trap as the casino barrel
// noted above.
const MigrationOAuthReturnHost = dynamic(
  () => import("@/components/layout/migration-oauth-return-host"),
  { ssr: false }
);
// The one upgrade card, mounted once for the whole signed-in session: held
// open by the offer, or opened by a door (the balance card, the account
// menu, the way back from the old sign-in) from any signed-in route. Deferred
// for the same reason as the return host: it mounts the old provider's SDK.
const MigrationGateHost = dynamic(() => import("@/components/layout/migration-gate-host"), {
  ssr: false,
});

const DECANE_CHAINS = ["evm:8453", "evm:1", "evm:42161", "evm:10", "evm:137", "solana:mainnet"];

/**
 * Everything a signed-in session needs and a signed-out page does not: the
 * Decane wallet SDK, the broadcast session that holds the LiveKit room, the
 * balance-visibility toggle, the analytics identity, the timer pop-out.
 *
 * Mounted by the layout beside it, so it wraps sign-in, onboarding, the
 * product routes and the games, and persists across every navigation among
 * them. It used to sit in the root providers, which put the wallet SDK, viem
 * and livekit-client, over a megabyte of JavaScript, in front of the landing
 * page and the privacy policy. Neither uses any of it.
 *
 * Privy is no longer mounted here (ADR-0009). The two surfaces that must still
 * sign with the OLD Privy wallets — the Update Balance sweep and
 * /prediction/reclaim — mount LegacyPrivyProvider themselves, so the legacy SDK
 * loads only for the users who still have something to move. That is also why
 * the Solana RPC wiring Privy needed is gone: the kit takes its chains from
 * config and reads through our own proxy.
 */
export function SessionProviders({ children }: { children: React.ReactNode }) {
  // Cross-tab Polymarket query invalidation (staging addition, post-fork).
  usePredictionQueryBroadcast(useQueryClient());
  // Fetched, not inlined. Null means the first round trip is still in flight —
  // the kit cannot mount without a key, and anything below it calls kit hooks,
  // so nothing renders until it lands.
  const decane = useDecaneCredentials();

  // TODO(decane-migration): staging also mounted <PredictionCashoutTracker/>
  // here. It was written against Privy ("needs Privy and the query client") and
  // postdates the Decane fork, so it needs re-porting onto the Decane signer
  // before it can mount — Privy is no longer a provider on this route. Omitted
  // for now so the tree builds on Decane; re-add once adapted.

  if (!decane) return <DecaneBootGate />;

  return (
    <DecaneKit
      config={{
        appId: decane.appId || DECANE_APP_ID_FALLBACK,
        mode: "social",
        theme: "dark",
        social: {
          apiKey: decane.apiKey,
          authMethods: ["google", "email", "kingschat", "x"],
          chains: DECANE_CHAINS,
          // The kit's own full-screen "Creating your wallet" overlay is off:
          // the sign-in page shows its branded busy panel for the creating
          // window (it is where the Google redirect lands), and AuthGuard's
          // loading screen covers the unlocking window on every other route.
          showStatusOverlay: false,
          // Wallet recovery rotates the share set and must hand the user a
          // fresh recovery file; these bridge into the dialogs rendered by
          // DecaneRecoveryHost below. Without onRecoveryRotated the kit
          // refuses to run recovery at all. No signup-time offer: new devices
          // are provisioned from the sign-in alone since 2.7.4.
          onRecoveryRotated: collectRotatedRecoveryPassword,
          onRecoveryFileReady: deliverRecoveryFile,
          // Without this, a device with no share and no passkey throws
          // NewDeviceError instantly instead of asking for the saved file.
          promptForRecoveryFile,
          // A device that cannot reach a passkey — an unreachable password
          // manager, no WebAuthn PRF, or a declined prompt — wraps its device
          // share with an unlock password instead. promptPin stays for the
          // devices enrolled before that, which still open with their PIN.
          promptPin,
          promptUnlockPassword,
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
            {/* Empties the persisted query cache when the session ends, so
                a signed-out browser holds no balances. Needs both the session
                and query contexts. Renders nothing. */}
            <SessionCacheGuard />
            {/* Registers the kit's synchronous getAccessToken with the fetch
                wrapper, so authed requests carry a Decane bearer. Replaces
                Privy's IdentityTokenBridge: Decane issues no identity token,
                and routes resolve the user from verified claims instead.
                Renders nothing. */}
            <DecaneTokenBridge />
            {/* Syncs Mixpanel's identity to auth state; needs to sit inside
                DecaneKit to read it. Renders nothing. */}
            <AnalyticsIdentity />
            <AnalyticsSegments />
            {/* Renders the recovery, PIN and unlock-password dialogs the kit
                asks for through the callbacks above. Renders nothing until one
                is requested. */}
            <DecaneRecoveryHost />
            {/* Report money arriving and leaving: settled deposits on either
                rail, and bank withdrawals to their payout. Here rather than on
                the dashboard, which a user who deposits and goes straight to
                trading never returns to. Each waits for a signed-in wallet.
                Render nothing. */}
            <DepositAnalytics />
            <BankDepositAnalytics />
            <BankWithdrawAnalytics />
            {/* Watches open Polymarket cashouts for the market workspace.
                Needs Privy and the query client. Renders nothing. */}
            <PredictionCashoutTracker />
            {/* Owns the Last Man Standing pop-out timer. Mounted here, above the
                pages, so the floating window survives navigating anywhere in
                the app. The gate loads the host only on Arkade routes or while
                a game is followed; the rest of the time nothing is loaded. */}
            <MiniTimerGate />
            {/* Google and Twitter sign-in for the OLD account returns the whole
                page, landing wherever the user started with Privy's credentials
                in the query string. Privy is no longer a provider on these
                routes (see above), so with nothing mounted the code is never
                exchanged: the sign-in quietly does not happen and the
                credentials stay in the URL and in history. This reopens the
                sheet on the way back, which both completes the login and puts
                the user back where they were — about to move their money.
                Renders nothing on any ordinary page load. */}
            {returningFromPrivyOAuth ? <MigrationOAuthReturnHost /> : null}
            <MigrationGateHost />
          </BroadcastSessionProvider>
        </BalanceVisibilityProvider>
      </NetworkStatusProvider>
    </DecaneKit>
  );
}

/**
 * Shown for the one round trip that fetches the Decane key. Deliberately bare:
 * a spinner here competes with AuthGuard's own loading state a moment later,
 * and this window is a same-origin fetch, not a network wait worth narrating.
 */
function DecaneBootGate() {
  return <div className="bg-bg min-h-dvh" aria-busy="true" />;
}
