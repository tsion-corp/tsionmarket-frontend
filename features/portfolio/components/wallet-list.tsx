"use client";

import type { User } from "@privy-io/react-auth";
import { Avatar } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { truncateAddress } from "@/lib/format";
import { getWalletAddress } from "@/lib/user";

// The profile hands out the user's own embedded EVM address. It comes off the
// Privy user object, so there is nothing to fetch and nothing to mint.
//
// The Solana address is deliberately not listed. Privy still provisions it and
// the app still uses it (Solana settlement, RWA trades), it is just not
// something we ask the user to look at or copy. Kept as a list so putting it
// back is one line.
const WALLETS = [{ chainType: "ethereum", label: "EVM" }] as const;

interface AddressRowProps {
  label: string;
  address: string;
}

function AddressRow({ label, address }: AddressRowProps) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5"
      data-sensitive="address"
    >
      <Avatar seed={address} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[13px] font-medium text-white">{label}</span>
        <span className="tnum block truncate text-xs font-normal text-white/50">
          {truncateAddress(address)}
        </span>
      </span>
      <CopyButton value={address} />
    </div>
  );
}

interface WalletListProps {
  user: User | null;
}

export function WalletList({ user }: WalletListProps) {
  // A family whose wallet Privy has not provisioned yet is dropped rather than
  // shown empty, which is what the "being set up" case below covers.
  const wallets = WALLETS.flatMap((w) => {
    const address = getWalletAddress(user, w.chainType);
    return address ? [{ ...w, address }] : [];
  });

  return (
    <div className="mt-[18px]">
      <div className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
        Your wallet address
      </div>
      {wallets.length === 0 ? (
        <div className="mt-2 text-[13px] font-normal text-white/50">
          Your wallet is being set up.
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {wallets.map((w) => (
            <AddressRow key={w.chainType} label={w.label} address={w.address} />
          ))}
        </div>
      )}
    </div>
  );
}
