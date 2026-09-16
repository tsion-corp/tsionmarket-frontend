"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import type { WithdrawStep } from "@/features/trade/lib/hyperliquid-actions";
import { planWithdrawal } from "@/features/trade/lib/perps-withdrawal";
import { scrubVenue } from "@/features/trade/lib/venue-scrub";
import { friendlyError } from "@/lib/errors";
import { formatDecimalString } from "@/lib/trade/amount";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

interface HyperliquidWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  walletId: string | null;
  /** The perps wallet's free balance, exactly as the clearinghouse reports it. */
  availableUsdc: string;
  /** Withdraws `total`, the amount that leaves the perps wallet. */
  onWithdraw: (
    total: string,
    onStatus?: (step: WithdrawStep) => void
  ) => Promise<{ treasuryMovementId: string }>;
  onWithdrawn: () => void;
}

const USDC_DECIMALS = 6;
const CENT = 10_000n;
const DECIMAL_INPUT = /^\d*\.?\d{0,6}$/;
const PERCENTS = [25, 50, 75, 100];

const STEP_KEY = {
  withdrawing: "stepWithdrawing",
  waiting: "stepWaiting",
  moving: "stepMoving",
  confirming: "stepConfirming",
  finishing: "stepFinishing",
} as const satisfies Record<WithdrawStep, string>;

type Stage =
  { name: "form" } | { name: "sending"; step: WithdrawStep } | { name: "done"; receive: string };

const usdc = (value: string) => formatDecimalString(value, USDC_DECIMALS);

// Moves funds from the perps wallet back to the main wallet (llms.txt §6b).
// The typed amount is the total that leaves; every figure on screen comes from
// planWithdrawal, in exact base units, so what the reader is shown is what the
// withdrawal does.
export function HyperliquidWithdrawModal({
  open,
  onClose,
  walletId,
  availableUsdc,
  onWithdraw,
  onWithdrawn,
}: HyperliquidWithdrawModalProps) {
  const t = useTranslations("perpsFunds");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [error, setError] = useState<string | null>(null);

  const busy = stage.name === "sending";
  const plan = planWithdrawal({ total: amount, withdrawable: availableUsdc });
  const availableRaw = toBaseUnits(availableUsdc, USDC_DECIMALS);
  const canSubmit = Boolean(walletId) && plan.kind === "ok" && !busy;

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

  // A share of the free balance, floored to the cent so it never exceeds it.
  const setPercent = (pct: number) => {
    if (availableRaw <= 0n) return;
    const share = (availableRaw * BigInt(pct)) / 100n;
    setAmount(fromBaseUnits((share / CENT) * CENT, USDC_DECIMALS));
  };

  const submit = async () => {
    if (!canSubmit || plan.kind !== "ok") return;
    const receive = plan.receive;
    setError(null);
    setStage({ name: "sending", step: "withdrawing" });
    try {
      await onWithdraw(amount, (step) => setStage({ name: "sending", step }));
      setStage({ name: "done", receive });
      onWithdrawn();
    } catch (err) {
      setError(scrubVenue(friendlyError(err, t("withdrawFailed"))));
      setStage({ name: "form" });
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {stage.name === "done" ? (
          <SuccessPanel title={t("withdrawDoneTitle")} onDone={close}>
            {t("withdrawDoneBody", { amount: usdc(stage.receive) })}
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="ws-display text-[18px]">{t("withdrawTitle")}</div>
              <p className="mt-1 text-[12.5px] font-normal text-white/50">
                {busy ? t("withdrawWaitHint") : t("withdrawSubtitle")}
              </p>
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
                {t("available", { amount: usdc(availableUsdc) })}
              </div>
              {plan.kind === "exceedsBalance" && !busy ? (
                <p className="text-down text-[12px] font-normal">
                  {t("exceedsBalance", { amount: usdc(availableUsdc) })}
                </p>
              ) : plan.kind === "belowMinimum" && !busy ? (
                <p className="text-down text-[12px] font-normal">
                  {t("belowWithdrawMinimum", { amount: usdc(plan.minimum) })}
                </p>
              ) : plan.kind === "ok" ? (
                <p className="tnum text-center text-[12px] font-normal text-white/45">
                  {t("withdrawFeeLine", {
                    fee: `${usdc(plan.totalFee)} USDC`,
                    receive: `${usdc(plan.receive)} USDC`,
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
                  disabled={availableRaw <= 0n || busy}
                  className="tnum cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct === 100 ? t("max") : `${pct}%`}
                </button>
              ))}
            </div>

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
              {stage.name === "sending" ? (
                <>
                  <ButtonSpinner />
                  {t(STEP_KEY[stage.step])}
                </>
              ) : (
                t("withdrawCta")
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
