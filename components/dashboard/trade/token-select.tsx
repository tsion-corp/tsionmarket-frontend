"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import { TRADE_ASSETS, type TradeAsset } from "@/lib/trade/assets";

interface TokenSelectProps {
  value: TradeAsset;
  onChange: (asset: TradeAsset) => void;
  prices: Record<string, number>;
  balances: Record<string, number>;
  // Symbol to disable so the two legs of a pair can never match.
  excludeSymbol?: string;
  assets?: TradeAsset[];
}

export function TokenSelect({
  value,
  onChange,
  prices,
  balances,
  excludeSymbol,
  assets = TRADE_ASSETS,
}: TokenSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const reduce = useReducedMotion();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [assets, query]);

  const pick = (asset: TradeAsset) => {
    onChange(asset);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/7 py-2 pr-2.5 pl-2 transition-colors hover:bg-white/12"
      >
        <AssetIcon sym={value.symbol} bg={value.bg} size={24} />
        <span className="font-sans text-sm font-semibold">{value.symbol}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white/50">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-[6px] md:items-center md:pb-0"
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : { type: "spring", stiffness: 380, damping: 38, mass: 0.9 }
              }
              onClick={(e) => e.stopPropagation()}
              className="bg-sheet relative flex max-h-[80vh] w-full flex-col rounded-t-[24px] border border-white/14 pt-4 pb-2 shadow-[0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:w-[min(420px,100%)] md:rounded-[24px]"
            >
              <span
                aria-hidden
                className="mx-auto mb-3 block h-1 w-9 shrink-0 rounded-full bg-white/20 md:hidden"
              />
              <div className="flex items-center justify-between px-5 pb-3">
                <span className="ws-serif text-[19px]">Select token</span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-white/12 bg-white/6 text-white/70"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="px-5 pb-3">
                <div className="ws-inset flex items-center gap-2.5 px-3.5 py-3">
                  <SearchIcon />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or symbol"
                    className="w-full bg-transparent font-sans text-sm text-white outline-none placeholder:text-white/40"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                {filtered.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-white/45">No tokens found</div>
                ) : (
                  filtered.map((asset) => {
                    const disabled = asset.symbol === excludeSymbol;
                    const price = prices[asset.symbol] ?? 0;
                    const balance = balances[asset.symbol] ?? 0;
                    return (
                      <button
                        key={asset.symbol}
                        disabled={disabled}
                        onClick={() => pick(asset)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors ${
                          disabled
                            ? "cursor-not-allowed opacity-35"
                            : "cursor-pointer hover:bg-white/5"
                        }`}
                      >
                        <AssetIcon sym={asset.symbol} bg={asset.bg} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans text-[14.5px] font-medium">
                            {asset.symbol}
                          </span>
                          <span className="block truncate text-xs font-normal text-white/50">
                            {asset.name}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="tnum block font-sans text-[13.5px] font-medium">
                            {balance > 0 ? formatAmount(balance) : "—"}
                          </span>
                          <span className="tnum block text-xs font-normal text-white/45">
                            {price > 0 ? formatUsd(price) : "No price"}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
