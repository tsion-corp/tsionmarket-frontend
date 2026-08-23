"use client";

import { useTranslations } from "next-intl";
import type { TokenBalance } from "@/hooks/use-portfolio";

// Message keys in the portfolio catalog; the kind ids themselves never change.
const KIND_LABEL_KEY: Record<TokenBalance["kind"], string> = {
  coin: "kindCoin",
  stablecoin: "kindStablecoin",
  rwa: "kindRwa",
  token: "kindToken",
};

const KIND_STYLE: Record<TokenBalance["kind"], string> = {
  coin: "border-[#7C9CE7]/30 bg-[#7C9CE7]/12 text-[#9DB4F0]",
  stablecoin: "border-[#7CE7B0]/30 bg-[#7CE7B0]/12 text-[#7CE7B0]",
  rwa: "border-accent/35 bg-accent/12 text-accent",
  token: "border-white/12 bg-white/6 text-white/70",
};

// The asset-type pill shown beside a holding.
export function TypeChip({ kind }: { kind: TokenBalance["kind"] }) {
  const t = useTranslations("portfolio");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[kind]}`}
    >
      {t(KIND_LABEL_KEY[kind])}
    </span>
  );
}
