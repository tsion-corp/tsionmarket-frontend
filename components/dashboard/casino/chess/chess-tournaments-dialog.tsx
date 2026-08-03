"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChessDialogFrame } from "@/components/dashboard/casino/chess/chess-dialog-frame";
import { SwissCreateForm } from "@/components/dashboard/casino/chess/swiss/create-form";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_SECONDARY_BUTTON_CLASS,
} from "@/lib/casino/chess/ui";
type CreateKind = "picker" | "swiss";

function TournamentCreatePicker({ onSwiss }: { onSwiss: () => void }) {
  return (
    <div className="space-y-5">
      <div className="text-center text-[15px] font-semibold text-white/84">
        Please select the kind of event you&apos;d like to create:
      </div>
      <div className="mx-auto max-w-[920px] space-y-3">
        <button
          type="button"
          onClick={onSwiss}
          className="flex w-full cursor-pointer items-center justify-between gap-5 rounded-[18px] border border-white/8 px-5 py-5 text-left transition-colors hover:border-white/18 hover:bg-white/4"
          style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
        >
          <div className="flex min-w-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/chesscom-icons/tournaments.svg" alt="" className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <div className="font-sans text-[17px] font-semibold tracking-[-0.03em] text-white">
                Swiss Tournament
              </div>
              <div className="mt-1 text-[14px] leading-6 text-white/62">
                Invite players to a shareable Swiss tournament and manage pairings from one place.
              </div>
            </div>
          </div>
          <span className="shrink-0 text-[28px] font-light text-white/62">›</span>
        </button>
      </div>
    </div>
  );
}

interface ChessTournamentsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChessTournamentsDialog({ open, onClose }: ChessTournamentsDialogProps) {
  const router = useRouter();
  const [createKind, setCreateKind] = useState<CreateKind>("picker");

  return (
    <ChessDialogFrame
      open={open}
      onClose={onClose}
      title="Tournaments"
      iconSrc="/chesscom-icons/tournaments.svg"
      rightAction={
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/casino/chess/swiss");
          }}
          className={`${CHESS_SECONDARY_BUTTON_CLASS} hidden px-4 py-2 text-[12px] font-semibold md:inline-flex`}
        >
          Tournament Directory
        </button>
      }
    >
      {createKind === "picker" ? (
        <TournamentCreatePicker onSwiss={() => setCreateKind("swiss")} />
      ) : (
        <div className="mx-auto max-w-[720px]">
          <button
            type="button"
            onClick={() => setCreateKind("picker")}
            className="mb-4 cursor-pointer text-[13px] text-white/62 transition-colors hover:text-white"
          >
            ← Back
          </button>
          <div
            className="rounded-[18px] border border-white/8 px-5 py-5"
            style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
          >
            <div className="mb-4 font-sans text-[19px] font-semibold tracking-[-0.03em] text-white">
              New Shareable Swiss Tournament
            </div>
            <SwissCreateForm embedded onCreated={() => onClose()} />
          </div>
        </div>
      )}
    </ChessDialogFrame>
  );
}
