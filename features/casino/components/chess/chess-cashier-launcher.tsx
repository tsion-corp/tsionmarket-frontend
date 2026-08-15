"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CashierSheet, type CashierMode } from "@/features/casino/components/chess/cashier-sheet";
import { useChessCashierStatus } from "@/features/casino/hooks/use-chess-cashier";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SECONDARY_BUTTON_CLASS,
} from "@/features/casino/lib/chess/ui";
import { cn } from "@/lib/utils";

interface ChessCashierLauncherProps {
  className?: string;
  compact?: boolean;
  title?: string;
}

// The chess cashier exists behind a sheet, but the chess surfaces need a
// stable balance entry point so staking, joining, and spectator betting are not
// dead ends when the wallet is short. This component keeps that entry identical
// across lobby, create, play, invite, and watch.
export function ChessCashierLauncher({
  className,
  compact = false,
  title,
}: ChessCashierLauncherProps) {
  const t = useTranslations("casino.chess.cashier");
  const cashier = useChessCashierStatus();
  const [mode, setMode] = useState<CashierMode | null>(null);

  if (!cashier.configured) return null;

  return (
    <>
      <div
        className={cn(
          "rounded-[16px] border border-white/6",
          compact ? "px-4 py-4" : "px-4 py-4",
          className
        )}
        style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className={cn("font-semibold text-white", compact ? "text-[14px]" : "text-[15px]")}>
            {title ?? t("title")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2.5">
            <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
              {t("available")}
            </div>
            <div className="tnum text-[14px] font-semibold text-white">
              {cashier.available} USDC
            </div>
          </div>
          <div className="rounded-[10px] border border-white/6 bg-black/10 px-3 py-2.5">
            <div className="mb-1 text-[11px] tracking-[0.05em] text-white/38 uppercase">
              {t("locked")}
            </div>
            <div className="tnum text-[14px] font-semibold text-white">{cashier.locked} USDC</div>
          </div>
        </div>

        <div className="mt-3 flex gap-2.5">
          <button
            type="button"
            onClick={() => setMode("deposit")}
            className={cn(
              CHESS_PRIMARY_BUTTON_CLASS,
              "flex-1 px-4 py-2.5 font-sans text-[12px] font-medium"
            )}
          >
            {t("deposit")}
          </button>
          <button
            type="button"
            onClick={() => setMode("withdraw")}
            className={cn(
              CHESS_SECONDARY_BUTTON_CLASS,
              "flex-1 px-4 py-2.5 font-sans text-[12px] font-medium"
            )}
          >
            {t("withdraw")}
          </button>
        </div>
      </div>

      <ModalShell
        open={mode !== null}
        onClose={() => setMode(null)}
        contentKey={`chess-cashier-${mode ?? "closed"}`}
        panelClassName={CHESS_MODAL_PANEL_CLASS}
        closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
      >
        <CashierSheet onClose={() => setMode(null)} initialMode={mode ?? "deposit"} />
      </ModalShell>
    </>
  );
}
