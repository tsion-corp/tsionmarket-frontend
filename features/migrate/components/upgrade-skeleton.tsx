"use client";

import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-frame";

/**
 * The card before its words: art strip, mark, two lines, a pill.
 *
 * Shown while the offer is being decided (the gate) and while the sheet's
 * chunk — the panel and the old provider's SDK — is still downloading after
 * "Finish upgrading" was tapped. Both used to show nothing at all, and
 * nothing for a second reads as a tap that did not work.
 */
const noop = () => {};

/** The card's shape, before its words: art strip, mark, two lines, a pill. */
export function UpgradeSkeleton() {
  return (
    <MoveOldMoneyFrame dismissible={false} onClose={noop}>
      <div aria-busy="true" aria-label="Checking your account" className="animate-pulse">
        <div className="aspect-[598/149] w-full bg-[#232323]" />
        <div className="flex flex-col items-center px-[26px] pt-6 pb-[26px]">
          <div className="h-[18px] w-[140px] rounded bg-white/10" />
          <div className="mt-5 h-[30px] w-[78%] rounded bg-white/12" />
          <div className="mt-2 h-[30px] w-[52%] rounded bg-white/12" />
          <div className="mt-4 h-[15px] w-[86%] rounded bg-white/8" />
          <div className="mt-2 h-[15px] w-[70%] rounded bg-white/8" />
          <div className="mt-6 h-[42px] w-[62%] rounded-full bg-white/6" />
          <div className="mt-8 h-px w-full bg-white/10" />
          <div className="mt-6 h-[52px] w-full rounded-full bg-white/10" />
          <div className="mt-6 h-[14px] w-[44%] rounded bg-white/8" />
        </div>
      </div>
    </MoveOldMoneyFrame>
  );
}
