"use client";

import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";

interface GameBalanceCardProps {
  /** The game balance in dollars: the wallet's ETH on Base. */
  balanceUsd: number;
  /** Withdraw is only offered when there is something to withdraw. */
  canWithdraw: boolean;
  /** Add money can be hidden where a bigger button beside it already says it. */
  showAddMoney?: boolean;
  onWithdraw: () => void;
  onAddMoney: () => void;
}

// The game's wallet strip: what you have to play with, a way in and a way out.
//
// The game runs on the wallet's ETH on Base, which players do not know and do
// not need to. Add money turns their USDC into that ETH; Withdraw cashes it
// back out (the portfolio's sell flow, ETH on Base to USDC). Shown on the game
// page and in the lobby, so a player with only USDC can fund before they open
// a game rather than finding out at the stake sheet that they cannot.
export function GameBalanceCard({
  balanceUsd,
  canWithdraw,
  showAddMoney = true,
  onWithdraw,
  onAddMoney,
}: GameBalanceCardProps) {
  const t = useTranslations("casino.lastStanding");
  const money = useMoney();
  const { mask } = useBalanceVisibility();

  return (
    <div className="ws-inset flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
          {t("yourBalance")}
        </div>
        <div className="tnum mt-0.5 text-[16px] font-bold text-white/90">
          {mask(money.format(balanceUsd))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canWithdraw ? (
          <button
            type="button"
            onClick={onWithdraw}
            className="shrink-0 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap text-white/85 transition-colors hover:bg-white/12"
          >
            {t("withdraw")}
          </button>
        ) : null}
        {showAddMoney ? (
          <button
            type="button"
            onClick={onAddMoney}
            className="border-accent/40 bg-accent/14 text-accent hover:bg-accent/22 shrink-0 cursor-pointer rounded-xl border px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap transition-colors"
          >
            {t("addMoney")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
