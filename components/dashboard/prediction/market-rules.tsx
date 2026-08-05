"use client";

import { useTranslations } from "next-intl";
import { formatCloseDateTime, shortAddress } from "@/lib/prediction/format";
import type { Market } from "@/lib/prediction/types";

// Resolution rules + resolver panel for a market (Polymarket's rules section):
// the context blurb, the resolution rules text, the resolution source, who can
// resolve (the on-chain creator), and the close date. All off-chain metadata,
// nullable — the panel only shows the fields that were attached.

interface MarketRulesProps {
  market: Market;
}

export function MarketRules({ market }: MarketRulesProps) {
  const t = useTranslations("prediction");

  return (
    <div className="ws-card flex flex-col gap-5 p-5 sm:p-6">
      <span className="ws-display text-[15px]">{t("rulesTitle")}</span>

      {market.description ? (
        <Section title={t("rulesContext")}>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-white/75">
            {market.description}
          </p>
        </Section>
      ) : null}

      {market.rules ? (
        <Section title={t("rulesResolution")}>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-white/75">
            {market.rules}
          </p>
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Meta label={t("rulesResolver")} value={shortAddress(market.creator) || "—"} mono />
        {/* Date AND time: a market can close later today, and a bare date says
            nothing about the deadline being traded against. */}
        <Meta label={t("rulesCloses")} value={formatCloseDateTime(market.closeTime) || "—"} />
        {market.resolutionSource ? (
          <div className="sm:col-span-2">
            <Meta label={t("rulesSource")} value={market.resolutionSource} />
          </div>
        ) : null}
      </div>

      {!market.description && !market.rules && !market.resolutionSource ? (
        <p className="text-[13px] font-normal text-white/45">{t("rules_empty")}</p>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold tracking-wide text-white/40 uppercase">
        {title}
      </span>
      {children}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium tracking-wide text-white/35 uppercase">
        {label}
      </span>
      <span className={`text-[13.5px] text-white/85 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
