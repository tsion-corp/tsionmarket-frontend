"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import { formatAmount } from "@/lib/trade/math";
import type { TokenBalance } from "@/hooks/use-portfolio";

const NETWORK_LABEL: Record<string, string> = {
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

function netLabel(network: string): string {
  return NETWORK_LABEL[network] ?? network;
}

function TokenRow({ t }: { t: TokenBalance }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="relative shrink-0">
        <AssetIcon sym={t.symbol} bg="#26262b" size={28} logo={t.logo} />
        <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1px]">
          <NetworkIcon network={t.network} size={12} />
        </span>
      </span>
      <span className="min-w-0 text-left">
        <span className="block font-sans text-[14px] font-medium text-white">{t.symbol}</span>
        <span className="block truncate text-[11.5px] font-normal text-white/45">
          {netLabel(t.network)}
        </span>
      </span>
    </span>
  );
}

interface HeldTokenSelectProps {
  options: TokenBalance[];
  selected: TokenBalance | null;
  onSelect: (token: TokenBalance) => void;
  label?: string;
}

// Picker for the token a user wants to send/withdraw. Shows each holding with its
// network badge and balance, so any stablecoin, native, or other held asset can
// be chosen.
export function HeldTokenSelect({ options, selected, onSelect, label }: HeldTokenSelectProps) {
  const t = useTranslations("fundsFlow");
  const [open, setOpen] = useState(false);

  return (
    <div className="ws-inset p-[13px]">
      <div className="mb-2 text-xs font-normal text-white/55">{label ?? t("token")}</div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-3"
      >
        {selected ? (
          <TokenRow t={selected} />
        ) : (
          <span className="text-[14px] font-normal text-white/45">{t("selectToken")}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" className="shrink-0 text-white/40">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="mt-2 flex max-h-[240px] flex-col gap-1 overflow-y-auto border-t border-white/8 pt-2">
          {options.length === 0 ? (
            <div className="py-3 text-center text-[13px] font-normal text-white/45">
              {t("noTokensToSend")}
            </div>
          ) : (
            options.map((t) => (
              <button
                key={`${t.symbol}-${t.network}`}
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-white/6"
              >
                <TokenRow t={t} />
                <span className="tnum shrink-0 text-[12px] font-normal text-white/55">
                  {formatAmount(t.balance)}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
