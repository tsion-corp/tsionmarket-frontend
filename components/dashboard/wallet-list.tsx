"use client";

import type { User } from "@privy-io/react-auth";
import { Avatar } from "@/components/dashboard/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { useStableStaticAddress } from "@/hooks/use-deposit";
import { profileAddressSpec, type ProfileAddressSpec } from "@/lib/deposit";
import { truncateAddress } from "@/lib/format";
import { getWalletAddress } from "@/lib/user";

// The addresses the profile hands out are Dextopus static deposit addresses,
// not the embedded wallets themselves. Anything sent to one is converted and
// settled into the user's own wallet, so a deposit from a chain the dashboard
// does not index still lands somewhere the app can see.
//
// The trade-off this makes, and why every row names its token: a static address
// watches for ONE asset on ONE chain. USDC and SOL on Solana mint different
// addresses, so a token the address was not minted for is not detected and does
// not settle. The label is the guard-rail.

interface AddressRowProps {
  spec: ProfileAddressSpec | null;
}

function AddressRow({ spec }: AddressRowProps) {
  const query = useStableStaticAddress(spec?.request ?? null);

  if (!spec) return null;

  const address = query.data?.depositAddress ?? null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
      <Avatar seed={address ?? spec.settlementAddress} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-[13px] font-medium text-white">
          USDC <span className="font-normal text-white/45">on {spec.label}</span>
        </span>
        {address ? (
          <span className="tnum block truncate text-xs font-normal text-white/50">
            {truncateAddress(address)}
          </span>
        ) : query.isError ? (
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="block text-xs font-normal text-white/50 underline underline-offset-2"
          >
            Couldn&apos;t load — retry
          </button>
        ) : (
          <span className="block h-3.5 w-32 animate-pulse rounded bg-white/10" />
        )}
      </span>
      {address ? <CopyButton value={address} /> : null}
    </div>
  );
}

interface WalletListProps {
  user: User | null;
}

export function WalletList({ user }: WalletListProps) {
  const userId = user?.id ?? null;
  const evm = userId
    ? profileAddressSpec(userId, "ethereum", getWalletAddress(user, "ethereum"))
    : null;
  const solana = userId
    ? profileAddressSpec(userId, "solana", getWalletAddress(user, "solana"))
    : null;

  return (
    <div className="mt-[18px]">
      <div className="text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
        Your deposit addresses
      </div>
      {!evm && !solana ? (
        <div className="mt-2 text-[13px] font-normal text-white/50">
          Your addresses are being set up.
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-col gap-1.5">
            <AddressRow spec={evm} />
            <AddressRow spec={solana} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed font-normal text-white/40">
            Send only USDC on the chain shown. Another token sent to these addresses will not
            arrive.
          </p>
        </>
      )}
    </div>
  );
}
