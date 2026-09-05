"use client";

import { useEffect, useState } from "react";
import type { ArkjetBalance } from "@/features/casino/lib/api/arkjet";
import { useArkjetFunding } from "@/features/casino/hooks/use-arkjet-funding";
import {
  amountUnits,
  fixedNgnPerUsdc,
  ngnToDepositUsdc,
  normalizeArkjetAmount,
  usdcUnitsToNgn,
  withdrawalUsdcEstimate,
} from "@/features/casino/lib/arkjet-funding";
import { usePortfolio } from "@/hooks/use-portfolio";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import styles from "./arkjet.module.css";

type CashierMode = "deposit" | "withdraw";

interface ArkjetCashierProps {
  balance: ArkjetBalance | null;
  minimumAmount: string;
  onClose: () => void;
}

const DECIMAL = /^\d*\.?\d*$/;

function money(value: string, currency: string): string {
  const parsed = Number(value);
  return `${Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value} ${currency}`;
}

export function ArkjetCashier({ balance, minimumAmount, onClose }: ArkjetCashierProps) {
  const funding = useArkjetFunding();
  const portfolio = usePortfolio();
  const [mode, setMode] = useState<CashierMode>("deposit");
  const [amount, setAmount] = useState("");
  const [awaitingCredit, setAwaitingCredit] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const config = funding.config;
  const token = config
    ? portfolio.tokens.find(
        (item) =>
          item.network === "base-mainnet" &&
          (item.address?.toLowerCase() === config.tokenAddress.toLowerCase() ||
            item.symbol.toUpperCase() === config.tokenSymbol.toUpperCase())
      )
    : null;
  const walletRaw = BigInt(token?.rawBalance ?? "0");
  const walletUsdc = config ? fromBaseUnits(walletRaw, config.tokenDecimals) : "0";
  const normalized = config ? normalizeArkjetAmount(amount, config.currencyDecimalPlaces) : null;
  const enteredMinor = config ? amountUnits(normalized, config.currencyDecimalPlaces) : 0n;
  const availableMinor = config
    ? toBaseUnits(balance?.available ?? "0", config.currencyDecimalPlaces)
    : 0n;
  const minimumMinor = config ? toBaseUnits(minimumAmount, config.currencyDecimalPlaces) : 0n;
  const depositUsdc =
    config && normalized
      ? ngnToDepositUsdc(
          normalized,
          config.currencyDecimalPlaces,
          config.tokenDecimals,
          config.ngnMinorPerUsdc
        )
      : "0";
  const depositTokenUnits = config ? toBaseUnits(depositUsdc, config.tokenDecimals) : 0n;
  const withdrawal =
    config && normalized
      ? withdrawalUsdcEstimate(
          normalized,
          config.currencyDecimalPlaces,
          config.tokenDecimals,
          config.ngnMinorPerUsdc,
          config.withdrawalFeeBps
        )
      : { feeNgn: "0", receiveUsdc: "0" };

  const belowMinimum = enteredMinor > 0n && enteredMinor < minimumMinor;
  const overBalance = mode === "withdraw" && enteredMinor > availableMinor;
  const overWallet = mode === "deposit" && depositTokenUnits > walletRaw;
  const busy = funding.depositing || funding.withdrawing;
  const ready =
    normalized !== null &&
    !belowMinimum &&
    !overBalance &&
    !overWallet &&
    !busy &&
    (mode === "deposit" || config?.withdrawalsEnabled === true);

  const setMaximum = () => {
    if (!config) return;
    if (mode === "withdraw") {
      setAmount(balance?.available ?? "0");
      return;
    }
    setAmount(
      usdcUnitsToNgn(
        walletRaw,
        config.tokenDecimals,
        config.currencyDecimalPlaces,
        config.ngnMinorPerUsdc
      )
    );
  };

  const switchMode = (next: CashierMode) => {
    setMode(next);
    setAmount("");
    setAwaitingCredit(false);
  };

  const deposit = async () => {
    if (!normalized || !config) return;
    const toastId = toast.loading("Sending Base USDC from your Privy wallet…");
    setAwaitingCredit(false);
    try {
      const result = await funding.deposit(depositUsdc);
      void portfolio.refetchFresh();
      if (result.credited) {
        toast.success(`${money(result.credited, config.currency)} added to Arkjet.`, {
          id: toastId,
        });
        setAmount("");
      } else {
        toast.dismiss(toastId);
        setAwaitingCredit(true);
      }
    } catch (error) {
      toast.error(friendlyError(error, "The Arkjet deposit could not be completed."), {
        id: toastId,
      });
    }
  };

  const withdraw = async () => {
    if (!normalized || !config) return;
    const toastId = toast.loading("Reserving your Arkjet balance for payout…");
    try {
      const result = await funding.withdraw(normalized);
      toast.success(
        result.status === "SENT"
          ? `${result.amountUsdc} USDC sent to your Privy wallet.`
          : "Withdrawal submitted. Your balance is safely reserved while it confirms.",
        { id: toastId }
      );
      setAmount("");
      void portfolio.refetchFresh();
    } catch (error) {
      toast.error(friendlyError(error, "The Arkjet withdrawal could not be completed."), {
        id: toastId,
      });
    }
  };

  return (
    <div
      className={styles.cashierOverlay}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={styles.cashierDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Arkjet balance"
      >
        <div className={styles.cashierHeader}>
          <div>
            <span className={styles.cashierEyebrow}>PRIVY WALLET + ARKJET LEDGER</span>
            <h2>Arkjet balance</h2>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close balance"
          >
            ×
          </button>
        </div>

        {funding.configLoading ? (
          <div className={styles.cashierUnavailable}>Loading wallet funding…</div>
        ) : !funding.configured || !config ? (
          <div className={styles.cashierUnavailable}>
            Wallet funding is disabled on this deployment. Arkjet will not move funds until the
            vault and conversion rate are configured.
          </div>
        ) : (
          <>
            <div className={styles.cashierBalances}>
              <div>
                <span>Privy wallet</span>
                <strong>{money(walletUsdc, config.tokenSymbol)}</strong>
                <small>On Base</small>
              </div>
              <div>
                <span>Playable now</span>
                <strong>{money(balance?.available ?? "0", config.currency)}</strong>
                <small>Internal ledger</small>
              </div>
            </div>

            <div className={styles.cashierBuckets}>
              <span>Locked in bets: {money(balance?.locked ?? "0", config.currency)}</span>
              <span>
                Pending payout: {money(balance?.pendingWithdrawal ?? "0", config.currency)}
              </span>
            </div>

            <div className={styles.cashierTabs}>
              {(["deposit", "withdraw"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={mode === item ? styles.cashierTabActive : ""}
                  onClick={() => switchMode(item)}
                >
                  {item === "deposit" ? "Add funds" : "Withdraw"}
                </button>
              ))}
            </div>

            <div className={styles.cashierAmount}>
              <div className={styles.cashierAmountLabel}>
                <span>Amount in {config.currency}</span>
                <button type="button" onClick={setMaximum}>
                  Max
                </button>
              </div>
              <div className={styles.cashierInputRow}>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  placeholder="10.00"
                  onChange={(event) =>
                    DECIMAL.test(event.target.value) && setAmount(event.target.value)
                  }
                />
                <span>{config.currency}</span>
              </div>
              <div className={styles.cashierConversion}>
                {mode === "deposit"
                  ? `${normalized ? depositUsdc : "0"} ${config.tokenSymbol} leaves your wallet`
                  : `${withdrawal.receiveUsdc} ${config.tokenSymbol} returns to your wallet`}
              </div>
            </div>

            {belowMinimum ? (
              <div className={styles.cashierError}>
                Minimum amount is {money(minimumAmount, config.currency)}.
              </div>
            ) : null}
            {overWallet ? (
              <div className={styles.cashierError}>
                Your Privy wallet does not hold enough Base USDC.
              </div>
            ) : null}
            {overBalance ? (
              <div className={styles.cashierError}>
                That is more than your playable Arkjet balance.
              </div>
            ) : null}
            {mode === "withdraw" && !config.withdrawalsEnabled ? (
              <div className={styles.cashierError}>
                Wallet withdrawals are not enabled on this deployment.
              </div>
            ) : null}
            {awaitingCredit ? (
              <div className={styles.cashierPending}>
                The USDC transfer succeeded. Arkjet is waiting for {config.requiredConfirmations}{" "}
                Base confirmation(s) before crediting the ledger.
              </div>
            ) : null}

            <button
              type="button"
              className={styles.cashierSubmit}
              disabled={!ready}
              onClick={() => void (mode === "deposit" ? deposit() : withdraw())}
            >
              {busy
                ? funding.depositPhase === "confirming"
                  ? "Confirming deposit…"
                  : "Processing…"
                : mode === "deposit"
                  ? "Transfer USDC and add funds"
                  : "Withdraw to Privy wallet"}
            </button>

            <div className={styles.cashierFootnote}>
              Fixed conversion: 1 USDC ={" "}
              {fixedNgnPerUsdc(config.ngnMinorPerUsdc, config.currencyDecimalPlaces)}{" "}
              {config.currency}.
              {mode === "withdraw" && config.withdrawalFeeBps > 0
                ? ` Fee: ${withdrawal.feeNgn} ${config.currency}.`
                : ""}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
