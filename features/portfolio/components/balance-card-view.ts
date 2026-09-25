import type { ReactNode } from "react";
import type { TokenBalance } from "@/hooks/use-portfolio";
import type { ReadyToSpend } from "@/features/portfolio/lib/ready-to-spend";

// What both balance screens render from. The card itself owns the hooks and
// hands the resolved values down, so the phone and desktop screens stay purely
// presentational and neither runs an effect the other would duplicate.
export interface BalanceCardViewProps {
  totalUsd: number;
  /**
   * Spendable cash, which is a state and not a number.
   *
   * It was a plain `number` while it was summed from the portfolio's floats,
   * where an unloaded balance and an empty one were both 0 and nobody could
   * tell. It now comes from the balance endpoint, which says "not known" out
   * loud, and the card gates the withdraw button on it — so the type carries
   * the three cases rather than letting a `?? 0` decide one of them silently.
   */
  readyToSpend: ReadyToSpend;
  tokens: TokenBalance[];
  loading: boolean;
  refreshing: boolean;
  /** True only when the fetch failed AND nothing cached survived. */
  errored: boolean;
  depositPending: boolean;
  withdrawHeld: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
  /** Formats an amount in the selected currency, then masks it if hidden. */
  formatMasked: (amount: number) => string;
  onOpenFunds: () => void;
  onOpenWithdraw: () => void;
  /**
   * The migration's one-click sweep, sat between Add funds and Withdraw for a
   * user whose money is still in their old wallet. Supplied by the route, not
   * reached for here: it belongs to another feature, and features never import
   * each other. Null for everyone else.
   */
  updateBalanceSlot?: ReactNode;
  /**
   * Re-reads the balance on demand. The balance is cache-first and does not
   * poll, so this is the user's escape hatch for a change made outside the app
   * (e.g. funds moved from another wallet) that no in-app transaction covered.
   */
  onRefresh: () => void;
  /**
   * Replays the walkthrough. Supplied by the route rather than reached for
   * here: the tour is another feature, and features never import each other.
   */
  onTakeTour: () => void;
}
