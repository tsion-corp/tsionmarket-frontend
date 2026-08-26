"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SearchIcon } from "@/components/ui/icons";
import type { DepositToken } from "@/lib/deposit";

interface TokenListProps {
  tokens: DepositToken[];
  selected: DepositToken | null;
  onSelect: (token: DepositToken) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

// A token's identity is its (chain, address) pair, not the address alone:
// native gas tokens across chains all share 0x000…000, so keying by address
// would collide (duplicate React keys, and every native row highlighting at
// once).
function tokenKey(t: { chainId: number; address: string }): string {
  return `${t.chainId}:${t.address.toLowerCase()}`;
}

// Token picker for the chosen origin network. A flat, searchable list — no
// dropdown — so the token is one tap from the network selection.
export function TokenList({ tokens, selected, onSelect, loading, error, onRetry }: TokenListProps) {
  const t = useTranslations("fundsFlow");
  const selectedKey = selected ? tokenKey(selected) : null;
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    // Only tokens that can mint a permanent deposit address are selectable;
    // anything else would fail at generation.
    const eligible = tokens.filter((t) => t.supportsStaticAddress);
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [tokens, query]);

  return (
    <div data-sensitive="balance">
      <div className="ws-inset flex items-center gap-2.5 px-3.5 py-2.5">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchTokens")}
          className="w-full border-none bg-transparent text-[14px] text-white outline-none"
        />
      </div>

      {loading ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          {t("loadingTokens")}
        </div>
      ) : error ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          {t("loadTokensError")}{" "}
          <button onClick={onRetry} className="text-accent cursor-pointer">
            {t("retry")}
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          {t("noTokensMatch")}
        </div>
      ) : (
        <div className="ws-no-scrollbar mt-2 flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-0.5">
          {list.map((t) => {
            const on = tokenKey(t) === selectedKey;
            return (
              <button
                key={tokenKey(t)}
                onClick={() => onSelect(t)}
                className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-2.5 py-2 text-left transition-colors ${
                  on ? "border-accent/40 bg-accent/10" : "border-transparent hover:bg-white/6"
                }`}
              >
                <AssetIcon sym={t.symbol} bg="#26262b" size={30} logo={t.logoUrl} />
                <span className="min-w-0">
                  <span className="block truncate font-sans text-[14px] font-medium text-white">
                    {t.symbol}
                  </span>
                  <span className="block truncate text-[12px] font-normal text-white/50">
                    {t.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
