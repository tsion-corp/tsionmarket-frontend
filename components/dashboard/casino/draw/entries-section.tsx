"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClaimDrawPrize, useMyDrawEntries } from "@/hooks/use-casino-draw";
import { useCasinoWallet } from "@/hooks/use-casino-wallet";
import { useClaimedOnce } from "@/hooks/use-claimed-once";
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
  const t = useTranslations("casino.entries");
  const wallet = useCasinoWallet();
  const { entries, isLoading, error } = useMyDrawEntries();
  const claim = useClaimDrawPrize();
  // A won entry carries no "claimed" field, so the service reports it as won
  // and prize-bearing forever. Without this the button came back armed after a
  // successful claim and could be tapped again on money already paid out.
  const { hasClaimed, markClaimed } = useClaimedOnce();
  // Which entry is in flight. The mutation object is shared across every row,
  // so keying off claim.isPending disabled ALL of them during one claim.
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const onClaim = async (entryId: string) => {
    const id = toast.loading(t("toastClaiming"));
    setClaimingId(entryId);
    try {
      await claim.mutateAsync(entryId);
      markClaimed(entryId);
      toast.success(t("toastClaimed"), { id });
    } catch (e) {
      toast.error(friendlyError(e, t("toastClaimFailed")), { id });
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-8 pb-20 sm:px-6">
      <div className="ws-display mb-5 text-[24px]">{t("title")}</div>

      {error ? (
        <CasinoError error={error} subject={t("subject")} />
      ) : isLoading ? (
        <CasinoLoading label={t("loading")} rows={3} />
      ) : entries.length === 0 ? (
        <CasinoEmpty>{t("empty")}</CasinoEmpty>
      ) : (
        entries.map((e) => {
          const matched = e.matchedNumbers ?? [];
          const prizeUsd = amountUsd(e.prize, wallet.unitPriceUsd);
          return (
            <div key={e.id} className="ws-glass mb-3 rounded-[14px] px-5 py-4.5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="text-[12px] font-normal text-white/50">
                  {e.state === "open"
                    ? t("openEntry")
                    : e.state === "won"
                      ? t(e.bonusMatched ? "wonWithBonus" : "won", { count: matched.length })
                      : t("noMatch")}
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
                hasClaimed(e.id) ? (
                  // Says what happened rather than leaving a blank where the
                  // button was: a prize that silently vanishes reads as a bug.
                  <div className="text-up mt-3 text-[12.5px] font-semibold">
                    {t("claimedLabel")}
                  </div>
                ) : (
                  <button
                    onClick={() => void onClaim(e.id)}
                    disabled={claimingId !== null}
                    className="text-ink mt-3 cursor-pointer rounded-full bg-white px-4 py-2 font-sans text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {claimingId === e.id ? t("claiming") : t("claimPrize")}
                  </button>
                )
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
