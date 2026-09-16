"use client";

import { useMemo } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import type { DepositToken } from "@/lib/deposit";

interface TokenListProps {
  tokens: DepositToken[];
  selected: DepositToken | null;
  onSelect: (token: DepositToken) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

function tokenKey(t: { chainId: number; address: string }): string {
  return `${t.chainId}:${t.address.toLowerCase()}`;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Token picker — Figma node 2154:63410.
 *
 * Alphabetically grouped rows with section headers and A-Z scrubber.
 * Icon: 23px rounded-[8px]. Name: 13px Medium. Ticker: 11px Regular white/50.
 */
export function TokenList({ tokens, selected, onSelect, loading, error, onRetry }: TokenListProps) {
  const selectedKey = selected ? tokenKey(selected) : null;

  // Only tokens that can mint a permanent deposit address.
  const eligible = useMemo(() => tokens.filter((t) => t.supportsStaticAddress), [tokens]);

  // Group by first letter of symbol.
  const groups = useMemo(() => {
    const map = new Map<string, DepositToken[]>();
    for (const t of eligible) {
      const letter = t.symbol.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(t);
    }
    // Sort keys alphabetically and tokens within each group.
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, items] of sorted) {
      items.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }
    return sorted;
  }, [eligible]);

  // Letters that have tokens — for the scrubber highlight.
  const activeLetters = useMemo(() => new Set(groups.map(([letter]) => letter)), [groups]);

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`token-section-${letter}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[13px] font-normal text-white/40">Loading tokens…</div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-[13px] font-normal text-white/40">
        Couldn&apos;t load tokens.{" "}
        <button onClick={onRetry} className="text-accent cursor-pointer underline">
          Try again
        </button>
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] font-normal text-white/40">
        No tokens available
      </div>
    );
  }

  return (
    <div className="relative flex" data-sensitive="balance">
      {/* Token list with alphabet headers */}
      <div className="min-w-0 flex-1">
        {groups.map(([letter, items]) => (
          <div key={letter} id={`token-section-${letter}`}>
            {/* Section header — Figma: h-[30px], bg-[#242424], letter at 9.5px */}
            <div className="flex h-[30px] items-center bg-[#242424] px-4 pt-[5px]">
              <span className="text-[11px] font-normal text-[#838383] capitalize">
                {letter.toLowerCase()}
              </span>
            </div>

            {/* Token rows */}
            {items.map((tk) => {
              const on = tokenKey(tk) === selectedKey;
              return (
                <button
                  key={tokenKey(tk)}
                  onClick={() => onSelect(tk)}
                  className={`flex w-full cursor-pointer items-center gap-[9px] px-4 py-3 text-left transition-colors ${
                    on ? "bg-white/8" : "hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Icon: 23px, rounded-[8px] */}
                  <AssetIcon sym={tk.symbol} bg="#26262b" size={23} logo={tk.logoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-[16px] font-medium text-white">
                      {tk.symbol}
                    </span>
                    <span className="block truncate text-[11px] leading-[14px] font-normal text-white/50">
                      {tk.symbol}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* A-Z scrubber — Figma: right edge, 9.5px text, white/39 */}
      <div className="sticky top-0 flex h-fit shrink-0 flex-col items-center py-2 pr-1 pl-2">
        {ALPHABET.map((letter) => (
          <button
            key={letter}
            onClick={() => scrollToLetter(letter)}
            disabled={!activeLetters.has(letter)}
            className={`text-[9px] leading-[14px] font-normal transition-colors ${
              activeLetters.has(letter) ? "text-white/40 hover:text-white" : "text-white/15"
            }`}
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
}
