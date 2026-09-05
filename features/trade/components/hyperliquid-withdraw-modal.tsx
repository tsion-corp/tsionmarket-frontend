"use client";

import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ModalShell } from "@/components/ui/modal-shell";
import { SuccessPanel } from "@/components/ui/success-panel";
import { estimatedWithdrawalFee, formatAmount, formatUsd } from "@/lib/trade/math";
import { friendlyError } from "@/lib/errors";

interface HyperliquidWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  walletId: string | null;
  availableUsdc: number;
  onWithdraw: (
    amountUsdc: string,
    onStatus?: (status: string) => void
  ) => Promise<{ treasuryMovementId: string }>;
  onWithdrawn: () => void;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PERCENTS = [25, 50, 75, 100];

type Stage = { name: "form" } | { name: "sending" } | { name: "done"; amount: string };
const DEFAULT_SENDING_STATUS = "Withdrawing…";

// Moves funds from the perps wallet back to your main wallet — same plain,
// chain-agnostic tone as HyperliquidFundModal's "Top up". Under the hood
// this signs a withdraw3 action and the backend polls for the Arbitrum
// credit (see apps/perp/src/signing/README.md), but that's an
// implementation detail the user shouldn't have to reason about to move
// their own money.
export function HyperliquidWithdrawModal({
  open,
  onClose,
  walletId,
  availableUsdc,
  onWithdraw,
  onWithdrawn,
}: HyperliquidWithdrawModalProps) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [error, setError] = useState<string | null>(null);
  const [sendingStatus, setSendingStatus] = useState(DEFAULT_SENDING_STATUS);

  const amountNum = Number(amount);
  const validAmount = amount !== "" && Number.isFinite(amountNum) && amountNum > 0;
  const busy = stage.name === "sending";
  // Once a withdrawal is actually running, the live perps balance keeps
  // falling as the money leaves — comparing the (now-frozen) typed amount
  // against it would spuriously flag "exceeds your balance" for a transfer
  // that's already underway. The amount was already validated against the
  // balance the moment the user confirmed, so freeze the check there.
  const withinBalance = validAmount && (busy || amountNum <= availableUsdc);
  // A rounded, up-front estimate of the combined cost of moving funds all
  // the way back to the main wallet — shown as one number so the user isn't
  // left guessing what they'll actually receive.
  const platformFee = withinBalance ? estimatedWithdrawalFee(amountNum) : 0;
  const netReceive = withinBalance ? Math.max(0, amountNum - platformFee) : 0;
  const canSubmit = Boolean(walletId) && withinBalance && !busy;

  const close = () => {
    setStage({ name: "form" });
    setAmount("");
    setError(null);
    setSendingStatus(DEFAULT_SENDING_STATUS);
    onClose();
  };

  const handleAmount = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) setAmount(next);
  };

  const setPercent = (pct: number) => {
    if (availableUsdc <= 0) return;
    setAmount((Math.floor(((availableUsdc * pct) / 100) * 100) / 100).toFixed(2));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSendingStatus(DEFAULT_SENDING_STATUS);
    setStage({ name: "sending" });
    try {
      await onWithdraw(amount, setSendingStatus);
      setStage({ name: "done", amount });
      onWithdrawn();
    } catch (err) {
      setError(friendlyError(err, "Withdrawal failed."));
      setStage({ name: "form" });
    }
  };

  return (
    <ModalShell open={open} onClose={busy ? () => {} : close} size="lg">
      <div className="p-5 sm:p-6">
        {stage.name === "done" ? (
          <SuccessPanel title="Funds on the way" onDone={close}>
            {formatAmount(Number(stage.amount))} USDC is moving to your main wallet — it should land
            within a few minutes.
          </SuccessPanel>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="ws-display text-[18px]">Withdraw</div>
              <p className="mt-1 text-[12.5px] font-normal text-white/50">
                Moves funds from your perps wallet back to your main wallet.
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
                {formatAmount(availableUsdc)} USDC available
              </div>
              {validAmount && !withinBalance ? (
                <p className="text-down text-[12px] font-normal">
                  Exceeds your available {formatAmount(availableUsdc)} USDC.
                </p>
              ) : null}
              {withinBalance ? (
                <p className="tnum text-center text-[12px] font-normal text-white/45">
                  Platform fee (est.) {formatUsd(platformFee)} · You&apos;ll receive about{" "}
                  {formatUsd(netReceive)}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-center gap-2">
              {PERCENTS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercent(pct)}
                  disabled={availableUsdc <= 0 || busy}
                  className="tnum cursor-pointer rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[12px] font-medium text-white/65 transition-colors hover:border-white/25 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </button>
              ))}
            </div>

            {error ? (
              <p className="text-down text-center text-[12px] font-normal">{error}</p>
            ) : null}

            <button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="text-ink mx-auto flex w-auto cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-8 py-3 font-sans text-[14.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <>
                  <ButtonSpinner />
                  {sendingStatus}
                </>
              ) : (
                "Withdraw"
              )}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
