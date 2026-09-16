"use client";

import { useVaultParams } from "@/features/casino/hooks/use-vault-params";
import { DEFAULT_ENTRY_USD, unitsToUsd } from "@/features/casino/lib/last-standing/stake";

// The one answer to "what does opening a game cost right now", shared by the
// lobby button and the start sheet so they can never disagree.
//
// The game is played in USDC, so this is dollars all the way down: no price
// read, no conversion, nothing to go stale between the quote and the send. The
// contract's floor for that asset comes from the shared params read (a stake
// under it reverts), and `usd` stays null until it is known — `floorFailed` is
// kept apart from "not loaded yet" so a failed read never masquerades as a
// zero floor.
export function useDefaultEntry(): {
  usd: number | null;
  floorUnits: bigint | null;
  floorFailed: boolean;
} {
  const { floorUnits, floorFailed } = useVaultParams();
  return {
    // Our preferred entry, or the contract's floor when that is higher. The
    // floor is 0.1 USDC today, so the button offers 0.38 — a product figure,
    // not a contract one. Raise the floor past it on-chain and the button
    // follows on its own; lower it and this holds.
    usd: floorUnits === null ? null : Math.max(DEFAULT_ENTRY_USD, unitsToUsd(floorUnits)),
    floorUnits,
    floorFailed,
  };
}
