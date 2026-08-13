"use client";

import { useState, useRef } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";

import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/errors";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usdcAmountForPrice, usdcTransferData } from "@/features/portfolio/lib/kash-transfer";
import {
  formatUsdMicro,
  spendableUsdcMicro,
  usdToMicro,
  volumeBands,
} from "@/features/portfolio/lib/kash";
import { usePortfolio } from "@/hooks/use-portfolio";
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
  // The volume ladder is engine config; deriving it here keeps the prices,
  // bands and rates from ever disagreeing with what actually pays out.
  const bands = volumeBands(status?.points);
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
  /**
   * The tier currently being bought.
   *
   * `subscribe.isPending` alone cannot say WHICH row is working, so every
   * button dimmed at once and the user could not tell whether their click
   * registered — on a paid action that reads as a failure.
   */
  const [pendingTier, setPendingTier] = useState<number | null>(null);
  /**
   * A tier payment that settled but has not been credited yet. Same hazard as
   * the buy modal: the transfer and the subscribe call are separate steps, and
   * losing the receipt between them charges the user twice for one tier.
   * Keyed by tier, so choosing a different tier pays fresh.
   */
  const settledPayment = useRef<{ tier: number; txHash: string } | null>(null);
  const sendEvm = useEvmSend();

  // What the wallet can pay a tier with. Only a real-USDC upgrade moves a
  // token, so in mock mode there is no balance to be short of.
  // `tokens` falls back to [] while the portfolio loads or errors, which would
  // read as "no USDC" and disable the button for a funded wallet. Pass
  // undefined in both windows so the balance stays UNKNOWN rather than zero.
  const { tokens, loading: portfolioLoading, error: portfolioError } = usePortfolio();
  const knownTokens = portfolioLoading || portfolioError ? undefined : tokens;
  const balanceMicro = needsPayment ? spendableUsdcMicro(knownTokens) : null;
  const affordableMicro = (price: number): boolean => {
    const priceMicro = usdToMicro(String(price));
    // Unknown balance is not "cannot afford": a portfolio still loading must
    // never disable a tier the wallet can in fact pay for.
    return balanceMicro === null || priceMicro === null || priceMicro <= balanceMicro;
  };
  const someTierUnaffordable = (tiers.data ?? []).some(
    (tier) => tier.tier > currentTier && !affordableMicro(tier.priceUsd)
  );

  const pick = async (tier: number) => {
    if (!wallet || subscribe.isPending || paying || paymentUnsupported) return;
    setPendingTier(tier);
    try {
      const price = tiers.data?.find((entry) => entry.tier === tier)?.priceUsd;
      let paymentTxHash: string | undefined;
      if (needsPayment && paymentAddress && status?.chain) {
        if (price === undefined) throw new Error("Tier price is unavailable.");
        const alreadyPaid =
          settledPayment.current?.tier === tier ? settledPayment.current.txHash : undefined;
        if (alreadyPaid) {
          paymentTxHash = alreadyPaid;
        } else {
          setPaying(true);
          try {
            paymentTxHash = await sendEvm({
              to: status.chain.usdcAddress as `0x${string}`,
              data: usdcTransferData(paymentAddress, usdcAmountForPrice(price)),
              chainId: status.chain.chainId,
            });
            settledPayment.current = { tier, txHash: paymentTxHash };
          } finally {
            setPaying(false);
          }
        }
      }
      await subscribe.mutateAsync({ wallet, tier, paymentTxHash });
      settledPayment.current = null;
      toast.success(t("upgradeSuccess", { tier }));
      onClose();
    } catch (error) {
      // Receipt kept on purpose — see settledPayment.
      const message = friendlyError(error, t("upgradeFailed"));
      toast.error(settledPayment.current ? `${message} ${t("paymentHeldForRetry")}` : message);
    } finally {
      setPendingTier(null);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={subscribe.isPending || paying ? () => {} : onClose}
      // Each row now carries a price, a volume band and a rate. At the default
      // 440px those collide on the smallest desktop widths.
      size="lg"
    >
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
              const band = bands.find((entry) => entry.tier === tier.tier);
              const reachable = tier.tier <= currentTier;
              const unaffordable = !affordableMicro(tier.priceUsd);
              return (
                <div
                  key={tier.tier}
                  className={`rounded-[14px] border px-4 py-3 ${
                    isCurrent ? "border-amber-200/50 bg-amber-200/8" : "border-white/10 bg-white/4"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
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
                        disabled={
                          subscribe.isPending || paying || paymentUnsupported || unaffordable
                        }
                        className="text-ink flex min-w-[104px] cursor-pointer items-center justify-center rounded-xl bg-white px-3.5 py-2 font-sans text-[12.5px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {pendingTier === tier.tier ? (
                          <>
                            <ButtonSpinner />
                            {paying ? t("upgradePaying") : t("upgrading")}
                          </>
                        ) : unaffordable ? (
                          t("tierUnaffordable")
                        ) : (
                          t("tierChoose")
                        )}
                      </button>
                    )}
                  </div>

                  {/* The volume band this tier unlocks, and its rate. Without
                      these a price is just a price — the whole reason to
                      upgrade is that volume above your band is being paid at
                      your tier's rate, not the band's. */}
                  {band && (
                    <div className="mt-2.5 flex items-center justify-between border-t border-white/8 pt-2.5">
                      <span className="tnum text-[12px] font-normal text-white/45">
                        {band.toUsd === null
                          ? t("tierBandOpen", { from: band.fromUsd })
                          : t("tierBand", { from: band.fromUsd, to: band.toUsd })}
                      </span>
                      <span
                        className={`tnum text-[12px] font-medium ${
                          reachable ? "text-amber-200/90" : "text-white/35"
                        }`}
                      >
                        {t("tierRate", { rate: band.ratePer10Usd })}
                        {!reachable && <span className="ml-1.5">{t("tierLockedRate")}</span>}
                      </span>
                    </div>
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
        {/* A disabled row says "Not enough" but not what would be enough.
            Shown once for the whole list rather than per row. */}
        {balanceMicro !== null && someTierUnaffordable && (
          <p className="mt-3 text-[12.5px] leading-[1.5] font-normal text-amber-200/80">
            {t("insufficientUsd", { balance: formatUsdMicro(balanceMicro) })}
          </p>
        )}
        {/* State the cap plainly: it is the single thing that makes a tier
            worth buying, and it is not guessable from a price list. */}
        <div className="mt-4 rounded-[12px] border border-white/10 bg-white/4 px-3.5 py-3">
          <p className="text-[12px] leading-[1.55] font-normal text-white/60">
            {t("tierCapExplainer")}
          </p>
          <p className="mt-2 text-[12px] leading-[1.55] font-normal text-white/45">
            {t("tierCapExample", { current: currentTier })}
          </p>
        </div>
        <p className="mt-3 text-[11.5px] leading-[1.5] font-normal text-white/40">
          {t("upgradeNote")}
        </p>
      </div>
    </ModalShell>
  );
}
