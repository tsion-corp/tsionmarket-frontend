"use client";

import { useTranslations } from "next-intl";
import { AddToMetaMaskButton } from "@/features/portfolio/components/add-to-metamask-button";
import { useKashAccount, useKashStatus } from "@/features/portfolio/hooks/use-kash";
import { formatKashAmount } from "@/features/portfolio/lib/kash";

// The whole card background from the mobile comp (node 1:1565): the yellow
// gradient, the cloud bank, the sparkle field, and the rounded border, exported
// as one card-aligned image. The live content is layered on top.
const DECOR = "/kash/kash-card-decor.png";
// The Kash+ coin, the same gold mark the desktop card and banner use.
const COIN = "/kash/kash-plus-coin.png";

// The comp's icons, kept as their exact vectors. currentColor lets one glyph
// serve the black pills and the white Convert pill. The card is 431px wide, so
// every size below is written in cqw (1cqw = 1% of the card) and scales with
// it: the layout stays pixel-exact at any rendered width.
function ArrowDownGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M13.0306 9.53063L8.53063 14.0306C8.46095 14.1005 8.37815 14.156 8.28699 14.1939C8.19583 14.2317 8.09809 14.2512 7.99938 14.2512C7.90066 14.2512 7.80293 14.2317 7.71176 14.1939C7.6206 14.156 7.5378 14.1005 7.46813 14.0306L2.96813 9.53063C2.82723 9.38973 2.74807 9.19863 2.74807 8.99938C2.74807 8.80012 2.82723 8.60902 2.96813 8.46813C3.10902 8.32723 3.30012 8.24807 3.49938 8.24807C3.69863 8.24807 3.88973 8.32723 4.03063 8.46813L7.25 11.6875V2.5C7.25 2.30109 7.32902 2.11032 7.46967 1.96967C7.61032 1.82902 7.80109 1.75 8 1.75C8.19891 1.75 8.38968 1.82902 8.53033 1.96967C8.67098 2.11032 8.75 2.30109 8.75 2.5V11.6875L11.9694 8.4675C12.1103 8.3266 12.3014 8.24745 12.5006 8.24745C12.6999 8.24745 12.891 8.3266 13.0319 8.4675C13.1728 8.6084 13.2519 8.79949 13.2519 8.99875C13.2519 9.19801 13.1728 9.3891 13.0319 9.53L13.0306 9.53063Z" />
    </svg>
  );
}

function ArrowsLeftRightGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M13.5306 11.5306L11.5306 13.5306C11.3897 13.6715 11.1986 13.7507 10.9994 13.7507C10.8001 13.7507 10.609 13.6715 10.4681 13.5306C10.3272 13.3897 10.2481 13.1986 10.2481 12.9994C10.2481 12.8001 10.3272 12.609 10.4681 12.4681L11.1875 11.75H3C2.80109 11.75 2.61032 11.671 2.46967 11.5303C2.32902 11.3897 2.25 11.1989 2.25 11C2.25 10.8011 2.32902 10.6103 2.46967 10.4697C2.61032 10.329 2.80109 10.25 3 10.25H11.1875L10.4675 9.53063C10.3266 9.38973 10.2474 9.19863 10.2474 8.99938C10.2474 8.80012 10.3266 8.60902 10.4675 8.46813C10.6084 8.32723 10.7995 8.24807 10.9987 8.24807C11.198 8.24807 11.3891 8.32723 11.53 8.46813L13.53 10.4681C13.6 10.5378 13.6555 10.6205 13.6934 10.7117C13.7313 10.8028 13.7508 10.9005 13.7509 10.9992C13.751 11.098 13.7315 11.1957 13.6937 11.2869C13.6559 11.3781 13.6005 11.4609 13.5306 11.5306ZM4.46812 7.53062C4.60902 7.67152 4.80012 7.75068 4.99937 7.75068C5.19863 7.75068 5.38973 7.67152 5.53062 7.53062C5.67152 7.38973 5.75068 7.19863 5.75068 6.99937C5.75068 6.80012 5.67152 6.60902 5.53062 6.46812L4.8125 5.75H13C13.1989 5.75 13.3897 5.67098 13.5303 5.53033C13.671 5.38968 13.75 5.19891 13.75 5C13.75 4.80109 13.671 4.61032 13.5303 4.46967C13.3897 4.32902 13.1989 4.25 13 4.25H4.8125L5.53062 3.53063C5.67152 3.38973 5.75068 3.19863 5.75068 2.99938C5.75068 2.80012 5.67152 2.60902 5.53062 2.46813C5.38973 2.32723 5.19863 2.24807 4.99937 2.24807C4.80012 2.24807 4.60902 2.32723 4.46812 2.46813L2.46813 4.46812C2.39821 4.5378 2.34273 4.6206 2.30487 4.71176C2.26702 4.80292 2.24753 4.90066 2.24753 4.99937C2.24753 5.09809 2.26702 5.19582 2.30487 5.28699C2.34273 5.37815 2.39821 5.46095 2.46813 5.53062L4.46812 7.53062Z" />
    </svg>
  );
}

function ApproxEqualsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M13.885 9.57875C13.9697 9.68037 14.0107 9.81143 13.999 9.94323C13.9873 10.075 13.9238 10.1968 13.8225 10.2819C12.7375 11.1806 11.7687 11.5 10.885 11.5C9.72375 11.5 8.70875 10.9494 7.76437 10.4375C6.18 9.57812 4.81187 8.83563 2.8225 10.4838C2.77236 10.5282 2.71379 10.5621 2.65029 10.5835C2.58678 10.6049 2.51962 10.6132 2.45281 10.6081C2.386 10.603 2.32089 10.5846 2.26136 10.5538C2.20183 10.5231 2.14908 10.4807 2.10626 10.4291C2.06344 10.3776 2.03141 10.318 2.01208 10.2538C1.99276 10.1897 1.98652 10.1223 1.99375 10.0557C2.00098 9.98904 2.02152 9.92455 2.05416 9.86603C2.0868 9.80751 2.13087 9.75615 2.18375 9.715C4.69437 7.63563 6.57875 8.6575 8.24187 9.56C9.82625 10.4194 11.1944 11.1613 13.1837 9.51313C13.2857 9.42934 13.4165 9.38922 13.5479 9.40151C13.6792 9.41381 13.8004 9.47751 13.885 9.57875ZM2.8225 6.4875C4.81187 4.83938 6.18 5.58125 7.76437 6.44063C8.70875 6.95313 9.72375 7.50313 10.885 7.50313C11.7687 7.50313 12.7375 7.18375 13.8225 6.285C13.8754 6.24385 13.9194 6.19249 13.9521 6.13397C13.9847 6.07545 14.0053 6.01096 14.0125 5.94435C14.0197 5.87773 14.0135 5.81034 13.9942 5.74619C13.9748 5.68203 13.9428 5.62241 13.9 5.57087C13.8572 5.51933 13.8044 5.47693 13.7449 5.44618C13.6854 5.41543 13.6203 5.39695 13.5534 5.39186C13.4866 5.38676 13.4195 5.39515 13.356 5.41652C13.2925 5.43789 13.2339 5.4718 13.1837 5.51625C11.1944 7.16438 9.82625 6.42188 8.24187 5.5625C6.57875 4.66062 4.69437 3.63813 2.18375 5.7175C2.08986 5.80421 2.03273 5.92357 2.02411 6.05109C2.01548 6.1786 2.05601 6.30457 2.13737 6.40314C2.21873 6.5017 2.33475 6.56536 2.46158 6.58105C2.58842 6.59674 2.71645 6.56326 2.81938 6.4875H2.8225Z" />
    </svg>
  );
}

interface KashCardMobileProps {
  onBuy: () => void;
  onConvert: () => void;
  onHistory: () => void;
}

// The mobile Kash+ balance card, the bright treatment from the comp (node
// 1:1565). The dark KashCard still serves `sm` and up; this stands in on a
// phone. Same rewards data, same actions: the coin balance up top, the unit
// price under it, and Buy / Convert along the bottom.
export function KashCardMobile({ onBuy, onConvert, onHistory }: KashCardMobileProps) {
  const t = useTranslations("kash");
  const { data: account, isError, walletMissing } = useKashAccount();
  const { data: status } = useKashStatus();

  // An unknown balance must never render as zero: someone who holds KASH would
  // read "0 KASH+" as their money gone, and loading/no-wallet/error all leave
  // account undefined. Distinguish those states instead, like the desktop card.
  const unavailable = !account && (isError || walletMissing);
  const loading = !account && !unavailable;

  const balanceDisplay = formatKashAmount(account?.balance ?? "0");
  const unitPrice = status?.price.kashPriceUsd;

  return (
    <div
      data-tour="kash"
      data-sensitive="balance"
      // Fills the carousel slide so it stands exactly as tall as the balance
      // card beside it; min-height keeps the comp's 431:243 ratio when it has
      // no slide to fill. The background is the decoration's own top color, so
      // any height above the artwork reads as more of the same sky.
      className="@container relative h-full min-h-[56.4cqw] w-full overflow-hidden rounded-[22px] bg-[#fce482] shadow-[0_0_0_2px_#fce482]"
    >
      {/* The comp's gradient, cloud bank, sparkle field, and border, exported
          as one image and anchored to the bottom so the clouds stay put while
          the sky grows above them. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DECOR}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -inset-[4px] block h-[calc(100%+8px)] w-[calc(100%+8px)]"
      />

      <div className="absolute inset-0 flex flex-col px-[7.9cqw] pt-[7.2cqw] pb-[13.9cqw] text-black">
        {/* Top row: coin + title on the left, History + MetaMask on the right */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-[1.9cqw]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COIN} alt="" className="h-[5.8cqw] w-[5.8cqw]" />
            <span className="text-[3.25cqw] font-medium">{t("balanceTitle")}</span>
          </span>
          <span className="flex items-center gap-[2.3cqw]">
            <button
              onClick={onHistory}
              className="cursor-pointer text-[3.25cqw] font-medium transition-opacity hover:opacity-70"
            >
              {t("history")}
            </button>
            <AddToMetaMaskButton bare iconSize={22} />
          </span>
        </div>

        {/* Balance, centered in the space between the header and the actions */}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {loading ? (
            // Hold the figure's space with a skeleton rather than a "0" the read
            // has not confirmed.
            <div className="h-[9.3cqw] w-[38cqw] animate-pulse rounded-[2cqw] bg-black/10" />
          ) : unavailable ? (
            <p className="max-w-[82%] text-[3.25cqw] leading-[1.4] font-medium text-black/60">
              {walletMissing ? t("balanceNoWallet") : t("balanceUnavailable")}
            </p>
          ) : (
            <>
              <div className="tnum ws-display text-[9.3cqw] leading-none font-bold tracking-[-0.02em] whitespace-nowrap">
                {balanceDisplay} KASH+
              </div>
              {unitPrice && (
                <div className="mt-[3.5cqw] flex items-center justify-center gap-[1cqw] text-[2.7cqw] font-medium text-black/55">
                  <span>1 KASH</span>
                  <ApproxEqualsGlyph className="h-[3.2cqw] w-[3.2cqw]" />
                  <span className="tnum">${unitPrice}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions, above the cloud bank */}
        <div className="grid grid-cols-2 gap-[1.9cqw]">
          {/* Send is off the card for now. The modal and its wiring stay; only
              the door is gone, so restoring it is this one pill. */}
          <button
            onClick={onBuy}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white py-[14px] text-[15px] font-semibold text-black shadow-[0_1.6px_3.3px_rgba(90,60,0,0.18)] transition-transform active:scale-[0.98]"
          >
            <ArrowDownGlyph className="h-[3.7cqw] w-[3.7cqw]" />
            {t("buy")}
          </button>
          <button
            onClick={onConvert}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-black py-[14px] text-[15px] font-semibold text-white shadow-[0_1.6px_3.3px_rgba(0,0,0,0.28)] transition-transform active:scale-[0.98]"
          >
            <ArrowsLeftRightGlyph className="h-[3.7cqw] w-[3.7cqw]" />
            {t("convert")}
          </button>
        </div>
      </div>
    </div>
  );
}
