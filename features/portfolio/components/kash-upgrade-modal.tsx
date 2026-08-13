"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { toast } from "@/lib/toast";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usdcTransferData } from "@/features/portfolio/lib/kash-transfer";
import {
  useKashAccount,
  useKashStatus,
  useKashSubscribe,
  useKashSubscription,
  useKashSubscriptionTiers,
} from "@/features/portfolio/hooks/use-kash";

interface KashUpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

// Subscription tiers. A wallet's tier CAPS which volume-tier rate it can earn
// at, so an upgrade is literally "earn at higher rates on big volume". Tier 1
// is free and tiers lapse at period end rather than auto-renewing — both facts
// stated in the copy, no dark patterns.
export function KashUpgradeModal({ open, onClose }: KashUpgradeModalProps) {
  const t = useTranslations("kash");
  const { data: status } = useKashStatus();
  const { wallet } = useKashAccount();
  const { data: subscription } = useKashSubscription();
  const tiers = useKashSubscriptionTiers(open);
  const subscribe = useKashSubscribe();

  const currentTier = subscription?.tier ?? 1;
  // A paid tier is settled by the subscriber's own USDC transfer, exactly like
  // a purchase — the engine verifies `from == wallet`. It is only impossible if
  // the engine did not publish where to pay.
  const needsPayment = status?.treasury.usdcMode === "ethers";
  const paymentAddress = status?.chain?.paymentAddress;
  const paymentUnsupported = needsPayment && !paymentAddress;
  const [paying, setPaying] = useState(false);
  const sendEvm = useEvmSend();

  const pick = async (tier: number) => {
    if (!wallet || subscribe.isPending || paying || paymentUnsupported) return;
    try {
      const price = tiers.data?.find((entry) => entry.tier === tier)?.priceUsd;
      let paymentTxHash: string | undefined;
      if (needsPayment && paymentAddress && status?.chain) {
        if (price === undefined) throw new Error("Tier price is unavailable.");
        setPaying(true);
        try {
          paymentTxHash = await sendEvm({
            to: status.chain.usdcAddress as `0x${string}`,
            data: usdcTransferData(paymentAddress, String(price)),
            chainId: status.chain.chainId,
          });
        } finally {
          setPaying(false);
        }
      }
      await subscribe.mutateAsync({ wallet, tier, paymentTxHash });
      toast.success(t("upgradeSuccess", { tier }));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("upgradeFailed"));
    }
  };

  return (
    <ModalShell open={open} onClose={subscribe.isPending || paying ? () => {} : onClose}>
      <div className="p-5 sm:p-6">
        <div className="ws-display text-[22px]">{t("upgradeTitle")}</div>
        <p className="mt-1 text-[13px] leading-[1.5] font-normal text-white/60">
          {t("upgradeSubtitle")}
        </p>

        {tiers.isPending ? (
          <p className="mt-4 text-[13px] font-normal text-white/50">{t("historyLoading")}</p>
        ) : tiers.isError ? (
          <p className="mt-4 text-[13px] font-normal text-white/50">{t("historyFailed")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {(tiers.data ?? []).map((tier) => {
              const isCurrent = tier.tier === currentTier;
              const isDowngrade = tier.tier < currentTier;
              return (
                <div
                  key={tier.tier}
                  className={`flex items-center justify-between rounded-[14px] border px-4 py-3 ${
                    isCurrent ? "border-amber-200/50 bg-amber-200/8" : "border-white/10 bg-white/4"
                  }`}
                >
                  <div>
                    <div className="text-[14px] font-semibold text-white/90">
                      {t("tierChip", { tier: tier.tier })}
                    </div>
                    <div className="tnum mt-0.5 text-[12px] font-normal text-white/50">
                      {tier.priceUsd === 0
                        ? t("tierFree")
                        : t("tierPrice", { price: tier.priceUsd })}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="text-[12px] font-medium text-amber-200/80">
                      {t("tierCurrent")}
                    </span>
                  ) : isDowngrade ? null : (
                    <button
                      onClick={() => pick(tier.tier)}
                      disabled={subscribe.isPending || paying || paymentUnsupported}
                      className="text-ink cursor-pointer rounded-xl bg-white px-3.5 py-2 font-sans text-[12.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("tierChoose")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {paymentUnsupported && (
          <p className="mt-3 text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
            {t("buyUnavailableOnchain")}
          </p>
        )}
        <p className="mt-3 text-[11.5px] leading-[1.5] font-normal text-white/40">
          {t("upgradeNote")}
        </p>
      </div>
    </ModalShell>
  );
}
