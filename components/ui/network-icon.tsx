"use client";

import NetworkBase from "@web3icons/react/icons/networks/NetworkBase";
import NetworkSolana from "@web3icons/react/icons/networks/NetworkSolana";
import NetworkArbitrumOne from "@web3icons/react/icons/networks/NetworkArbitrumOne";
import NetworkPolygon from "@web3icons/react/icons/networks/NetworkPolygon";
import NetworkBitcoin from "@web3icons/react/icons/networks/NetworkBitcoin";
import type { IconComponent } from "@web3icons/react";
import { CoinBadge } from "@/components/ui/coin-badge";

const NETWORK_ICONS: Record<string, IconComponent> = {
  "base-mainnet": NetworkBase,
  Base: NetworkBase,
  "solana-mainnet": NetworkSolana,
  Solana: NetworkSolana,
  "arb-mainnet": NetworkArbitrumOne,
  Arbitrum: NetworkArbitrumOne,
  "polygon-mainnet": NetworkPolygon,
  Polygon: NetworkPolygon,
  // Display-only: cbBTC actually settles on Base (see displayNetworkLabel in
  // portfolio-view.tsx), this key is never a real TokenBalance.network value.
  Bitcoin: NetworkBitcoin,
};

interface NetworkIconProps {
  network: string;
  size?: number;
}

export function NetworkIcon({ network, size = 36 }: NetworkIconProps) {
  const Icon = NETWORK_ICONS[network];
  if (!Icon) return <CoinBadge sym={network.slice(0, 2).toUpperCase()} bg="#26262b" size={size} />;
  const round = size > 24 ? 11 : 999;
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: round }}
    >
      <Icon variant="background" size={size} />
    </span>
  );
}
