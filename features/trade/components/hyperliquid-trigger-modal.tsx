"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { friendlyError } from "@/lib/errors";
import type { HlPositionView, HlTriggerKind } from "@/features/trade/lib/hyperliquid-types";

export interface TriggerModalTarget {
  position: HlPositionView;
  kind: HlTriggerKind;
  /** The currently-resting trigger's price, when editing an existing one. */
  existingPrice: string | null;
  /** The currently-resting trigger's order id — replacing cancels it first. */
  existingOrderId: string | undefined;
}

interface HyperliquidTriggerModalProps {
  target: TriggerModalTarget | null;
  onClose: () => void;
  onSave: (
    position: HlPositionView,
    kind: HlTriggerKind,
    triggerPrice: string,
    existingOrderId: string | undefined
  ) => Promise<void>;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

const KIND_LABEL: Record<HlTriggerKind, string> = {
  take_profit: "take profit",
  stop_loss: "stop loss",
};

// Direction-aware placement check, mirroring the order form's bracket
// validation: a long takes profit above the market and stops out below, a
// short the other way round. The backend re-validates; catching it here
// keeps the mistake inside the modal.
function placementError(
  position: HlPositionView,
  kind: HlTriggerKind,
  price: number,
  reference: number
): string | null {
  if (!(reference > 0) || !(price > 0)) return null;
  const isLong = position.side === "long";
  if (kind === "take_profit" && (isLong ? price <= reference : price >= reference)) {
    return isLong
      ? "Take profit must be above the current price for a long."
      : "Take profit must be below the current price for a short.";
  }
  if (kind === "stop_loss" && (isLong ? price >= reference : price <= reference)) {
    return isLong
      ? "Stop loss must be below the current price for a long."
      : "Stop loss must be above the current price for a short.";
  }
  return null;
}

// One trigger per visit: enter (or adjust) a take-profit or stop-loss price
// for an open position. Replacing an existing trigger is cancel-then-place,
// composed by the caller's onSave (see hyperliquid-actions.ts).
export function HyperliquidTriggerModal({ target, onClose, onSave }: HyperliquidTriggerModalProps) {
  if (!target) return null;
  // Keyed per position+kind so each open starts with fresh state — editing
  // seeds from the existing price, adding starts blank — without a
  // set-state-in-effect re-seed.
  return (
    <TriggerModalBody
      key={`${target.position.id}:${target.kind}`}
      target={target}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function TriggerModalBody({
  target,
  onClose,
  onSave,
}: HyperliquidTriggerModalProps & { target: TriggerModalTarget }) {
  const [price, setPrice] = useState(target.existingPrice ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { position, kind } = target;
  const reference = Number(position.markPrice ?? position.entryPrice) || 0;
  const priceNum = Number(price) || 0;
  const invalid = placementError(position, kind, priceNum, reference);

  const close = () => {
    setError(null);
    setBusy(false);
    onClose();
  };

  const save = async () => {
    if (!price || invalid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(position, kind, price, target.existingOrderId);
      close();
    } catch (err) {
      setError(friendlyError(err, "Failed to update."));
      setBusy(false);
    }
  };

  return (
    <ModalShell open onClose={busy ? () => {} : close}>
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[18px] capitalize">
          {target.existingPrice ? "Edit" : "Add"} {KIND_LABEL[kind]}
        </div>
        <p className="mt-1 text-[12.5px] font-normal text-white/50">
          {position.side === "long" ? "Long" : "Short"} · entry{" "}
          <span className="tnum">{position.entryPrice}</span>
          {position.markPrice ? (
            <>
              {" "}
              · mark <span className="tnum">{position.markPrice}</span>
            </>
          ) : null}
        </p>

        <div className="ws-inset mt-4 p-3">
          <div className="mb-1 text-xs font-normal text-white/55 capitalize">
            {KIND_LABEL[kind]} price
          </div>
          <input
            autoFocus
            value={price}
            onChange={(e) => {
              const next = e.target.value.replace(/,/g, "");
              if (next === "" || DECIMAL_INPUT.test(next)) setPrice(next);
            }}
            inputMode="decimal"
            placeholder={reference > 0 ? String(reference) : "0"}
            className="tnum w-full bg-transparent text-xl text-white outline-none placeholder:text-white/30"
          />
        </div>

        {invalid ? (
          <p className="text-down mt-2 text-[11.5px] font-normal">{invalid}</p>
        ) : error ? (
          <p className="text-down mt-2 text-[11.5px] font-normal">{error}</p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={close}
            disabled={busy}
            className="cursor-pointer rounded-[14px] bg-white/8 p-3 text-[14px] font-semibold text-white/80 transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !price || Boolean(invalid)}
            className={`cursor-pointer rounded-[14px] p-3 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
              kind === "take_profit" ? "bg-up text-up-ink" : "bg-down text-down-ink"
            }`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
