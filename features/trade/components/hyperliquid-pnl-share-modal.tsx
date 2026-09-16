"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  drawPnlCard,
  pnlCardFileName,
  pnlCardModel,
  PNL_CARD_HEIGHT,
  PNL_CARD_WIDTH,
} from "@/features/trade/lib/pnl-card";
import type { HlClosedPositionView } from "@/features/trade/lib/hyperliquid-types";

interface HyperliquidPnlShareModalProps {
  open: boolean;
  onClose: () => void;
  position: HlClosedPositionView | null;
}

// The classic perps share card: the closed trade rendered as an image the
// user can post. Drawn client-side on a canvas — nothing leaves the browser
// unless the user shares it themselves.
export function HyperliquidPnlShareModal({
  open,
  onClose,
  position,
}: HyperliquidPnlShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open || !position) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawPnlCard(ctx, pnlCardModel(position));
  }, [open, position]);

  const close = () => {
    setStatus(null);
    onClose();
  };

  if (!position) return null;
  const model = pnlCardModel(position);

  const toBlob = (): Promise<Blob | null> =>
    new Promise(
      (resolve) => canvasRef.current?.toBlob((b) => resolve(b), "image/png") ?? resolve(null)
    );

  const download = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = pnlCardFileName(model);
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Saved.");
  };

  const share = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], pnlCardFileName(model), { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      // Native share exists but can't take files (some desktop browsers) —
      // fall back to saving, which is what the user can actually post.
      await download();
    } catch {
      // Share sheet dismissed — not an error worth surfacing.
    }
  };

  return (
    <ModalShell open={open} onClose={close} size="lg">
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[20px]">Share your trade</div>
        <p className="mt-1 text-[12.5px] leading-normal font-normal text-white/50">
          {model.symbol} {model.sideLabel.toLowerCase()} · {model.roiLabel} return
        </p>

        <canvas
          ref={canvasRef}
          width={PNL_CARD_WIDTH}
          height={PNL_CARD_HEIGHT}
          className="mt-4 h-auto w-full rounded-2xl border border-white/10"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => void download()}
            className="cursor-pointer rounded-[14px] bg-white/10 p-3.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-white/16"
          >
            Download
          </button>
          <button
            onClick={() => void share()}
            className="bg-up text-up-ink cursor-pointer rounded-[14px] p-3.5 text-[14.5px] font-semibold transition-opacity hover:opacity-90"
          >
            {canNativeShare ? "Share" : "Save image"}
          </button>
        </div>
        {status ? (
          <p className="mt-2 text-center text-xs font-normal text-white/50">{status}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}
