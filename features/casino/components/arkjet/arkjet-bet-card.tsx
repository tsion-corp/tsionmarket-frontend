"use client";

import { useRef, useState } from "react";
import type {
  ArkjetBet,
  ArkjetRound,
  CreateArkjetBetInput,
} from "@/features/casino/lib/api/arkjet";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import styles from "./arkjet.module.css";

const QUICK_AMOUNT_FACTORS = [1, 2, 5, 10];

function validAmount(value: string): string {
  const cleaned = value.replace(/[^0-9.]/gu, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

function fixedMultiplier(value: string): string {
  if (!value.trim()) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}

function arkjetError(error: unknown, fallback: string): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  if (code === "PLAYER_BALANCE_INSUFFICIENT") {
    return "Your Arkjet balance is too low for that bet. Add funds or choose a smaller amount.";
  }
  return friendlyError(error, fallback);
}

interface ArkjetBetCardProps {
  slot: 1 | 2;
  round: ArkjetRound;
  currency: string;
  minimumAmount: string;
  minimumCashoutMultiplier: string;
  maximumCashoutMultiplier: string;
  activeBet: ArkjetBet | null;
  wageringEnabled: boolean;
  settlementEnabled: boolean;
  authenticated: boolean;
  authReady: boolean;
  busy: boolean;
  onLogin: () => void;
  onPlace: (input: CreateArkjetBetInput) => Promise<ArkjetBet>;
  onCancel: (betId: string) => Promise<ArkjetBet>;
  onCashout: (betId: string) => Promise<ArkjetBet>;
}

export function ArkjetBetCard({
  slot,
  round,
  currency,
  minimumAmount,
  minimumCashoutMultiplier,
  maximumCashoutMultiplier,
  activeBet,
  wageringEnabled,
  settlementEnabled,
  authenticated,
  authReady,
  busy,
  onLogin,
  onPlace,
  onCancel,
  onCashout,
}: ArkjetBetCardProps) {
  const [mode, setMode] = useState<"bet" | "auto">("bet");
  const minimum = Math.max(Number(minimumAmount) || 10, 0.01);
  const [amount, setAmount] = useState(() => minimum.toFixed(2));
  const [cashout, setCashout] = useState("2.00");
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);
  const numericAmount = Number(amount) || 0;
  const autoCashout = Number(cashout) || 0;
  const minimumCashout = Math.max(Number(minimumCashoutMultiplier) || 1.1, 1);
  const maximumCashout = Math.max(Number(maximumCashoutMultiplier) || 100, minimumCashout);
  const currentMultiplier = Number(round.currentMultiplier) || 1;
  const panelId = slot === 1 ? "A" : "B";
  const canSubmitAmount =
    numericAmount >= minimum &&
    (mode === "bet" || (autoCashout >= minimumCashout && autoCashout <= maximumCashout));

  let action = "Wait for next round";
  let actionKind: "place" | "cancel" | "cashout" | "login" | "none" = "none";
  let status = "Bets open during the committed phase";

  if (!authReady) {
    action = "Preparing account…";
    status = "Checking your session";
  } else if (!authenticated) {
    action = "Sign in to bet";
    actionKind = "login";
    status = "Sign in to view your Arkjet balance";
  } else if (!wageringEnabled) {
    action = "Betting unavailable";
    status = "Live wagering is currently disabled";
  } else if (activeBet) {
    status = `${activeBet.amount} ${activeBet.currency} accepted · max ${activeBet.maximumCashoutMultiplier}x`;
    if (round.status === "COMMITTED") {
      action = "Cancel Bet";
      actionKind = "cancel";
    } else if (
      round.status === "RUNNING" &&
      settlementEnabled &&
      currentMultiplier >= minimumCashout
    ) {
      action = `Cash Out ${round.currentMultiplier ?? "1.00"}x`;
      actionKind = "cashout";
    } else if (round.status === "RUNNING" && settlementEnabled) {
      action = `Cashout opens ${minimumCashout.toFixed(2)}x`;
    } else if (round.status === "RUNNING") {
      action = "Cashout unavailable";
    } else if (round.status === "LOCKED") {
      action = "Bet locked";
    } else {
      action = "Settling bet…";
    }
  } else if (round.status === "COMMITTED") {
    action = mode === "auto" ? "Place Auto Bet" : "Bet";
    actionKind = canSubmitAmount ? "place" : "none";
    status =
      mode === "auto"
        ? `Auto cashout at ${cashout || "0.00"}x`
        : `Manual cashout · ${minimumCashout.toFixed(2)}x–${maximumCashout.toFixed(2)}x`;
  } else {
    status = `Round #${round.sequence} is ${round.status.toLowerCase()}`;
  }

  const disabled = busy || actionKind === "none";
  const shownAmount = activeBet?.amount ?? (amount || "0.00");

  async function act() {
    if (actionKind === "login") {
      onLogin();
      return;
    }

    if (actionKind === "cancel" && activeBet) {
      const toastId = toast.loading("Cancelling Arkjet bet…");
      try {
        await onCancel(activeBet.betId);
        toast.success("Arkjet bet cancelled.", { id: toastId });
      } catch (error) {
        toast.error(arkjetError(error, "Could not cancel that Arkjet bet."), { id: toastId });
      }
      return;
    }

    if (actionKind === "cashout" && activeBet) {
      const toastId = toast.loading("Cashing out Arkjet bet…");
      try {
        const settled = await onCashout(activeBet.betId);
        toast.success(
          settled.payout
            ? `Cashed out ${settled.payout} ${settled.currency}.`
            : "Arkjet cashout completed.",
          { id: toastId }
        );
      } catch (error) {
        toast.error(arkjetError(error, "Could not cash out that Arkjet bet."), { id: toastId });
      }
      return;
    }

    if (actionKind !== "place") return;
    const canonicalCashout = fixedMultiplier(cashout);
    const fingerprint = [round.roundId, panelId, amount, mode, canonicalCashout].join(":");
    if (idempotency.current?.fingerprint !== fingerprint) {
      idempotency.current = { fingerprint, key: crypto.randomUUID() };
    }

    const toastId = toast.loading("Placing Arkjet bet…");
    try {
      await onPlace({
        roundId: round.roundId,
        panelId,
        amount,
        currency,
        ...(mode === "auto" ? { autoCashoutMultiplier: canonicalCashout } : {}),
        idempotencyKey: idempotency.current.key,
      });
      idempotency.current = null;
      toast.success(`Bet ${amount} ${currency} accepted.`, { id: toastId });
    } catch (error) {
      toast.error(arkjetError(error, "Could not place that Arkjet bet."), { id: toastId });
    }
  }

  return (
    <article className={styles.betCard}>
      <div className={styles.betTabs}>
        <button
          type="button"
          className={`${styles.betTab} ${mode === "bet" ? styles.betTabActive : ""}`}
          disabled={Boolean(activeBet) || busy}
          onClick={() => setMode("bet")}
        >
          Bet
        </button>
        <button
          type="button"
          className={`${styles.betTab} ${mode === "auto" ? styles.betTabActive : ""}`}
          disabled={Boolean(activeBet) || busy}
          onClick={() => setMode("auto")}
        >
          Auto
        </button>
      </div>
      <div className={styles.betStatus}>{status}</div>
      <div className={styles.betBody}>
        <div>
          <div className={styles.amountControl}>
            <button
              type="button"
              className={styles.stepButton}
              aria-label={`Decrease bet ${slot}`}
              disabled={Boolean(activeBet) || busy}
              onClick={() => setAmount(Math.max(minimum, numericAmount - minimum).toFixed(2))}
            >
              −
            </button>
            <input
              aria-label={`Bet ${slot} amount`}
              value={activeBet?.amount ?? amount}
              inputMode="decimal"
              className={styles.amountInput}
              disabled={Boolean(activeBet) || busy}
              onChange={(event) => setAmount(validAmount(event.target.value))}
            />
            <button
              type="button"
              className={styles.stepButton}
              aria-label={`Increase bet ${slot}`}
              disabled={Boolean(activeBet) || busy}
              onClick={() => setAmount((numericAmount + minimum).toFixed(2))}
            >
              +
            </button>
          </div>
          <div className={styles.quickGrid}>
            {QUICK_AMOUNT_FACTORS.map((factor) => {
              const quick = minimum * factor;
              return (
                <button
                  key={factor}
                  type="button"
                  className={styles.quickButton}
                  disabled={Boolean(activeBet) || busy}
                  onClick={() => setAmount(quick.toFixed(2))}
                >
                  {quick.toLocaleString()}
                </button>
              );
            })}
          </div>
          {mode === "auto" ? (
            <label className={styles.autoRow}>
              Auto cashout
              <input
                value={cashout}
                inputMode="decimal"
                className={styles.autoInput}
                disabled={Boolean(activeBet) || busy}
                onChange={(event) => setCashout(validAmount(event.target.value))}
                onBlur={() => setCashout(fixedMultiplier(cashout))}
              />
            </label>
          ) : null}
        </div>
        <button
          type="button"
          className={`${styles.betAction} ${
            actionKind === "cancel"
              ? styles.betActionCancel
              : actionKind === "cashout"
                ? styles.betActionCashout
                : ""
          }`}
          disabled={disabled}
          onClick={() => void act()}
        >
          {busy ? "Processing…" : action}
          <span className={styles.betAmount}>
            {shownAmount} {activeBet?.currency ?? currency}
          </span>
        </button>
      </div>
    </article>
  );
}
