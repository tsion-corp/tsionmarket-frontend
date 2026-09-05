"use client";

import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { BalanceCardDesktop } from "@/features/portfolio/components/balance-card-desktop";
import { BalanceCardMobile } from "@/features/portfolio/components/balance-card-mobile";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePendingBankDeposit } from "@/hooks/use-ramping";
import { useGlobalBalance } from "@/hooks/use-global-balance";
import { readyToSpendUsd } from "@/features/portfolio/lib/breakdown";
import { OFFRAMP_MIN_USDC } from "@/lib/ramping/orders";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

interface BalanceCardProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
}

// Owns the data and the rules; the two screens below it only draw. The phone
// and desktop layouts differ enough that one set of responsive classes was
// fighting itself, so each is its own component and this picks between them
// with CSS. Both are presentational, so mounting both runs no effect twice and
// costs no extra request.
export function BalanceCard({ onOpenFunds, onOpenWithdraw }: BalanceCardProps) {
  const { tokens, loading, refreshing, error } = usePortfolio();
  // The headline figure spans everything the wallet holds today (spot +
  // perps); readyToSpend below stays spot-only on purpose, see its own
  // comment.
  const { totalUsd } = useGlobalBalance();
  const money = useMoney();
  const { hidden, toggle, mask } = useBalanceVisibility();
  // A confirmed bank deposit that has not settled yet holds the withdraw
  // button, so an unchanged balance next to a live button doesn't read as
  // "withdraw your new money now" and invite repeated attempts.
  const { pending: depositPending } = usePendingBankDeposit();

  // What a purchase can actually draw on. A portfolio can be worth a lot and
  // still have nothing spendable, which the total alone never shows.
  const readyToSpend = readyToSpendUsd(tokens);

  // The settling-deposit hold only applies while there is nothing withdrawable.
  // It exists to stop hammering the button for money that has not landed yet;
  // a user whose spendable cash already clears the withdrawal minimum can
  // legitimately withdraw and keeps the button.
  const withdrawHeld = depositPending && readyToSpend < OFFRAMP_MIN_USDC;

  // Distinguish "we couldn't load it" from "you have nothing": a failed request
  // that left a cached balance behind keeps showing the balance.
  const errored = !!error && tokens.length === 0;

  const view: BalanceCardViewProps = {
    totalUsd,
    readyToSpend,
    tokens,
    loading,
    refreshing,
    errored,
    depositPending,
    withdrawHeld,
    hidden,
    onToggleHidden: toggle,
    formatMasked: (amount) => mask(money.format(amount)),
    onOpenFunds,
    onOpenWithdraw,
  };

  return (
    <>
      {/* data-tour: the walkthrough spotlights the balance card, whichever
          breakpoint's copy of it is the visible one. */}
      <div data-tour="balance" className="md:hidden">
        <BalanceCardMobile {...view} />
      </div>
      <div data-tour="balance" className="hidden md:block">
        <BalanceCardDesktop {...view} />
      </div>
    </>
  );
}
