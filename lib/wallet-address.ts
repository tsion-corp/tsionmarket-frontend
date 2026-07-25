// Best-effort detection of which chain family a pasted wallet address belongs
// to, purely from its string format. EVM chains all share one address shape,
// so this narrows to a family (e.g. "evm"), never a specific chain — the user
// still has to pick which EVM network they mean.
//
// Base58 alphabets overlap across chains (Tron, XRP, Bitcoin, and Solana can
// all look like "some base58 string"), so order matters: check the formats
// with a distinguishing prefix first, and fall back to Solana's generic
// 32-44 char base58 pattern last.

import type { AddressKind } from "@/lib/deposit";

const EVM = /^0x[0-9a-fA-F]{40}$/;
const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const XRP = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const TON = /^(EQ|UQ)[A-Za-z0-9_-]{46}$/;
const BITCOIN_LEGACY = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
const BITCOIN_BECH32 = /^bc1[a-z0-9]{25,59}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function detectAddressKind(raw: string): AddressKind | null {
  const address = raw.trim();
  if (!address) return null;
  if (EVM.test(address)) return "evm";
  if (TRON.test(address)) return "tron";
  if (XRP.test(address)) return "xrp";
  if (TON.test(address)) return "ton";
  if (BITCOIN_LEGACY.test(address) || BITCOIN_BECH32.test(address)) return "bitcoin";
  if (SOLANA.test(address)) return "solana";
  return null;
}
