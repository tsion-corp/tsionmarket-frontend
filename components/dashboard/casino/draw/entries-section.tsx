"use client";

import { useClaimDrawPrize, useMyDrawEntries } from "@/hooks/use-casino-draw";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import {
  CasinoEmpty,
  CasinoError,
  CasinoLoading,
} from "@/components/dashboard/casino/casino-state";
import { NumberChip } from "@/components/dashboard/casino/draw/number-chip";
import { amountUsd } from "@/lib/casino/money";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

export function EntriesSection() {
  const wallet = useCasinoWallet();
  const { entries, isLoading, error } = useMyDrawEntries();
  const claim = useClaimDrawPrize();

  const onClaim = async (entryId: string) => {
    const id = toast.loading("Claiming your prize…");
    try {
      await claim.mutateAsync(entryId);
      toast.success("Prize claimed — added to your balance.", { id });
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't claim that prize."), { id });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-8 pb-20 sm:px-6">
      <div className="ws-display mb-5 text-[24px]">My entries</div>

      {error ? (
        <CasinoError error={error} subject="your entries" />
      ) : isLoading ? (
        <CasinoLoading label="Loading your entries" rows={3} />
      ) : entries.length === 0 ? (
        <CasinoEmpty>No entries yet. Pick your numbers in the draw to enter.</CasinoEmpty>
      ) : (
        entries.map((e) => {
          const matched = e.matchedNumbers ?? [];
          const prizeUsd = amountUsd(e.prize, wallet.unitPriceUsd);
          return (
            <div key={e.id} className="ws-glass mb-3 rounded-[14px] px-5 py-4.5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="text-[12px] font-normal text-white/50">
                  {e.state === "open"
                    ? "This draw · entry locked in"
                    : e.state === "won"
                      ? `Won · ${matched.length} matched${e.bonusMatched ? " + bonus" : ""}`
                      : "No match this time"}
                </div>
                {e.state === "won" && e.prize ? (
                  <div className="ws-display tnum text-grey-100 text-[18px]">
                    {wallet.format(prizeUsd)}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {e.mainNumbers.map((num) => (
                  <NumberChip
                    key={num}
                    num={num}
                    variant={matched.includes(num) ? "matched" : "plain"}
                  />
                ))}
                <NumberChip num={e.bonusNumber} variant="bonus" />
              </div>
              {e.state === "won" && e.prize ? (
                <button
                  onClick={() => void onClaim(e.id)}
                  disabled={claim.isPending}
                  className="text-ink mt-3 cursor-pointer rounded-full bg-white px-4 py-2 font-sans text-[12.5px] font-bold disabled:opacity-50"
                >
                  {claim.isPending ? "Claiming…" : "Claim prize"}
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
