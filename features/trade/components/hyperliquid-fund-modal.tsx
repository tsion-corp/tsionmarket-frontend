"use client";

import { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { CopyButton } from "@/components/ui/copy-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { useCctpDepositFee } from "@/features/trade/hooks/use-cctp-deposit-fee";
import { CctpFeeUnavailableError } from "@/features/trade/lib/cctp-transfers";
import type { DepositOutcome, DepositStage } from "@/features/trade/lib/hyperliquid-actions";
import { scrubVenue } from "@/features/trade/lib/venue-scrub";
import { usePortfolio } from "@/hooks/use-portfolio";
import { friendlyError } from "@/lib/errors";
import { formatDecimalString } from "@/lib/trade/amount";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

interface HyperliquidFundModalProps {
  open: boolean;
  onClose: () => void;
  walletId: string | null;
  /** Tops up `amountUsdc` (see useHyperliquidActions.depositToPerps). */
  onDeposit: (
    amountUsdc: string,
    onStage?: (stage: DepositStage) => void
  ) => Promise<DepositOutcome>;
  /** The perps balance may have moved; the desk refetches it. */
  onFunded: () => void;
}

const USDC_DECIMALS = 6;
const CENT = 10_000n;
const DECIMAL_INPUT = /^\d*\.?\d{0,6}$/;
const PERCENTS = [25, 50, 75, 100];
// The venue's perps deposit floor is $5; a dollar of headroom so a top-up
// clears it once any transfer fee is taken.
const MIN_TOPUP = toBaseUnits("6", USDC_DECIMALS);

const STAGE_KEY = {
  sending: "stageSending",
  recording: "stageRecording",
  confirming: "stageConfirming",
} as const satisfies Record<DepositStage, string>;

type Stage =
  | { name: "form" }
  | { name: "working"; stage: DepositStage }
  | { name: "outcome"; amount: string; outcome: DepositOutcome };

const usdc = (raw: bigint, maxDigits = USDC_DECIMALS) =>
  formatDecimalString(fromBaseUnits(raw, USDC_DECIMALS), maxDigits);

// A fee is a ceiling the burn may be charged, so it is shown rounded UP.
const feeCeiling = (raw: bigint) => ((raw + 99n) / 100n) * 100n;

// Tops up the perps wallet over Circle's CCTP (llms.txt §6a): one sponsored
// Base transaction, straight into the perps balance. Every check runs on exact
// base units. After the burn the modal never shows an error, because the money
// has already left: it says what happened, with the burn's hash as a reference.
export function HyperliquidFundModal({
  open,
  onClose,
  walletId,
  onDeposit,
  onFunded,
}: HyperliquidFundModalProps) {
  const t = useTranslations("perpsFunds");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [error, setError] = useState<string | null>(null);
  const { evmAddress: walletAddress } = useAuthSession();
  const portfolio = usePortfolio();
  const { userPaysFee, maxFeeFor } = useCctpDepositFee(open);

  const baseUsdc = portfolio.tokens.find(
    (token) => token.network === "base-mainnet" && token.symbol.toUpperCase() === "USDC"
  );
  const balanceRaw = BigInt(baseUsdc?.rawBalance ?? "0");
  const amountRaw = toBaseUnits(amount, USDC_DECIMALS);
  const busy = stage.name === "working";
  const walletReady = Boolean(walletId) && Boolean(walletAddress);

  // Frozen while a top-up runs: the balance falls as the money leaves, and an
  // amount already checked must not suddenly read as too much.
  const exceedsBalance = !busy && amountRaw > balanceRaw;
  const belowMinimum = !busy && amountRaw > 0n && amountRaw < MIN_TOPUP;
  const canSubmit = walletReady && amountRaw > 0n && !exceedsBalance && !belowMinimum && !busy;
  const maxFee = userPaysFee === true && amountRaw > 0n ? maxFeeFor(amountRaw) : null;

  const close = () => {
    setStage({ name: "form" });
    setAmount("");
    setError(null);
    onClose();
  };

  const handleAmount = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
  };

  const setPercent = (pct: number) => {
    if (balanceRaw <= 0n) return;
    const share = (balanceRaw * BigInt(pct)) / 100n;
    setAmount(fromBaseUnits((share / CENT) * CENT, USDC_DECIMALS));
  };

  const submit = async () => {
    if (!canSubmit) return;
    const typed = amount;
    setError(null);
    setStage({ name: "working", stage: "sending" });
    try {
      const outcome = await onDeposit(typed, (next) => setStage({ name: "working", stage: next }));
      setStage({ name: "outcome", amount: typed, outcome });
      onFunded();
    } catch (err) {
      // Only reachable before the burn: nothing has moved, so the form stays.
      setError(
        err instanceof CctpFeeUnavailableError
          ? t("feeUnavailable")
          : scrubVenue(friendlyError(err, t("topUpFailed")))
      );
      setStage({ name: "form" });
    }
  };

  const outcomeAmount =
    stage.name === "outcome" ? usdc(toBaseUnits(stage.amount, USDC_DECIMALS)) : "";

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {stage.name === "outcome" &&
        (stage.outcome.kind === "credited" || stage.outcome.kind === "pending") ? (
          <SuccessPanel
            title={stage.outcome.kind === "credited" ? t("creditedTitle") : t("pendingTitle")}
            onDone={close}
          >
            {stage.outcome.kind === "credited"
              ? t("creditedBody", { amount: outcomeAmount })
              : t("pendingBody", { amount: outcomeAmount })}
          </SuccessPanel>
        ) : stage.name === "outcome" ? (
          <div className="flex flex-col items-center gap-4 pt-1.5 text-center">
            <div className="ws-display text-[24px] tracking-[-0.01em]">
              {stage.outcome.kind === "recordFailed" ? t("recordFailedTitle") : t("failedTitle")}
            </div>
            <p className="max-w-[40ch] text-sm leading-[1.55] font-normal text-white/70">
              {stage.outcome.kind === "recordFailed"
                ? t("recordFailedBody", { amount: outcomeAmount })
                : t("failedBody", { amount: outcomeAmount })}
            </p>
            <div className="flex w-full items-center gap-2 rounded-[14px] border border-white/10 bg-white/4 px-3 py-2.5 text-left">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-normal text-white/45">{t("reference")}</div>
                <div className="font-mono text-[11.5px] break-all text-white/80">
                  {stage.outcome.burnTxHash}
                </div>
              </div>
              <CopyButton value={stage.outcome.burnTxHash} size="sm" />
            </div>
            <button
              type="button"
              onClick={close}
              className="ws-chrome text-ink w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
            >
              {t("done")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="ws-display text-[18px]">{t("topUpTitle")}</div>
              <p className="mt-1 text-[12.5px] font-normal text-white/50">{t("topUpSubtitle")}</p>
            </div>

            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="ws-display tnum text-[28px] text-white/35">$</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmount(e.target.value)}
                  placeholder="0"
                  disabled={busy}
                  autoFocus
                  size={Math.max(1, amount.length || 1)}
                  className="ws-display tnum max-w-full bg-transparent text-center text-[64px] leading-none text-white outline-none placeholder:text-white/15 disabled:opacity-60"
                />
              </div>
              <div className="tnum text-[12.5px] font-normal text-white/45">
                {t("available", { amount: usdc(balanceRaw) })}
              </div>
              {exceedsBalance ? (
                <p className="text-down text-[12px] font-normal">
                  {t("exceedsBalance", { amount: usdc(balanceRaw) })}
                </p>
              ) : belowMinimum ? (
                <p className="text-down text-[12px] font-normal">
                  {t("belowTopUpMinimum", { amount: usdc(MIN_TOPUP) })}
                </p>
              ) : maxFee !== null && maxFee < amountRaw ? (
                // Free relays show no fee line at all (llms.txt §6a).
                <p className="tnum text-[12px] font-normal text-white/45">
                  {t("depositFeeLine", {
                    fee: `${usdc(feeCeiling(maxFee), 4)} USDC`,
                    net: `${usdc(amountRaw - maxFee, 4)} USDC`,
                  })}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-2">
              {PERCENTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPercent(pct)}
                  disabled={balanceRaw <= 0n || busy}
                  className="tnum cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct === 100 ? t("max") : `${pct}%`}
                </button>
              ))}
            </div>

            {!walletReady ? (
              <p className="text-center text-[12.5px] leading-normal font-normal text-white/50">
                {t("walletNotReady")}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-down text-center text-[12px] font-normal">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="text-ink mx-auto flex w-auto cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 py-3 font-sans text-[14.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {stage.name === "working" ? (
                <>
                  <ButtonSpinner />
                  {t(STAGE_KEY[stage.stage])}
                </>
              ) : (
                t("topUpCta")
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
