import { displayNetwork } from "@/lib/buy";
import type { TokenBalance } from "@/hooks/use-portfolio";

// Chain ids as people know them. Anything not listed falls back to the raw id
// rather than hiding the network, so a new chain still reads as something.
const NETWORK_LABELS: Record<string, string> = {
  "eth-mainnet": "Ethereum",
  "base-mainnet": "Base",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

export function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? network;
}

// A holding's network as the user should read it. cbBTC settles on Base, but
// naming it Base in a holdings row reads as the wrong asset, so BTC says
// Bitcoin. The stored network id is untouched; this is display only.
export function displayNetworkLabel(token: TokenBalance): string {
  const net = displayNetwork(token.symbol, token.network);
  return net === "Bitcoin" ? net : networkLabel(net);
}

// The key the network badge picks its icon from, aliased the same way.
export function displayNetworkIconKey(token: TokenBalance): string {
  return displayNetwork(token.symbol, token.network);
}
