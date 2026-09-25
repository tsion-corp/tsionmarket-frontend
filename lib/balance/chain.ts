import type { HexChainId } from "@/lib/balance/types";

// The balance endpoint names chains in hexadecimal ("0x2105"); every other
// chain id in this app is a plain number (lib/meme/chain.ts's BASE_CHAIN_ID is
// 8453, lib/trade/networks.ts's ids likewise). The two forms are converted
// here, in one place, so no caller ever writes the parse by hand and no
// `"0x2105" === 8453` comparison can quietly be false forever.

const HEX_CHAIN_ID = /^0x[0-9a-f]+$/iu;

/** Whether `value` is a 0x-prefixed hex chain id. The parser's gate. */
export function isHexChainId(value: unknown): value is HexChainId {
  return typeof value === "string" && HEX_CHAIN_ID.test(value);
}

/**
 * The numeric chain id for a hex one — 8453 for "0x2105" — or null when the
 * string is not one, or names a chain id too large to be an exact number.
 *
 * A chain id is an identifier, not money: it is counted in tens of thousands,
 * it is never added to anything, and every other chain table in the app is
 * keyed by number. So this is the one figure on this path that is allowed to
 * become a number, and only after Number.isSafeInteger has agreed.
 */
export function chainIdOf(hex: string): number | null {
  if (!isHexChainId(hex)) return null;
  const id = Number.parseInt(hex.slice(2), 16);
  return Number.isSafeInteger(id) ? id : null;
}
