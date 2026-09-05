"use client";

import { useEffect, useRef } from "react";
import { pairSymbol } from "@/lib/perp/logic";
import type { PerpPair } from "@/lib/perp/types";
import type { PerpPrefill } from "@/lib/voice/intent";

// Resolve a spoken perp symbol ("BTC", "XAU", "TSLA") against a pairs list,
// matching the base leg or a full "BTC/USD" symbol.
function resolvePair(pairs: PerpPair[], symbol: string): PerpPair | null {
  const want = symbol.toUpperCase();
  return (
    pairs.find((p) => p.from.toUpperCase() === want) ??
    pairs.find((p) => pairSymbol(p).toUpperCase() === want) ??
    null
  );
}

interface Options {
  prefill: PerpPrefill | null;
  /** The pairs THIS form can select among (Simple: majors; Pro: all). */
  pairs: PerpPair[];
  /** Set the form's selected market to this full symbol (e.g. "BTC/USD"). */
  setSelected: (symbol: string) => void;
  setSide: (side: "long" | "short") => void;
  setCollateral: (amount: string) => void;
  /** Leverage differs by form (number in Simple, string in Pro) — the caller adapts. */
  setLeverage: (leverage: string) => void;
  /** The form's own submit(). Called once after the form is staged + valid. */
  submit: () => void | Promise<void>;
  /** True once the form considers the staged order valid and ready to fire. */
  canSubmit: boolean;
  /** True when this form can actually select the resolved pair (else it defers). */
  onUnavailable?: (symbol: string) => void;
  /** Form-specific staging extras (e.g. Pro switching category + order type). */
  onStage?: (pair: PerpPair) => void;
}

// Stages a voice perp command INTO the visible form (so the user watches the
// asset, side, collateral and leverage populate), then — after a short beat and
// once the form reports it's valid — fires the form's own submit(). This makes
// auto-execute read as "it filled the form and clicked the button itself",
// rather than signing invisibly.
//
// Two phases, each guarded by a ref so they run exactly once per prefill:
//  1) STAGE: on a new prefill, resolve the pair and set the form state.
//  2) FIRE: once staged + canSubmit, wait STAGE_VISIBLE_MS then submit.
const STAGE_VISIBLE_MS = 650;

export function usePerpFormAutostage({
  prefill,
  pairs,
  setSelected,
  setSide,
  setCollateral,
  setLeverage,
  submit,
  canSubmit,
  onUnavailable,
  onStage,
}: Options): void {
  const stagedFor = useRef<PerpPrefill | null>(null);
  const firedFor = useRef<PerpPrefill | null>(null);
  // Keep the latest submit()/canSubmit in refs so the fire effect doesn't depend
  // on them — the price stream re-renders every tick, and depending on a fresh
  // submit closure would perpetually clear & reschedule the fire timeout so it
  // never completed. The scheduler below reads these refs when the timer fires.
  // Synced in an effect (never during render) so React can track them correctly.
  const submitRef = useRef(submit);
  const canSubmitRef = useRef(canSubmit);
  useEffect(() => {
    submitRef.current = submit;
    canSubmitRef.current = canSubmit;
  });

  // Phase 1 — stage the form state from the prefill.
  useEffect(() => {
    if (!prefill || stagedFor.current === prefill) return;
    if (pairs.length === 0) return; // pairs still loading — try again next render

    const pair = resolvePair(pairs, prefill.symbol);
    if (!pair) {
      // This form can't show the asset (e.g. gold in the Simple view). Mark it
      // handled so we don't loop, and let the caller surface/redirect.
      stagedFor.current = prefill;
      firedFor.current = prefill;
      onUnavailable?.(prefill.symbol);
      return;
    }

    stagedFor.current = prefill;
    onStage?.(pair);
    setSelected(pairSymbol(pair));
    setSide(prefill.side);
    setCollateral(prefill.amount);
    // Clamp to the pair max so the form shows a valid value.
    setLeverage(String(Math.min(Number(prefill.leverage), pair.maxLeverage)));
  }, [prefill, pairs, setSelected, setSide, setCollateral, setLeverage, onUnavailable, onStage]);

  // Phase 2 — once staged and valid, fire the form's own submit after a beat.
  // We commit `firedFor` IMMEDIATELY (not in the timeout) so subsequent re-renders
  // from price ticks can't re-enter and reset the timer. The timeout reads the
  // latest submit/canSubmit from refs, and re-checks validity at fire time.
  useEffect(() => {
    if (!prefill || stagedFor.current !== prefill || firedFor.current === prefill) return;
    if (!canSubmit) return; // wait until the form's validators pass (price/quote in)

    firedFor.current = prefill;
    const id = window.setTimeout(() => {
      if (canSubmitRef.current) void submitRef.current();
    }, STAGE_VISIBLE_MS);
    return () => window.clearTimeout(id);
    // Intentionally NOT depending on `submit`: it changes every render (price
    // stream), which would clear/reschedule this timer forever. Refs above carry
    // the latest values into the timeout.
  }, [prefill, canSubmit]);
}
