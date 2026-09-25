"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/copy-button";
import { NetworkIcon } from "@/components/ui/network-icon";
import { useAuthSession } from "@/hooks/use-auth-session";
import { truncateAddress } from "@/lib/format";

/**
 * The addresses this account holds money at, in the account screens.
 *
 * Back after being taken out of the chrome in September: the objection then
 * was an address printed on EVERY page, in the sidebar and the header, whether
 * or not the reader wanted it there. This is not that. It sits behind the
 * account button, one tap away, for the person who came to find out where
 * their money is — which, on a product whose whole subject is money, is a
 * question the account screen has to answer.
 *
 * Both chains are listed, because a wallet the reader cannot see is a wallet
 * they will not use. Read off the Decane session: there is no user object
 * to resolve, the addresses are on the session itself.
 */
const CHAINS = [
  { key: "evm", network: "Base", label: "Base" },
  { key: "solana", network: "Solana", label: "Solana" },
] as const;

export function WalletAddresses({ className }: { className?: string }) {
  const t = useTranslations("account");
  const { evmAddress, solanaAddress } = useAuthSession();

  const wallets = CHAINS.map((entry) => ({
    ...entry,
    address: entry.key === "evm" ? evmAddress : solanaAddress,
  })).filter((entry): entry is (typeof CHAINS)[number] & { address: string } =>
    Boolean(entry.address)
  );

  // No wallet yet: say nothing rather than draw an empty shelf.
  if (wallets.length === 0) return null;

  return (
    <div className={className} data-sensitive="address">
      <div className="mb-2 text-[12.5px] font-medium text-white/45">{t("wallets")}</div>
      <div className="flex flex-col gap-1.5">
        {wallets.map((wallet) => (
          <div
            key={wallet.key}
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
