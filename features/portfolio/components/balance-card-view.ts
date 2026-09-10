import type { TokenBalance } from "@/hooks/use-portfolio";

// What both balance screens render from. The card itself owns the hooks and
// hands the resolved values down, so the phone and desktop screens stay purely
// presentational and neither runs an effect the other would duplicate.
export interface BalanceCardViewProps {
  totalUsd: number;
  readyToSpend: number;
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
}
