"use client";

import { useTranslations } from "next-intl";
import { useAppModals } from "@/components/layout/modals/app-modals";
import { usePortfolio } from "@/hooks/use-portfolio";
import { baseGasIsLow, baseGasUsd } from "@/lib/trade/gas-reserve";
import { formatUsd } from "@/lib/trade/math";

/**
 * Base sends are no longer gas-sponsored, so every wallet needs a little ETH
 * on Base to pay for them (lib/trade/gas-reserve.ts). This shows that balance
 * and, once it's low, a one-tap way to add more — the automatic top-up
 * (components/layout/gas-topup-host.tsx) otherwise tops it up from deposits.
 */
export function GasBalanceNotice() {
  const t = useTranslations("portfolio");
  const appModals = useAppModals();
  const portfolio = usePortfolio();

  if (portfolio.loading) return null;
  const usd = baseGasUsd(portfolio.tokens);
  const low = baseGasIsLow(portfolio.tokens);

  return (
    <div className="ws-inset mt-3 flex items-center justify-between gap-3 p-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12.5px] font-normal text-white/55">
          <span>{t("gasBalanceLabel")}</span>
          <span className="tnum text-white/85">{formatUsd(usd)}</span>
        </div>
        {low ? (
          <p className="mt-1 text-[12px] leading-[1.4] font-normal text-amber-200/80">
            {t("gasBalanceLowBody")}
          </p>
        ) : null}
      </div>
      {low ? (
        <button
          onClick={() => appModals.openDeposit({ chain: "Base", token: "ETH" })}
          className="shrink-0 cursor-pointer rounded-full border border-white/15 bg-white/5 px-3.5 py-2 font-sans text-[13px] font-medium text-white transition-opacity hover:bg-white/10"
        >
          {t("gasBalanceTopUp")}
        </button>
      ) : null}
    </div>
  );
}
