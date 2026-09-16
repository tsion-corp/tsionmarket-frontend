"use client";

import { useLocale, useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { NetworkIcon } from "@/components/ui/network-icon";
import {
  activityTxHash,
  isPendingActivity,
  memeLogoUrl,
} from "@/features/portfolio/lib/meme-positions";
import { explorerTxUrl, networkOf } from "@/lib/meme/chain";
import { formatQuantity, formatUsdString } from "@/lib/meme/decimal";
import { PLATFORM_FEE_SYMBOL, formatUsdcAtomic } from "@/lib/meme/format";
import type { TradeActivity, TradeActivityStatus } from "@/lib/meme/types";
import { tokenBg } from "@/lib/trade/assets";

const STATUS_KEY: Record<TradeActivityStatus, string> = {
  AWAITING_SUBMISSION: "statusAwaitingSubmission",
  SUBMITTED: "statusSubmitted",
  CONFIRMING: "statusConfirming",
  CONFIRMED: "statusConfirmed",
  FAILED: "statusFailed",
  REVERTED: "statusReverted",
  EXPIRED: "statusExpired",
  CANCELLED: "statusCancelled",
};

function statusTone(status: TradeActivityStatus): string {
  if (status === "CONFIRMED") return "bg-up/15 text-up";
  if (status === "FAILED" || status === "REVERTED") return "bg-down/15 text-down";
  if (isPendingActivity(status)) return "bg-amber-200/10 text-amber-200/80";
  return "bg-white/8 text-white/60";
}

/**
 * One swap from the service's activity feed: what was sold for what, its USD
 * size, the platform fee, its status, and a link to the transaction when the
 * service has one. A pending trade says it is not in the holdings yet: the
 * portfolio counts confirmed swaps only. The service's failure wording is not
 * shown; the status says what happened.
 */
export function MemeActivityRow({ activity }: { activity: TradeActivity }) {
  const t = useTranslations("memePositions");
  const locale = useLocale();
  const symbol = activity.tokenSymbol ?? activity.tokenName ?? activity.tokenAddress.slice(0, 6);
  const buying = activity.side === "BUY";
  const side = buying ? t("sideBuy") : t("sideSell");
  const sold = formatQuantity(activity.sellAmount) ?? activity.sellAmount;
  const bought = formatQuantity(activity.buyAmount) ?? activity.buyAmount;
  const amounts = buying
    ? `${sold} ${PLATFORM_FEE_SYMBOL} → ${bought} ${symbol}`
    : `${sold} ${symbol} → ${bought} ${PLATFORM_FEE_SYMBOL}`;
  // Every platform fee settles in USDC. The USD figure when the service sent
  // one, otherwise the base-unit amount read as USDC; neither is ever guessed.
  const feeUsd = formatUsdString(activity.platformFeeAmountUsd);
  const feeAtomic =
    activity.platformFeeAmountAtomic === null
      ? null
      : formatUsdcAtomic(activity.platformFeeAmountAtomic);
  const fee = feeUsd
    ? t("fee", { fee: feeUsd })
    : feeAtomic
      ? t("fee", { fee: `${feeAtomic} ${PLATFORM_FEE_SYMBOL}` })
      : t("feeUnknown");
  const txUrl = explorerTxUrl(activity.chainId, activityTxHash(activity));
  const when = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(activity.confirmedAt ?? activity.createdAt));

  return (
    <li
      aria-label={t("tradeLabel", { side, symbol })}
      className="flex items-center gap-3 border-t border-white/6 py-3.5"
    >
      <span className="relative shrink-0">
        <AssetIcon
          sym={symbol}
          bg={tokenBg(symbol)}
          logo={memeLogoUrl(activity.chain, activity.tokenAddress, activity.tokenLogoUrl)}
          fallback="gradient"
        />
        <span className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-[#0d0d0f] p-[1.5px]">
          <NetworkIcon network={networkOf(activity.chainId) ?? "base-mainnet"} size={14} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`shrink-0 font-sans text-[13px] font-semibold ${buying ? "text-up" : "text-down"}`}
          >
            {side}
          </span>
          <span className="tnum truncate font-sans text-[13.5px] font-medium text-white/90">
            {amounts}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-normal text-white/45">
          <span>{when}</span>
          <span>{fee}</span>
          {txUrl ? (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/65 underline-offset-2 hover:text-white hover:underline"
            >
              {t("viewTx")}
            </a>
          ) : null}
        </span>
        {isPendingActivity(activity.status) ? (
          <span className="mt-0.5 block text-[11.5px] font-normal text-amber-200/80">
            {t("pendingNote")}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="tnum font-sans text-[14.5px] font-medium">
          {formatUsdString(activity.usdAmount) ?? "—"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(activity.status)}`}
        >
          {t(STATUS_KEY[activity.status])}
        </span>
      </span>
    </li>
  );
}
