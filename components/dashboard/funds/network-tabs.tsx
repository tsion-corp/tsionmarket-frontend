"use client";

import { useMemo, useState } from "react";
import { CoinBadge } from "@/components/ui/coin-badge";
import { SearchIcon } from "@/components/ui/icons";
import { isSupportedOrigin, orderChains } from "@/lib/deposit-catalog";
import type { DepositChain } from "@/lib/deposit";

interface NetworkTabsProps {
  chains: DepositChain[];
  // Chain ids that actually have a static-address-eligible token, from
  // Dextopus's solver-curated catalog. A chain missing from this set is
  // hidden even if /deposit/chains lists it, so no pick dead-ends into an
  // empty token list.
  eligibleChainIds: Set<number>;
  // Deposits need a refundable origin wallet, so that picker also restricts
  // to families we hold a wallet for (isSupportedOrigin). A destination has
  // no such requirement — any chain Dextopus can route to is fair game — so
  // callers picking a withdrawal target pass false to skip that filter.
  filterOrigin?: boolean;
  selectedId: number | null;
  onSelect: (chain: DepositChain) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

function ChainGlyph({ chain, size = 20 }: { chain: DepositChain; size?: number }) {
  if (chain.logoUrl) {
    return (
      // Dextopus serves logos from varied hosts; next/image would reject them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={chain.logoUrl}
        alt={chain.name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-md bg-white/6 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <CoinBadge sym={chain.name.slice(0, 2).toUpperCase()} bg="#26262b" size={size} />;
}

// Origin-network picker: a searchable chip cloud of every Dextopus origin we can
// offer (and refund), popular networks first. No dropdown — the whole supported
// set is one tap away.
export function NetworkTabs({
  chains,
  eligibleChainIds,
  filterOrigin = true,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
}: NetworkTabsProps) {
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const supported = orderChains(
      chains.filter(
        (c) => (!filterOrigin || isSupportedOrigin(c.chainId)) && eligibleChainIds.has(c.chainId)
      )
    );
    const q = query.trim().toLowerCase();
    return q ? supported.filter((c) => c.name.toLowerCase().includes(q)) : supported;
  }, [chains, eligibleChainIds, filterOrigin, query]);

  return (
    <div>
      <div className="ws-inset flex items-center gap-2.5 px-3.5 py-2.5">
        <SearchIcon size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search networks"
          className="w-full border-none bg-transparent text-[14px] text-white outline-none"
        />
      </div>

      {loading ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          Loading networks
        </div>
      ) : error ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          Couldn&apos;t load networks.{" "}
          <button onClick={onRetry} className="text-accent cursor-pointer">
            Retry
          </button>
        </div>
      ) : list.length === 0 ? (
        <div className="py-6 text-center text-[13px] font-normal text-white/50">
          No networks match your search.
        </div>
      ) : (
        <div className="mt-2 flex max-h-[190px] flex-wrap gap-2 overflow-y-auto pr-0.5">
          {list.map((c) => {
            const on = c.chainId === selectedId;
            return (
              <button
                key={c.chainId}
                onClick={() => onSelect(c)}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-left transition-colors ${
                  on
                    ? "border-accent/45 bg-accent/12 text-white"
                    : "border-white/10 bg-white/4 text-white/80 hover:bg-white/8"
                }`}
              >
                <ChainGlyph chain={c} />
                <span className="font-sans text-[13px] font-medium whitespace-nowrap">
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
