"use client";

import { useState } from "react";
import TokenBTC from "@web3icons/react/icons/tokens/TokenBTC";
import TokenETH from "@web3icons/react/icons/tokens/TokenETH";
import TokenSOL from "@web3icons/react/icons/tokens/TokenSOL";
import TokenBNB from "@web3icons/react/icons/tokens/TokenBNB";
import TokenUSDC from "@web3icons/react/icons/tokens/TokenUSDC";
import TokenUSDT from "@web3icons/react/icons/tokens/TokenUSDT";
import TokenWBTC from "@web3icons/react/icons/tokens/TokenWBTC";
import TokenDAI from "@web3icons/react/icons/tokens/TokenDAI";
import TokenPYUSD from "@web3icons/react/icons/tokens/TokenPYUSD";
import TokenUSDE from "@web3icons/react/icons/tokens/TokenUSDE";
import TokenAPE from "@web3icons/react/icons/tokens/TokenAPE";
import TokenDEGEN from "@web3icons/react/icons/tokens/TokenDEGEN";
import TokenMATIC from "@web3icons/react/icons/tokens/TokenMATIC";
import TokenPOL from "@web3icons/react/icons/tokens/TokenPOL";
import TokenARB from "@web3icons/react/icons/tokens/TokenARB";
import TokenOP from "@web3icons/react/icons/tokens/TokenOP";
import TokenAVAX from "@web3icons/react/icons/tokens/TokenAVAX";
import TokenPLUME from "@web3icons/react/icons/tokens/TokenPLUME";
import TokenOMI from "@web3icons/react/icons/tokens/TokenOMI";
import TokenGUN from "@web3icons/react/icons/tokens/TokenGUN";
import TokenFLOW from "@web3icons/react/icons/tokens/TokenFLOW";
import TokenHYPE from "@web3icons/react/icons/tokens/TokenHYPE";
import TokenMON from "@web3icons/react/icons/tokens/TokenMON";
import TokenXPL from "@web3icons/react/icons/tokens/TokenXPL";
import TokenSIPHER from "@web3icons/react/icons/tokens/TokenSIPHER";
import TokenMUSD from "@web3icons/react/icons/tokens/TokenMUSD";
import TokenLINK from "@web3icons/react/icons/tokens/TokenLINK";
import TokenUNI from "@web3icons/react/icons/tokens/TokenUNI";
import TokenAAVE from "@web3icons/react/icons/tokens/TokenAAVE";
import type { IconComponent } from "@web3icons/react";
import { CoinBadge } from "@/components/ui/coin-badge";

const CRYPTO_ICONS: Record<string, IconComponent> = {
  SOL: TokenSOL,
  "◎": TokenSOL,
  BTC: TokenBTC,
  "₿": TokenBTC,
  ETH: TokenETH,
  WETH: TokenETH,
  BNB: TokenBNB,
  USDC: TokenUSDC,
  "USDC.E": TokenUSDC,
  $: TokenUSDC,
  USDT: TokenUSDT,
  "USD₮0": TokenUSDT,
  WBTC: TokenWBTC,
  WBTCN: TokenWBTC,
  CBBTC: TokenWBTC,
  DAI: TokenDAI,
  XDAI: TokenDAI,
  PYUSD: TokenPYUSD,
  USDE: TokenUSDE,
  APE: TokenAPE,
  DEGEN: TokenDEGEN,
  MATIC: TokenMATIC,
  POL: TokenPOL,
  ARB: TokenARB,
  OP: TokenOP,
  AVAX: TokenAVAX,
  PLUME: TokenPLUME,
  OMI: TokenOMI,
  GUN: TokenGUN,
  FLOW: TokenFLOW,
  HYPE: TokenHYPE,
  MON: TokenMON,
  XPL: TokenXPL,
  SIPHER: TokenSIPHER,
  MUSD: TokenMUSD,
  LINK: TokenLINK,
  UNI: TokenUNI,
  AAVE: TokenAAVE,
};

interface AssetIconProps {
  sym: string;
  bg: string;
  size?: number;
  logo?: string | null;
}

export function AssetIcon({ sym, bg, size = 36, logo }: AssetIconProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = CRYPTO_ICONS[sym] ?? CRYPTO_ICONS[sym.toUpperCase()];
  const round = size > 24 ? 11 : 999;

  if (Icon) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden"
        style={{ width: size, height: size, borderRadius: round }}
      >
        <Icon variant="background" size={size} />
      </span>
    );
  }

  if (logo && !imgFailed) {
    return (
      // Logo hosts vary per provider; next/image would reject unlisted hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={sym}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setImgFailed(true)}
        className="shrink-0 bg-white/6 object-cover"
        style={{ width: size, height: size, borderRadius: round }}
      />
    );
  }

  return <CoinBadge sym={sym} bg={bg} size={size} />;
}
