"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { useIntertrainAccount } from "@/hooks/use-intertrain-account";
import { requestWalletUnlock } from "@/lib/signer/unlock-request";

/**
 * The new wallet's Intertrain address, on the Kash card that stands for Intertrain: the
 * address to give someone sending WSK (Kash) there, with a copy button. Shortened to fit,
 * copied whole. Nothing for an account with no new wallet; a prompt to unlock when the wallet
 * has not shown its address on this device yet.
 */
export function WskAddressPill({ className = "" }: { className?: string }) {
  const account = useIntertrainAccount();
  if (!account.hasWallet) return null;

  if (!account.address) {
    return (
      <button
        type="button"
        onClick={requestWalletUnlock}
        className={`cursor-pointer rounded-full border border-black/15 bg-black/6 px-3.5 py-1 text-[12px] leading-[1.3] font-medium text-black/70 underline-offset-2 hover:underline ${className}`}
      >
        Unlock your wallet to see your Kash address
      </button>
    );
  }

  const address = account.address;
  const shown = `${address.slice(0, 10)}…${address.slice(-6)}`;
  return (
    <div
      className={`flex max-w-full items-center gap-1.5 rounded-full border border-black/15 bg-black/6 py-1 pr-1 pl-3.5 ${className}`}
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] text-black/55 uppercase">
        Kash
      </span>
      <span
        className="truncate font-mono text-[12.5px] leading-[1.3] text-black/75"
        title={address}
        data-testid="wsk-address"
      >
        {shown}
      </span>
      <CopyButton value={address} size="sm" tone="ink" toastMessage="Kash address copied" />
    </div>
  );
}
