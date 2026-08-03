"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { subscriptZeros } from "@/lib/format";
import { tokenBg } from "@/lib/trade/assets";
import type { MemeToken, TokenRiskLevel } from "@/lib/meme/api";

const RISK_STYLE: Record<TokenRiskLevel, string> = {
  LOW: "bg-up/14 text-up border-up/30",
  MEDIUM: "bg-white/8 text-white/70 border-white/15",
  HIGH: "bg-down/12 text-down border-down/30",
  CRITICAL: "bg-down/20 text-down border-down/45",
  UNKNOWN: "bg-white/6 text-white/45 border-white/12",
};

export function RiskBadge({ level }: { level: TokenRiskLevel }) {
  const t = useTranslations("meme");
  return (
    // shrink-0 keeps it inside the card when the price beside it is long, and
    // nowrap stops "LOW RISK" breaking onto a second line, which made those
    // cards taller than the rest of their row.
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] whitespace-nowrap uppercase ${RISK_STYLE[level]}`}
    >
      {t(`risk${level.charAt(0)}${level.slice(1).toLowerCase()}`)}
    </span>
  );
}

export function PctChange({ value }: { value: string | null }) {
  const n = value === null ? NaN : Number(value);
  if (!Number.isFinite(n)) return <span className="text-white/40">—</span>;
  return (
    <span className={`tnum ${n >= 0 ? "text-up" : "text-down"}`}>
      {n >= 0 ? "+" : ""}
      {n.toFixed(2)}%
    </span>
  );
}

export function MemeCoin({ token, size = 30 }: { token: MemeToken; size?: number }) {
  const sym = token.symbol ?? "?";
  return (
    <AssetIcon sym={sym} bg={tokenBg(sym)} logo={token.logoUrl} size={size} fallback="gradient" />
  );
}

export function priceLabel(priceUsd: string | null): string {
  const n = priceUsd === null ? NaN : Number(priceUsd);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  // Below a thousandth, spelling out the zeros runs to fourteen characters and
  // shoves the risk badge out of the card, so the run is counted instead.
  const compact = subscriptZeros(n);
  if (compact) return `$${compact}`;
  return `$${n.toLocaleString("en-US", { maximumSignificantDigits: 4 })}`;
}
