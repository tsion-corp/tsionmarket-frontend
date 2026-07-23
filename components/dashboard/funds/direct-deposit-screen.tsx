"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { NetworkIcon } from "@/components/ui/network-icon";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { AddressPanel } from "@/components/dashboard/funds/address-panel";
import { useDepositWatch } from "@/hooks/use-deposit-watch";
import { getWalletAddress } from "@/lib/user";
import { formatAmount } from "@/lib/trade/math";
import { DIRECT_NETWORKS, type DirectNetwork } from "@/lib/deposit";

interface DirectDepositScreenProps {
  onBack: () => void;
}

// Direct same-chain USDC deposit. Keyless: it just shows the embedded wallet
// address for the chosen network.
export function DirectDepositScreen({ onBack }: DirectDepositScreenProps) {
  const { user } = usePrivy();
  const [network, setNetwork] = useState<DirectNetwork | null>(null);
  const watch = useDepositWatch(network);

  const available = DIRECT_NETWORKS.filter((n) => getWalletAddress(user, n.chainType) !== null);
  const walletAddress = network ? getWalletAddress(user, network.chainType) : null;

  if (network && walletAddress) {
    return (
      <div>
        <SheetNav
          title={`Deposit on ${network.chainName}`}
          subtitle={`Send USDC or ${network.nativeSymbol} from any wallet or exchange to this address.`}
          onBack={() => setNetwork(null)}
        />
        <AddressPanel
          address={walletAddress}
          tokenSymbol={network.assetSymbol}
          chainName={network.chainName}
          nativeSymbol={network.nativeSymbol}
        />
        {watch.received !== null ? (
          <div className="border-up/30 bg-up/10 mt-4 flex items-center gap-3 rounded-[14px] border p-4">
            <span className="bg-up text-up-ink grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full">
              <CheckIcon size={15} />
            </span>
            <span>
              <span className="block text-[13.5px] font-semibold text-white">Deposit received</span>
              <span className="block text-[12.5px] font-normal text-white/65">
                {formatAmount(watch.received)} {network.assetSymbol} added to your wallet.
              </span>
            </span>
          </div>
        ) : (
          <div className="ws-inset mt-4 p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white">
                <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
                Waiting for your deposit
              </span>
              <button
                onClick={watch.checkNow}
                disabled={watch.checking}
                className="text-accent cursor-pointer text-[12.5px] font-medium hover:underline disabled:opacity-50"
              >
                {watch.checking ? "Checking" : "I've sent it, check now"}
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-[1.5] font-normal text-white/55">
              This updates on its own once the transfer lands. It usually takes under a minute.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <SheetNav
        title="Direct deposit"
        subtitle="Already hold USDC? Send it straight to your wallet. No conversion, no wait."
        onBack={onBack}
      />
      <div className="flex flex-col gap-2">
        {available.map((n) => (
          <button
            key={n.chainType}
            onClick={() => setNetwork(n)}
            className="flex w-full cursor-pointer items-center gap-3.5 rounded-[16px] border border-white/8 bg-white/4 px-4 py-3.5 text-left transition-colors hover:bg-white/8"
          >
            <NetworkIcon network={n.networkKey} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[15px] font-semibold text-white">
                {n.chainName}
              </span>
              <span className="block text-[12.5px] font-normal text-white/55">
                Receive {n.assetSymbol} on {n.chainName}
              </span>
            </span>
            <span className="text-white/35">
              <ArrowRightIcon size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
