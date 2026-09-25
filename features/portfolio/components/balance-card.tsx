"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { Responsive } from "@/components/ui/responsive";
import { BalanceCardDesktop } from "@/features/portfolio/components/balance-card-desktop";
import { BalanceCardMobile } from "@/features/portfolio/components/balance-card-mobile";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePendingBankDeposit } from "@/hooks/use-ramping";
import { useGlobalBalance } from "@/hooks/use-global-balance";
import { useSpendableCash } from "@/features/portfolio/hooks/use-spendable-cash";
import { isWithdrawHeld } from "@/features/portfolio/lib/ready-to-spend";
import type { BalanceCardViewProps } from "@/features/portfolio/components/balance-card-view";

interface BalanceCardProps {
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  onTakeTour: () => void;
  /** See BalanceCardViewProps.updateBalanceSlot. */
  updateBalanceSlot?: ReactNode;
  /**
   * Hide the figure because the money is still in the old wallet. Decided by
   * the route (useMaskBalance) for the same reason the slot is: it is another
   * feature's rule. Comes off as soon as a sweep lands anything.
   */
  maskForMigration?: boolean;
}

// Owns the data and the rules; the two screens below it only draw. The phone
// and desktop layouts differ enough that one set of responsive classes was
// fighting itself, so each is its own component and this picks between them
// with CSS. Both are presentational, so mounting both runs no effect twice and
// costs no extra request.
export function BalanceCard({
  onOpenFunds,
  onOpenWithdraw,
  onTakeTour,
  updateBalanceSlot,
  maskForMigration = false,
}: BalanceCardProps) {
  const { tokens, loading, refreshing, error, refetch, refetchFresh } = usePortfolio();
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
  //
  // This one figure, and only this one, reads the user-management balance
  // endpoint: exact base units of the stablecoins this app can sign for, on
  // Base, where everything here settles. The total above, the token list and
  // the breakdown all stay on usePortfolio, which spans six chains and perps
  // and is the only source that can price them
  // (ADR-2026-09-23-user-balance-endpoint).
  //
  // There is deliberately NO fallback to readyToSpendUsd(tokens) when this is
  // unavailable. Two sources for one number is how the two quietly disagree,
  // and a float sum standing in during an outage would hide the outage behind
  // a figure nobody could tell apart from the real one.
  const { readyToSpend } = useSpendableCash();

  // Manual refresh: bypass the short server cache, but only for networks the
  // wallet actually holds — never a fresh sweep of every known chain
  // (ADR-2026-09-09-portfolio-refresh-scope). With nothing held yet, a plain
  // refetch re-reads the normal snapshot.
  const heldNetworks = useMemo(() => [...new Set(tokens.map((token) => token.network))], [tokens]);
  const onRefresh = useCallback(() => {
    if (heldNetworks.length > 0) void refetchFresh(heldNetworks);
    else void refetch();
  }, [heldNetworks, refetchFresh, refetch]);

  // The settling-deposit hold only applies while there is nothing withdrawable.
  // It exists to stop hammering the button for money that has not landed yet;
  // a user whose spendable cash already clears the withdrawal minimum can
  // legitimately withdraw and keeps the button — and a user whose spendable
  // cash is not known keeps it too, because "we don't know" is not "you have
  // nothing". See isWithdrawHeld.
  const withdrawHeld = isWithdrawHeld(depositPending, readyToSpend);

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
    // One masking path, not two: the migration hides the figure through the
    // same switch as the user's own eye toggle, so formatMasked and every
    // screen that reads `hidden` need no special case.
    hidden: hidden || maskForMigration,
    onToggleHidden: toggle,
    formatMasked: (amount) => mask(money.format(amount)),
    onOpenFunds,
    onOpenWithdraw,
    onRefresh,
    onTakeTour,
    updateBalanceSlot,
  };

  // The walkthrough spotlights whichever breakpoint's card is visible: each
  // card root carries data-tour="balance", and the tour skips the hidden one
  // because it has no box. Both cards are h-full, so the phone card fills its
  // carousel slide and stands as tall as the Kash+ card beside it.
  return (
    <Responsive
      mobile={<BalanceCardMobile {...view} />}
      desktop={<BalanceCardDesktop {...view} />}
    />
  );
}
