"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_MODAL_CLOSE_BUTTON_CLASS,
  CHESS_MODAL_PANEL_CLASS,
} from "@/features/casino/lib/chess/ui";
import { cn } from "@/lib/utils";

interface ChessDialogFrameProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  rightAction?: React.ReactNode;
  tabs?: { id: string; label: string; active: boolean; onClick: () => void }[];
  children: React.ReactNode;
}

export function ChessDialogFrame({
  open,
  onClose,
  title,
  icon,
  rightAction,
  tabs,
  children,
}: ChessDialogFrameProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      contentKey={title}
      panelClassName={cn(
        CHESS_MODAL_PANEL_CLASS,
        "w-full overflow-hidden !px-0 !pt-0 !pb-0 md:w-[min(1180px,calc(100vw-40px))] md:max-h-[88vh]"
      )}
      closeButtonClassName={CHESS_MODAL_CLOSE_BUTTON_CLASS}
    >
      <div
        className="border-b border-white/8 px-6 py-5 md:px-8"
        style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
      >
        <div className="flex items-center justify-between gap-4 pr-10">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/8 text-white/80">
              {icon}
            </span>
            <div className="min-w-0">
              <div className="truncate font-sans text-[18px] font-semibold tracking-[-0.02em] text-white">
                {title}
              </div>
            </div>
          </div>
          {rightAction}
        </div>

        {tabs ? (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={tab.onClick}
                className={`cursor-pointer rounded-full px-4 py-2 font-sans text-[13px] font-semibold transition-colors ${
                  tab.active
                    ? "bg-white/12 text-white"
                    : "border border-white/12 bg-white/4 text-white/75 hover:border-white/24 hover:bg-white/8 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="max-h-[calc(88vh-150px)] overflow-y-auto px-6 py-6 md:px-8 md:py-7">
        {children}
      </div>
    </ModalShell>
  );
}
