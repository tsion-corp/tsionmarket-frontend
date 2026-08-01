"use client";

import { useState } from "react";
import { GradientCoin } from "@/components/ui/gradient-coin";
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
import TokenAPT from "@web3icons/react/icons/tokens/TokenAPT";
import TokenARKM from "@web3icons/react/icons/tokens/TokenARKM";
import TokenDOGE from "@web3icons/react/icons/tokens/TokenDOGE";
import TokenFET from "@web3icons/react/icons/tokens/TokenFET";
import TokenINJ from "@web3icons/react/icons/tokens/TokenINJ";
import TokenJUP from "@web3icons/react/icons/tokens/TokenJUP";
import TokenLDO from "@web3icons/react/icons/tokens/TokenLDO";
import TokenLIT from "@web3icons/react/icons/tokens/TokenLIT";
import TokenNEAR from "@web3icons/react/icons/tokens/TokenNEAR";
import TokenORDI from "@web3icons/react/icons/tokens/TokenORDI";
import TokenPENDLE from "@web3icons/react/icons/tokens/TokenPENDLE";
import TokenPEPE from "@web3icons/react/icons/tokens/TokenPEPE";
import TokenPOPCAT from "@web3icons/react/icons/tokens/TokenPOPCAT";
import TokenSEI from "@web3icons/react/icons/tokens/TokenSEI";
import TokenSHIB from "@web3icons/react/icons/tokens/TokenSHIB";
import TokenSTX from "@web3icons/react/icons/tokens/TokenSTX";
import TokenSUI from "@web3icons/react/icons/tokens/TokenSUI";
import TokenTAO from "@web3icons/react/icons/tokens/TokenTAO";
import TokenTIA from "@web3icons/react/icons/tokens/TokenTIA";
import TokenXMR from "@web3icons/react/icons/tokens/TokenXMR";
import TokenXRP from "@web3icons/react/icons/tokens/TokenXRP";
import TokenZEC from "@web3icons/react/icons/tokens/TokenZEC";
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
  APT: TokenAPT,
  ARKM: TokenARKM,
  DOGE: TokenDOGE,
  FET: TokenFET,
  INJ: TokenINJ,
  JUP: TokenJUP,
  LDO: TokenLDO,
  LIT: TokenLIT,
  NEAR: TokenNEAR,
  ORDI: TokenORDI,
  PENDLE: TokenPENDLE,
  PEPE: TokenPEPE,
  POPCAT: TokenPOPCAT,
  SEI: TokenSEI,
  SHIB: TokenSHIB,
  STX: TokenSTX,
  SUI: TokenSUI,
  TAO: TokenTAO,
  TIA: TokenTIA,
  XMR: TokenXMR,
  XRP: TokenXRP,
  ZEC: TokenZEC,
};

// Whether a real token icon exists for this symbol, so callers can pick their
// own fallback (the perps section uses gradient coins instead of text badges).
export function hasTokenIcon(sym: string): boolean {
  return CRYPTO_ICONS[sym] != null || CRYPTO_ICONS[sym.toUpperCase()] != null;
}

interface AssetIconProps {
  sym: string;
  bg: string;
  size?: number;
  logo?: string | null;
  // What to render when there is no built-in icon and no working logo image:
  // the lettered badge (default), or the perps-style identicon gradient. The
  // gradient never collides with labels at chip sizes, so dense surfaces like
  // the spot terminal opt into it.
  fallback?: "badge" | "gradient";
}

// Icons whose set ships no "background" variant; requesting it logs a warning
// on every render and draws nothing.
const MONO_ONLY = new Set(["ARKM"]);

export function AssetIcon({ sym, bg, size = 36, logo, fallback = "badge" }: AssetIconProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = CRYPTO_ICONS[sym] ?? CRYPTO_ICONS[sym.toUpperCase()];
  const round = size > 24 ? 11 : 999;

  if (Icon) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden"
        style={{ width: size, height: size, borderRadius: round }}
      >
        <Icon variant={MONO_ONLY.has(sym.toUpperCase()) ? "mono" : "background"} size={size} />
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

  if (fallback === "gradient") return <GradientCoin sym={sym} size={size} />;
  return <CoinBadge sym={sym} bg={bg} size={size} />;
}
