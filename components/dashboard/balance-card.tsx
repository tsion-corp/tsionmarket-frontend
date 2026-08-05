"use client";

import { useTranslations } from "next-intl";
import { PortfolioDonut } from "@/components/dashboard/portfolio-donut";
import { CurrencySelect, useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePendingOnramp } from "@/hooks/use-pouch-onramp";
import { useInvalidateOnBlock } from "@/hooks/use-base-block";
import { readyToSpendUsd } from "@/lib/portfolio-breakdown";

// Refresh the portfolio each new Base block, so a deposit, withdrawal or add-money
// shows in the balance within ~2s instead of on the slow poll.
const PORTFOLIO_KEY = [["portfolio"]] as const;

interface BalanceCardProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
}

export function BalanceCard({ onOpenFunds, onOpenWithdraw }: BalanceCardProps) {
  const { totalUsd, tokens, loading, refreshing, error } = usePortfolio();
  const money = useMoney();
  const { hidden, toggle, mask } = useBalanceVisibility();
  const t = useTranslations("balance");
  useInvalidateOnBlock(PORTFOLIO_KEY);
  // A confirmed bank deposit that has not settled yet holds the withdraw
  // button, so an unchanged balance next to a live button doesn't read as
  // "withdraw your new money now" and invite repeated attempts.
  const { pending: depositPending } = usePendingOnramp();

  // What a purchase can actually draw on. A portfolio can be worth a lot and
  // still have nothing spendable, which the total alone never shows.
  const readyToSpend = readyToSpendUsd(tokens);

  return (
    <div className="ws-card p-5 sm:p-[26px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-[13px] font-normal text-white/60">
          {t("totalBalance")}
          <button
            onClick={toggle}
            aria-label={hidden ? t("showBalance") : t("hideBalance")}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white/45 transition-colors hover:bg-white/8 hover:text-white/80"
          >
            {hidden ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
          </button>
          {refreshing ? (
            <span
              className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full"
              title="Refreshing…"
            />
          ) : null}
        </div>
        <CurrencySelect value={money.currency} onSelect={money.setCurrency} />
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          {loading ? (
            <div className="h-[52px] w-44 animate-pulse rounded-xl bg-white/8" />
          ) : error && tokens.length === 0 ? (
            // A failed fetch and a genuinely empty wallet both leave totalUsd
            // at 0 — showing "$0.00" here would read as "your funds are
            // gone." Say so isn't known instead of asserting a wrong number.
            <div className="ws-display text-[28px] leading-none tracking-[-0.02em] text-white/45">
              {t("couldntLoad")}
            </div>
          ) : (
            <div>
              <div className="ws-display tnum text-[clamp(40px,5vw,58px)] leading-none tracking-[-0.02em]">
                {mask(money.format(totalUsd))}
              </div>
              {/* Shown even at zero, in the selected currency, so an empty
                  spendable balance is stated rather than silently missing. */}
              <div className="tnum mt-2.5 text-[15.5px] font-normal text-white/60">
                {t("readyToSpend", { amount: mask(money.format(readyToSpend)) })}
              </div>
            </div>
          )}
        </div>
        <div className="flex w-full gap-2 min-[560px]:w-auto">
          <button
            onClick={onOpenFunds}
            className="text-ink flex-1 cursor-pointer rounded-xl bg-white px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap hover:opacity-90 min-[560px]:flex-none"
          >
            {t("addFunds")}
          </button>
          <button
            onClick={onOpenWithdraw}
            disabled={depositPending}
            className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium whitespace-nowrap text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/6 min-[560px]:flex-none"
          >
            {t("withdraw")}
          </button>
        </div>
      </div>

      {depositPending ? (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] font-normal text-white/55">
          <span className="bg-accent h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" />
          {t("depositPending")}
        </div>
      ) : null}

      {!loading && tokens.length > 0 ? (
        <div className="mt-[22px]">
          <div className="mb-3.5 flex items-center gap-2 text-[12px] font-normal text-white/45">
            <span className="bg-accent h-1 w-1 rounded-full" />
            {t("breakdownTitle")}
          </div>
          <PortfolioDonut tokens={tokens} />
        </div>
      ) : null}
    </div>
  );
}
