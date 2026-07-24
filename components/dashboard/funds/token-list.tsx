"use client";

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SearchIcon } from "@/components/ui/icons";
import type { DepositToken } from "@/lib/deposit";

interface TokenListProps {
  tokens: DepositToken[];
  selectedAddress: string | null;
  onSelect: (token: DepositToken) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

// Token picker for the chosen origin network. A flat, searchable list — no
// dropdown — so the token is one tap from the network selection.
export function TokenList({
  tokens,
  selectedAddress,
  onSelect,
  loading,
  error,
  onRetry,
}: TokenListProps) {
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
    <div>
      <div className="ws-inset flex items-center gap-2.5 px-3.5 py-2.5">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens"
          className="w-full border-none bg-transparent text-[14px] text-white outline-none"
        />
      </div>

      {loading ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">Loading tokens</div>
      ) : error ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          Couldn&apos;t load tokens.{" "}
          <button onClick={onRetry} className="text-accent cursor-pointer">
            Retry
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          No tokens match your search.
        </div>
      ) : (
        <div className="mt-2 flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-0.5">
          {list.map((t) => {
            const on = t.address === selectedAddress;
            return (
              <button
                key={t.address}
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
