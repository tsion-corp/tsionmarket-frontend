"use client";

import Link from "next/link";
import { CopyButton } from "@/components/ui/copy-button";
import { NetworkIcon } from "@/components/ui/network-icon";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { useDecaneAccount } from "../hooks/use-decane-account";
import { destinationsFromWallet } from "../lib/move-funds";
import { addressesOf } from "../lib/wallet-flow";
import { MoveFundsPanel } from "./move-funds-panel";
import { BODY, NOTICE, PANEL, PRIMARY, SMALL, SUBTITLE, WELL } from "./ui";
import { useWalletState } from "./wallet-panel";

/**
 * The Legacy Wallet: the wallet the account had before the new one, kept so what is still in it
 * can be moved across. The app itself runs on the new wallet; nothing here spends by itself.
 * Each move is signed by the person, through their sign-in, and goes to the new wallet's own
 * addresses, shown in full on the way.
 */
export function LegacyWalletPage({ config }: { config: WalletUpgradeConfig }) {
  const session = useAuthSession();
  const legacy = useDecaneAccount();
  const wallet = useWalletState(session.userId, config.walletAvailable && session.authenticated);
  const newWallet = wallet.data && wallet.data.kind !== "none" ? wallet.data.wallet : null;
  const destinations = newWallet ? destinationsFromWallet(addressesOf(newWallet)) : null;
  const sources = { evm: legacy.evmAddress, solana: legacy.solanaAddress };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="ws-display text-[28px] tracking-[-0.015em]">Legacy wallet</h1>
        <p className={`${BODY} mt-2`}>
          This is your previous wallet. The app now uses your new wallet, so anything left here
          should be moved across.
        </p>
      </div>

      <section className={`${PANEL}`}>
        <h2 className={SUBTITLE}>Its addresses</h2>
        {!session.authenticated ? (
          <p className={BODY}>Sign in to see your legacy wallet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {(
              [
                ["eth-mainnet", "Ethereum and other EVM chains", legacy.evmAddress],
                ["solana-mainnet", "Solana", legacy.solanaAddress],
              ] as const
            ).map(([network, label, address]) => (
              <li key={network} className={`${WELL} flex items-center gap-3.5 px-4 py-3.5`}>
                <NetworkIcon network={network} size={36} />
                <div className="min-w-0 flex-1">
                  <div className={SMALL}>{label}</div>
                  <div className="truncate font-mono text-[13px] text-white" title={address ?? ""}>
                    {address ?? "—"}
                  </div>
                </div>
                {address ? <CopyButton value={address} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {session.authenticated && !wallet.isPending && !newWallet ? (
        <section className={PANEL}>
          <h2 className={SUBTITLE}>Make your new wallet first</h2>
          <p className={BODY}>
            Funds are moved into your new wallet, so it has to exist before anything can move.
          </p>
          <Link href="/upgrade" className={`${PRIMARY} text-center`}>
            Create your new wallet
          </Link>
        </section>
      ) : null}

      {config.moveFundsAvailable && newWallet && destinations && session.authenticated ? (
        <MoveFundsPanel config={config} linked={sources} destinations={destinations} />
      ) : null}

      {wallet.isError ? (
        <p role="alert" className={NOTICE.warn}>
          We couldn&apos;t check your new wallet just now. Try again in a moment.
        </p>
      ) : null}
    </div>
  );
}
