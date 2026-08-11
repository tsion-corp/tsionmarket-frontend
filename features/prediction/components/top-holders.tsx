"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Blockies from "react-blockies";
import { useTopHolders } from "@/features/prediction/hooks/use-prediction-detail";
import { compactUsd, shortAddress } from "@/features/prediction/lib/format";
import type { Side } from "@/features/prediction/lib/types";

// Top holders leaderboard for a market — the largest YES and NO positions, like
// Polymarket's "Top holders" tab. Two side-selectable lists over the indexed
// Position read-model (accurate after the redeem-reconciliation fix). shares are
// 6-dec; we show them as compact USDC-equivalent notional.

interface TopHoldersProps {
  marketId: string;
}

export function TopHolders({ marketId }: TopHoldersProps) {
  const t = useTranslations("prediction");
  const [side, setSide] = useState<Side>("yes");
  const { data: holders, isLoading } = useTopHolders(marketId, side, 20);

  return (
    <div className="ws-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="ws-display text-[15px]">{t("topHolders")}</span>
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
          <SideTab active={side === "yes"} onClick={() => setSide("yes")} tone="up">
            {t("yesHolders")}
          </SideTab>
          <SideTab active={side === "no"} onClick={() => setSide("no")} tone="down">
            {t("noHolders")}
          </SideTab>
        </div>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">{t("loading")}</p>
      ) : !holders || holders.length === 0 ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">
          {t("noHolders_empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {holders.map((h, i) => (
            <li
              key={`${h.holder}-${h.marketId}`}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
            >
              <span className="w-5 shrink-0 text-right text-[12px] font-medium text-white/40 tabular-nums">
                {i + 1}
              </span>
              <span className="overflow-hidden rounded-full">
                <Blockies seed={h.holder.toLowerCase()} size={8} scale={3} />
              </span>
              <span className="flex-1 truncate font-mono text-[12.5px] text-white/80">
                {shortAddress(h.holder)}
              </span>
              <span
                className={`text-[13px] font-semibold tabular-nums ${
                  side === "yes" ? "text-up" : "text-down"
                }`}
              >
                {compactUsd(h.shares)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SideTab({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "up" | "down";
  children: React.ReactNode;
}) {
  const toneCls = tone === "up" ? "text-up" : "text-down";
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? `bg-white/10 ${toneCls}` : "text-white/45 hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}
