"use client";

import { useMemo } from "react";
import type { DepositChain } from "@/lib/deposit";

interface NetworkListProps {
  chains: DepositChain[];
  selected: DepositChain | null;
  onSelect: (chain: DepositChain) => void;
  loading: boolean;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * All deposit networks listed alphabetically with section headers and A-Z scrubber.
 * Matches the Figma deposit screen layout.
 */
export function NetworkList({ chains, selected, onSelect, loading }: NetworkListProps) {
  const groups = useMemo(() => {
    const map = new Map<string, DepositChain[]>();
    for (const c of chains) {
      const letter = c.name.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, items] of sorted) {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [chains]);

  const activeLetters = useMemo(() => new Set(groups.map(([letter]) => letter)), [groups]);

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`network-section-${letter}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[13px] font-normal text-white/40">
        Loading networks…
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] font-normal text-white/40">
        No networks available
      </div>
    );
  }

  return (
    <div className="relative flex">
      {/* Network list with alphabet headers */}
      <div className="min-w-0 flex-1">
        {groups.map(([letter, items]) => (
          <div key={letter} id={`network-section-${letter}`}>
            {/* Section header */}
            <div className="flex h-[30px] items-center bg-[#242424] px-4 pt-[5px]">
              <span className="text-[11px] font-normal text-[#838383] capitalize">
                {letter.toLowerCase()}
              </span>
            </div>

            {/* Network rows */}
            {items.map((chain) => {
              const on = selected?.chainId === chain.chainId;
              return (
                <button
                  key={chain.chainId}
                  onClick={() => onSelect(chain)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    on ? "bg-white/8" : "hover:bg-white/[0.04]"
                  }`}
                >
                  {chain.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chain.logoUrl}
                      alt=""
                      className="size-[23px] shrink-0 rounded-[8px]"
                    />
                  ) : (
                    <span className="flex size-[23px] shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-[10px] font-bold text-white/60">
                      {chain.name.charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-[16px] font-medium text-white">
                      {chain.name}
                    </span>
                    <span className="block truncate text-[11px] leading-[14px] font-normal text-white/50">
                      {chain.nativeSymbol || chain.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* A-Z scrubber */}
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
