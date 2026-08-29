"use client";

import { useTranslations } from "next-intl";
import type { User } from "@privy-io/react-auth";
import { CopyButton } from "@/components/ui/copy-button";
import { NetworkIcon } from "@/components/ui/network-icon";
import { truncateAddress } from "@/lib/format";
import { getWalletAddress } from "@/lib/user";

/**
 * The addresses this account actually holds money at.
 *
 * They were nowhere a phone could reach them. The topbar prints the EVM one
 * truncated and un-selectable, and tapping it opens this sheet — which showed
 * a name and an email. So on a phone the answer to "where do I send funds"
 * was: read the six characters in the header, and type the rest from memory.
 * On a product whose whole subject is money, that is a missing feature rather
 * than a rough edge.
 *
 * Both chains are listed, because a wallet the reader cannot see is a wallet
 * they will not use — the Solana address had no surface at all.
 */
const CHAINS = [
  { chain: "ethereum", network: "Base", label: "Base" },
  { chain: "solana", network: "Solana", label: "Solana" },
] as const;

export function WalletAddresses({ user }: { user: User | null }) {
  const t = useTranslations("account");

  const wallets = CHAINS.map((entry) => ({
    ...entry,
    address: getWalletAddress(user, entry.chain),
  })).filter((entry): entry is (typeof CHAINS)[number] & { address: string } =>
    Boolean(entry.address)
  );

  // No embedded wallet yet: say nothing rather than draw an empty shelf.
  if (wallets.length === 0) return null;

  return (
    <div className="mt-[18px]" data-sensitive="address">
      <div className="mb-2 text-[12.5px] font-medium text-white/45">{t("wallets")}</div>
      <div className="flex flex-col gap-1.5">
        {wallets.map((wallet) => (
          <div
            key={wallet.chain}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5"
          >
            <NetworkIcon network={wallet.network} size={26} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-normal text-white/45">{wallet.label}</div>
              {/*
                `select-all` so one tap-and-hold takes the WHOLE address rather
                than a word of it — the fallback that has to work when the
                clipboard API is blocked, which is exactly the case inside the
                in-app browsers people open wallets from.

                The full string is on the element and in the label: truncation
                is for the eye, and nothing here may make the real value
                unreachable to a screen reader or a long-press.
              */}
              <div
                title={wallet.address}
                aria-label={`${wallet.label}: ${wallet.address}`}
                className="tnum block truncate text-[13.5px] font-normal text-white/85 select-all"
              >
                {truncateAddress(wallet.address)}
              </div>
            </div>
            <CopyButton value={wallet.address} />
          </div>
        ))}
      </div>
    </div>
  );
}
