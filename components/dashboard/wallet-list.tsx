"use client";

import type { User, WalletWithMetadata } from "@privy-io/react-auth";
import { Avatar } from "@/components/dashboard/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { truncateAddress } from "@/lib/format";

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
};

function walletsOf(user: User | null): WalletWithMetadata[] {
  if (!user) return [];
  return user.linkedAccounts.filter(
    (account): account is WalletWithMetadata => account.type === "wallet"
  );
}

interface WalletListProps {
  user: User | null;
}

export function WalletList({ user }: WalletListProps) {
  const wallets = walletsOf(user);

  return (
    <div className="mt-[18px]">
      <div className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
        Your wallets
      </div>
      {wallets.length === 0 ? (
        <div className="mt-2 text-[13px] font-normal text-white/50">
          Your wallets are being set up.
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {wallets.map((wallet) => (
            <div
              key={wallet.address}
              className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5"
            >
              <Avatar seed={wallet.address} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[13px] font-medium text-white">
                  {CHAIN_LABELS[wallet.chainType] ?? wallet.chainType}
                </span>
                <span className="tnum block truncate text-xs font-normal text-white/50">
                  {truncateAddress(wallet.address)}
                </span>
              </span>
              <CopyButton value={wallet.address} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
