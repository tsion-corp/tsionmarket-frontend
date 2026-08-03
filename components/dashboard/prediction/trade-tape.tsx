"use client";

import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { priceToCents, sideLabel, toNumber } from "@/lib/prediction/format";
import type { Trade } from "@/lib/prediction/types";

interface TradeTapeProps {
  trades: Trade[];
}

function shortAddress(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// The recent-trades feed (Intelligence): each buy/sell with its side, USDC size,
// resulting YES price, and trader. Live WS trades sit on top of the REST tape.
export function TradeTape({ trades }: TradeTapeProps) {
  const t = useTranslations("prediction");
  const money = useMoney();

  if (trades.length === 0) {
    return (
      <div className="ws-card px-5 py-8 text-center text-[13px] font-normal text-white/45">
        {t("noTrades")}
      </div>
    );
  }

  return (
    <div className="ws-card overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <span className="ws-display text-[16px]">{t("tradeTape")}</span>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {trades.map((tr, i) => (
          <div
            key={`${tr.txHash}-${i}`}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-white/6 px-5 py-2.5 text-[13px]"
          >
            <span
              className="font-medium"
              style={{ color: tr.side === "yes" ? "#7CE7B0" : "#F6A5A5" }}
            >
              {tr.buy ? t("buyTag") : t("sellTag")} {sideLabel(tr.side)}
            </span>
            <span className="tnum text-white/55">{money.format(toNumber(tr.usdcAmount))}</span>
            <span className="tnum text-right text-white/45">
              {priceToCents(tr.priceYes)} · {shortAddress(tr.trader)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
