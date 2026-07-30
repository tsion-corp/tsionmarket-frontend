import type { DepositChain } from "@/lib/deposit";

// Common ways a user might name a chain, mapped to a token that appears in the
// Dextopus chain's `name`. Dextopus is the source of truth for which chains are
// actually offered — this only helps a spoken alias find the right row. Unknown
// aliases fall through to a direct name match, so new chains work without edits.
const ALIASES: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  mainnet: "ethereum",
  matic: "polygon",
  polygon: "polygon",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  op: "optimism",
  optimism: "optimism",
  avax: "avalanche",
  avalanche: "avalanche",
  bsc: "bnb",
  binance: "bnb",
  bnb: "bnb",
  sol: "solana",
  solana: "solana",
  base: "base",
};

function normalize(value: string): string {
  const key = value.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

// Resolves a spoken chain NAME to one of Dextopus's live deposit chains, or null
// when it matches none we offer. Matching is on the chain's `name` (contains),
// so it stays correct as Dextopus adds chains — no hardcoded chain-id table.
export function matchDepositChain(
  spoken: string,
  chains: DepositChain[] | undefined
): DepositChain | null {
  if (!chains || chains.length === 0) return null;
  const want = normalize(spoken);
  return (
    chains.find((c) => {
      const name = c.name.toLowerCase();
      return name === want || name.includes(want) || normalize(name).includes(want);
    }) ?? null
  );
}
